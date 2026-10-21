// Reads a conversation after each customer message and keeps the result on the lead: what they want, urgency,
// budget, concerns, buying signals, a summary, the owner's next step and a heat score.
// The owner is alerted once when a lead turns hot, and once for each concern the brand brain cannot answer.
import type { PoolClient } from "pg";
import { automationConfig } from "../config";
import { withTenant } from "../db";
import { aiEnabled, readConversationWithAi } from "../ai";
import { recordAiUse, reserveAiCall } from "../aiUsage";
import { logActivity, notify } from "../activity";
import { enqueue, PermanentError, type ClaimedJob } from "../queue";
import { concernLabel, heatBand, mergeReadings, nextStepFor, readWithRules, scoreLead, urgencyLabel, worthReading, type Insight, type Turn } from "../insight";
import { clip } from "./assistant";
import { getLead, leadLabel, loadContext, type Lead } from "./context";

/** Queues a reading of this conversation. A burst of messages is read once, a few seconds after the last. */
export async function scheduleReading(c: PoolClient, workspaceId: string, leadId: string) {
  await enqueue(c, {
    workspaceId,
    kind: "lead_insight",
    leadId,
    runAt: new Date(Date.now() + automationConfig.insight.debounceSeconds * 1000),
    dedupeKey: `insight:${leadId}`,
    maxAttempts: 2,
  });
}

export function isPaidSource(lead: Pick<Lead, "utm_medium">): boolean {
  const medium = (lead.utm_medium ?? "").toLowerCase().trim();
  return Boolean(medium) && automationConfig.scoring.paidMediums.includes(medium);
}

async function conversationTurns(c: PoolClient, leadId: string): Promise<Turn[]> {
  const { rows } = await c.query<{ direction: "in" | "out"; body: string }>(
    `select direction, body from messages where lead_id = $1 and status not in ('discarded', 'pending_approval')
     order by created_at desc, id desc limit $2`,
    [leadId, automationConfig.insight.recentMessages],
  );
  return rows.reverse().map((r) => ({ from: r.direction === "in" ? "customer" : "business", text: r.body }));
}

/** Reads one lead now. Exported so tests and the owner's "read again" can run it directly. */
export async function readLead(workspaceId: string, leadId: string): Promise<{ insight: Insight; heat: number; source: "rules" | "ai" } | null> {
  return withTenant(workspaceId, async (c) => {
    const ctx = await loadContext(c, workspaceId);
    const lead = await getLead(c, leadId);
    if (!ctx || !lead) return null;
    const turns = await conversationTurns(c, leadId);
    const customerTurns = turns.filter((t) => t.from === "customer");
    if (customerTurns.length === 0) return null;
    const customerText = customerTurns.map((t) => t.text).join("\n");

    const rules = readWithRules({
      turns,
      qualifierAnswers: lead.qualifier_answers,
      services: ctx.brain.services.map((s) => s.name),
      stage: lead.stage,
    });
    let reading = rules;
    let source: "rules" | "ai" = "rules";
    const latest = customerTurns[customerTurns.length - 1].text;
    if (aiEnabled() && !lead.opted_out_at && worthReading(latest) && (await reserveAiCall(c, workspaceId, leadId))) {
      const ai = await readConversationWithAi({
        businessName: ctx.businessName,
        niche: ctx.pack.name,
        services: ctx.brain.services.map((s) => s.name),
        qualifiers: ctx.pack.qualifiers,
        conversation: turns,
      });
      if (ai) {
        reading = mergeReadings(ai, rules, customerText);
        source = "ai";
        await recordAiUse(c, workspaceId, "ai_read");
      }
    }

    const { heat, reasons } = scoreLead(reading, {
      stage: lead.stage,
      answered: lead.qualifier_answers.length,
      totalQualifiers: ctx.pack.qualifiers.length,
      paidSource: isPaidSource(lead),
      customerMessages: customerTurns.length,
    });
    const insight: Insight & { reasons: string[] } = { ...reading, nextStep: nextStepFor(reading, { stage: lead.stage, heat, brain: ctx.brain }), reasons };
    await c.query("update leads set insight = $2, insight_source = $3, insight_at = now(), heat = $4 where id = $1", [
      leadId,
      JSON.stringify(insight),
      source,
      heat,
    ]);

    const who = leadLabel(lead);
    const link = `/inbox/${leadId}`;
    const open = !["won", "lost", "booked"].includes(lead.stage);

    if (open && heatBand(heat) === "hot" && !lead.hot_alerted_at) {
      await c.query("update leads set hot_alerted_at = now() where id = $1", [leadId]);
      await notify(c, workspaceId, {
        kind: "hot_lead",
        title: `Hot lead: ${who} (${heat} out of 100)`,
        body: [
          insight.summary,
          `${urgencyLabel[insight.urgency]}.${insight.budget ? ` Budget: ${insight.budget}.` : ""}`,
          insight.signals[0] ? `They said: "${clip(insight.signals[0], 160)}"` : null,
          `Next: ${insight.nextStep}`,
        ]
          .filter(Boolean)
          .join("\n"),
        link,
        // A conversation already handed over was emailed then; the hot alert stays in the app.
        email: lead.stage !== "handoff",
      });
      await logActivity(c, workspaceId, { leadId, kind: "hot_lead", summary: `${who} turned hot at ${heat} out of 100`, detail: { reasons } });
    }

    const fresh = insight.concerns.filter((x) => !lead.concerns_alerted.includes(x.type));
    if (fresh.length) {
      await c.query("update leads set concerns_alerted = concerns_alerted || $2::text[] where id = $1", [leadId, fresh.map((x) => x.type)]);
      for (const concern of fresh) {
        const answered = Boolean(ctx.brain.objections[concern.type]);
        await logActivity(c, workspaceId, {
          leadId,
          kind: "concern",
          summary: `${who} raised ${concernLabel[concern.type]}${answered ? ". The assistant has your answer for this." : ". You have no answer for this in the brand brain yet."}`,
          detail: { type: concern.type, quote: concern.quote },
        });
        if (!answered && open && lead.stage !== "handoff") {
          // A conversation already handed over has alerted the owner; this would be a second alert.
          await notify(c, workspaceId, {
            kind: "concern",
            title: `${who} is unsure about ${concernLabel[concern.type]}`,
            body: `They said: "${clip(concern.quote, 200)}"\nAnswer them yourself, then add your answer under Concerns in the brand brain so the assistant can answer this next time.`,
            link,
          });
        }
      }
    }
    return { insight, heat, source };
  });
}

export async function leadInsight(job: ClaimedJob) {
  if (!job.lead_id) throw new PermanentError("Reading has no lead.");
  await readLead(job.workspace_id, job.lead_id);
}
