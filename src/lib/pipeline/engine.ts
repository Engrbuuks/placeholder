// The conversation engine: what happens when a customer sends a message.
//
// 1. Record the message once (webhooks can arrive twice) and lock the lead so messages are handled in order.
// 2. Stop if automation is off, the brand brain is not confirmed, or a person already owns the conversation.
// 3. Hand over at once on a handoff phrase (asks for a person, complaint, emergency).
// 4. Otherwise greet, answer any question from the brand brain, and work through the niche's qualifying questions.
// 5. Queue the reply, schedule the no reply follow up, alert the owner when needed, then deliver.
import { automationConfig, everyLanguage } from "../config";
import type { PoolClient } from "pg";
import { withTenant } from "../db";
import { aiEnabled, answerWithAi } from "../ai";
import { logActivity, notify } from "../activity";
import { cancelLeadJobs, enqueue } from "../queue";
import { render, firstName } from "../templates";
import { answerFromBrain, clip, detectHandoff, extractContact, factsText, isKeywordMessage, isQuestion, pricesAreGrounded } from "./assistant";
import { loadContext, leadLabel, type Lead } from "./context";
import { deliverMessage } from "./delivery";
import { scheduleChainedStep } from "./sequences";

export type InboundInput = {
  workspaceId: string;
  channel: "webchat" | "whatsapp" | "sms";
  externalId: string;
  text: string;
  externalMessageId?: string | null;
  name?: string | null;
};

export type InboundResult = {
  duplicate: boolean;
  leadId: string | null;
  replied: boolean;
  outgoingIds: string[];
  reason: string;
};

const automatedStages = new Set(["new", "qualifying", "qualified"]);

/**
 * Reserves one Claude call against the workspace's monthly cap. Returns false once the cap is reached,
 * so the question goes to the owner instead. The owner is told once, when the last allowed call is used.
 */
export async function reserveAiCall(c: PoolClient, workspaceId: string, leadId: string | null): Promise<boolean> {
  const limit = automationConfig.ai.monthlyCallsPerWorkspace;
  if (limit <= 0) return false;
  const { rows } = await c.query<{ calls: number }>(
    `insert into ai_usage (workspace_id, month, calls)
     values ($1, date_trunc('month', now() at time zone 'utc')::date, 1)
     on conflict (workspace_id, month) do update set calls = ai_usage.calls + 1
     where ai_usage.calls < $2
     returning calls`,
    [workspaceId, limit],
  );
  if (rows.length === 0) return false;
  if (rows[0].calls === limit) {
    await logActivity(c, workspaceId, {
      leadId,
      kind: "ai_cap",
      summary: `AI answers reached this month's limit of ${limit}. New questions the rules cannot answer will come to you until next month.`,
    });
  }
  return true;
}

async function findAnswer(
  c: PoolClient,
  workspaceId: string,
  leadId: string,
  text: string,
  ctx: Awaited<ReturnType<typeof loadContext>> & object,
  recent: { from: "customer" | "business"; text: string }[],
) {
  const ruled = answerFromBrain(text, ctx.brain, ctx.pack);
  if (ruled) return { answer: ruled, source: "rules" as const };
  if (!aiEnabled()) return { answer: null, source: "rules" as const };
  if (!(await reserveAiCall(c, workspaceId, leadId))) return { answer: null, source: "cap" as const };
  const facts = factsText(ctx.brain, ctx.pack);
  const ai = await answerWithAi({
    question: text,
    facts,
    businessName: ctx.businessName,
    tone: ctx.brain.tone,
    compliance: ctx.pack.compliance,
    recent,
  });
  // The price guard: an answer that quotes money the business never wrote down is not sent.
  if (ai && pricesAreGrounded(ai, facts)) return { answer: ai, source: "ai" as const };
  return { answer: null, source: "ai" as const };
}

export async function handleInbound(input: InboundInput): Promise<InboundResult> {
  const text = input.text.trim().slice(0, 4000);
  const result = await withTenant(input.workspaceId, async (c): Promise<InboundResult> => {
    const upsert = await c.query<{ id: string }>(
      `insert into leads (workspace_id, channel, external_id, name, phone)
       values ($1, $2, $3, $4, $5)
       on conflict (workspace_id, channel, external_id) do update set updated_at = now()
       returning id`,
      [input.workspaceId, input.channel, input.externalId, input.name ?? null, input.channel === "whatsapp" ? `+${input.externalId}` : input.channel === "sms" ? input.externalId : null],
    );
    const leadId = upsert.rows[0].id;
    // One message at a time per lead, so two quick messages cannot both answer the same question.
    await c.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [leadId]);

    const inserted = await c.query(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel, external_message_id)
       values ($1, $2, 'in', 'customer', $3, 'received', $4, $5)
       on conflict (workspace_id, channel, external_message_id) where external_message_id is not null do nothing
       returning id`,
      [input.workspaceId, leadId, text, input.channel, input.externalMessageId ?? null],
    );
    if (inserted.rowCount === 0) return { duplicate: true, leadId, replied: false, outgoingIds: [], reason: "Duplicate message ignored" };

    const contact = extractContact(text);
    await c.query(
      `update leads set last_inbound_at = now(), unread = unread + 1, updated_at = now(),
         name = coalesce(name, $2), email = coalesce(email, $3), phone = coalesce(phone, $4)
       where id = $1`,
      [leadId, input.name ?? contact.name ?? null, contact.email ?? null, contact.phone ?? null],
    );
    // The customer replied, so pending "no reply" follow ups no longer apply.
    await cancelLeadJobs(c, leadId, "no_reply");

    const { rows } = await c.query<Lead>("select * from leads where id = $1", [leadId]);
    const lead = rows[0];
    const ctx = await loadContext(c, input.workspaceId);
    if (!ctx) return { duplicate: false, leadId, replied: false, outgoingIds: [], reason: "Workspace not found" };
    const who = leadLabel(lead);
    const link = `/inbox/${leadId}`;

    // STOP and START, in any language, on every channel. Twilio answers these itself on SMS, so only record them there.
    const keyword = isKeywordMessage(text, everyLanguage("optOutKeywords"))
      ? "out"
      : lead.opted_out_at && isKeywordMessage(text, everyLanguage("optInKeywords"))
        ? "in"
        : null;
    if (keyword) {
      if (keyword === "out") {
        await c.query("update leads set opted_out_at = now(), updated_at = now() where id = $1", [leadId]);
        await cancelLeadJobs(c, leadId);
        await c.query("update messages set status = 'discarded', status_detail = 'Customer opted out' where lead_id = $1 and status = 'pending_approval'", [leadId]);
      } else {
        await c.query("update leads set opted_out_at = null, updated_at = now() where id = $1", [leadId]);
      }
      await logActivity(c, input.workspaceId, {
        leadId,
        kind: keyword === "out" ? "opted_out" : "opted_in",
        summary: keyword === "out" ? `${who} asked for no more messages. Nothing automatic will be sent to them.` : `${who} opted back in to messages.`,
      });
      if (input.channel === "sms") return { duplicate: false, leadId, replied: false, outgoingIds: [], reason: `Opted ${keyword}` };
      const reply = render(keyword === "out" ? ctx.locale.assistant.optOutReply : ctx.locale.assistant.optInReply, {
        firstName: firstName(lead.name),
        businessName: ctx.businessName,
      });
      const out = await c.query<{ id: string }>(
        `insert into messages (workspace_id, lead_id, direction, author, body, status, channel)
         values ($1, $2, 'out', 'assistant', $3, 'queued', $4) returning id`,
        [input.workspaceId, leadId, reply, input.channel],
      );
      return { duplicate: false, leadId, replied: true, outgoingIds: [out.rows[0].id], reason: `Opted ${keyword}` };
    }

    const stopReason = lead.opted_out_at
      ? "This customer opted out of automatic messages"
      : !ctx.settings.enabled
      ? "Automations are switched off"
      : !ctx.brainConfirmed
        ? "The brand brain is not confirmed yet"
        : lead.automation_paused
          ? "Automation is paused for this conversation"
          : !automatedStages.has(lead.stage)
            ? "A person is handling this conversation"
            : null;
    if (stopReason) {
      await notify(c, input.workspaceId, { kind: "message", title: `New message from ${who}`, body: clip(text, 300), link });
      await logActivity(c, input.workspaceId, { leadId, kind: "no_auto_reply", summary: `No automatic reply: ${stopReason}` });
      return { duplicate: false, leadId, replied: false, outgoingIds: [], reason: stopReason };
    }

    const a = ctx.locale.assistant;
    const vars = {
      firstName: firstName(lead.name),
      businessName: ctx.businessName,
      conversionPrompt: ctx.pack.conversionPrompt,
    };
    const parts: string[] = [];
    let stage = lead.stage;
    let index = lead.qualifier_index;
    const answers = [...lead.qualifier_answers];
    let handoffReason: string | null = null;
    let answerSource: "rules" | "ai" | "cap" | null = null;

    const handoffPhrase = detectHandoff(text, [...everyLanguage("handoffKeywords"), ...ctx.pack.handoffKeywords]);
    if (handoffPhrase) {
      parts.push(render(a.handoffReply, vars));
      stage = "handoff";
      handoffReason = `Customer wrote "${handoffPhrase}"`;
    } else if (lead.stage === "qualified") {
      // After qualifying, the customer usually replies with a time that suits them.
      if (isQuestion(text)) {
        const recent = await recentMessages(c, leadId);
        const found = await findAnswer(c, input.workspaceId, leadId, text, ctx, recent);
        answerSource = found.source;
        if (found.answer) parts.push(found.answer, ctx.pack.conversionPrompt);
        else {
          parts.push(render(a.unknownReply, vars));
          stage = "handoff";
          handoffReason = "Asked something the brand brain does not answer";
        }
      } else {
        parts.push(render(a.bookingRequestReply, vars));
        stage = "handoff";
        handoffReason = `Wants to book: "${clip(text, 120)}"`;
      }
    } else {
      const first = lead.stage === "new";
      if (first) parts.push(render(firstName(lead.name, "") ? a.greeting : a.greetingNoName, vars));
      const question = isQuestion(text);
      if (question) {
        const recent = await recentMessages(c, leadId);
        const found = await findAnswer(c, input.workspaceId, leadId, text, ctx, recent);
        answerSource = found.source;
        if (found.answer) parts.push(found.answer);
        else {
          parts.push(render(a.unknownReply, vars));
          stage = "handoff";
          handoffReason = "Asked something the brand brain does not answer";
        }
      } else if (!first && lead.stage === "qualifying" && index < ctx.pack.qualifiers.length) {
        answers.push({ q: ctx.pack.qualifiers[index], a: clip(text, 500) });
        index += 1;
      }
      if (stage !== "handoff") {
        if (index < ctx.pack.qualifiers.length) {
          parts.push(ctx.pack.qualifiers[index]);
          stage = "qualifying";
        } else {
          parts.push(render(a.qualifiedReply, vars));
          stage = "qualified";
        }
      }
    }

    const body = clip(parts.filter(Boolean).join("\n\n"), automationConfig.assistant.maxReplyLength * 2);
    const out = await c.query<{ id: string }>(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel)
       values ($1, $2, 'out', 'assistant', $3, 'queued', $4) returning id`,
      [input.workspaceId, leadId, body, input.channel],
    );
    await c.query(
      `update leads set stage = $2, qualifier_index = $3, qualifier_answers = $4,
         handoff_reason = coalesce($5, handoff_reason), updated_at = now()
       where id = $1`,
      [leadId, stage, index, JSON.stringify(answers), handoffReason],
    );

    await logActivity(c, input.workspaceId, {
      leadId,
      kind: "auto_reply",
      summary: `Replied to ${who}${answerSource === "ai" ? " using AI" : ""}`,
      detail: { stage, answerSource },
    });
    if (answerSource === "ai") {
      await c.query("insert into usage_ledger (workspace_id, kind, units) values ($1, 'ai_reply', 1)", [input.workspaceId]);
    }

    if (stage === "handoff") {
      await notify(c, input.workspaceId, {
        kind: "handoff",
        title: `${who} needs you`,
        body: `${handoffReason}. Last message: "${clip(text, 200)}"`,
        link,
        email: true,
      });
      await logActivity(c, input.workspaceId, { leadId, kind: "handoff", summary: `Handed to the team: ${handoffReason}` });
    } else {
      if (stage === "qualified" && lead.stage !== "qualified") {
        const summary = answers.map((x) => `${x.q} ${x.a}`).join("\n");
        await notify(c, input.workspaceId, {
          kind: "qualified",
          title: `${who} is ready to book`,
          body: `${ctx.pack.conversionAction} is the next step.\n${summary}`,
          link,
          email: true,
        });
        await logActivity(c, input.workspaceId, { leadId, kind: "qualified", summary: `${who} answered every qualifying question` });
      }
      const when = await scheduleChainedStep(c, ctx, { id: leadId, channel: input.channel }, "no_reply", 0, new Date());
      if (when) await logActivity(c, input.workspaceId, { leadId, kind: "followup_scheduled", summary: "Follow up scheduled in case they go quiet", detail: { at: when.toISOString() } });
    }

    return { duplicate: false, leadId, replied: true, outgoingIds: [out.rows[0].id], reason: stage };
  });

  // Deliver after the transaction, so a slow channel never holds the database.
  for (const id of result.outgoingIds) {
    try {
      await deliverMessage(input.workspaceId, id);
    } catch (error) {
      await withTenant(input.workspaceId, (c) =>
        enqueue(c, { workspaceId: input.workspaceId, kind: "deliver", payload: { messageId: id }, leadId: result.leadId, dedupeKey: `deliver:${id}` }),
      );
      console.error("Delivery will be retried", error instanceof Error ? error.message : error);
    }
  }
  return result;
}

async function recentMessages(c: import("pg").PoolClient, leadId: string) {
  const { rows } = await c.query<{ direction: "in" | "out"; body: string }>(
    "select direction, body from messages where lead_id = $1 and status not in ('discarded', 'pending_approval') order by created_at desc limit 8",
    [leadId],
  );
  return rows.reverse().map((r) => ({ from: r.direction === "in" ? ("customer" as const) : ("business" as const), text: r.body }));
}
