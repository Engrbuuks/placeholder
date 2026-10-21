// What each kind of scheduled job does.
import { automationConfig } from "../config";
import { withTenant } from "../db";
import { logActivity, notify } from "../activity";
import { enqueue, PermanentError, type ClaimedJob } from "../queue";
import { render, firstName } from "../templates";
import { formatBookingTime } from "../time";
import { sendEmail } from "../channels/email";
import { runAudit } from "../audit/run";
import { counts } from "../health";
import { getWorkspace, latestAudits, saveAudit } from "../workspaces";
import { getLead, leadLabel, loadContext } from "./context";
import { deliverMessage } from "./delivery";
import { scheduleChainedStep, smsFollowUpsAllowed } from "./sequences";

type FollowupPayload = {
  trigger: "no_reply" | "booked" | "won";
  sequenceId: string;
  stepIndex: number;
  scheduledAt: string;
  bookedFor?: string;
};

async function followup(job: ClaimedJob) {
  const p = job.payload as FollowupPayload;
  if (!job.lead_id) throw new PermanentError("Follow up has no lead.");
  const leadId = job.lead_id;

  const created = await withTenant(job.workspace_id, async (c) => {
    const ctx = await loadContext(c, job.workspace_id);
    const lead = await getLead(c, leadId);
    if (!ctx || !lead) return { skip: "The conversation no longer exists" };

    const skip = lead.opted_out_at
      ? "The customer opted out of messages"
      : !ctx.settings.enabled
      ? "Automations are switched off"
      : lead.automation_paused
        ? "Automation is paused for this conversation"
        : p.trigger === "no_reply" && !["new", "qualifying", "qualified"].includes(lead.stage)
          ? "The conversation moved on"
          : p.trigger === "no_reply" && lead.last_inbound_at && lead.last_inbound_at > new Date(p.scheduledAt)
            ? "The customer replied"
            : p.trigger === "booked" && (lead.stage !== "booked" || lead.booked_for?.toISOString() !== p.bookedFor)
              ? "The booking changed"
              : p.trigger === "won" && lead.stage !== "won"
                ? "The lead is no longer marked as won"
                : p.trigger !== "booked" && !smsFollowUpsAllowed(ctx, lead)
                  ? "Automated follow up texts are off in this market"
                  : null;
    if (skip) {
      await logActivity(c, job.workspace_id, { leadId, kind: "followup_skipped", summary: `Follow up skipped: ${skip}` });
      return { skip };
    }

    const seq = ctx.pack.sequences.find((s) => s.id === p.sequenceId) ?? ctx.pack.sequences.find((s) => s.trigger === p.trigger);
    const step = seq?.steps[p.stepIndex];
    if (!seq || !step) return { skip: "The sequence step no longer exists" };

    const body = render(step.message, {
      firstName: firstName(lead.name),
      businessName: ctx.businessName,
      bookingTime: lead.booked_for ? formatBookingTime(lead.booked_for, ctx.timeZone) : "",
      conversionAction: ctx.pack.conversionAction.toLowerCase(),
    });
    const needsApproval = ctx.settings.approvalMode === "approve";
    const { rows } = await c.query<{ id: string }>(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel, sequence_id)
       values ($1, $2, 'out', 'automation', $3, $4, $5, $6) returning id`,
      [job.workspace_id, leadId, body, needsApproval ? "pending_approval" : "queued", lead.channel, seq.id],
    );

    const label = `${seq.name}, step ${p.stepIndex + 1} of ${seq.steps.length}`;
    if (needsApproval) {
      await notify(c, job.workspace_id, {
        kind: "approval",
        title: `Follow up for ${leadLabel(lead)} is waiting for you`,
        body: body,
        link: `/inbox/${leadId}`,
      });
      await logActivity(c, job.workspace_id, { leadId, kind: "awaiting_approval", summary: `${label} is waiting for your approval` });
    } else {
      await logActivity(c, job.workspace_id, { leadId, kind: "followup_sent", summary: `${label} sent` });
    }

    if (p.trigger !== "booked") {
      const next = await scheduleChainedStep(c, ctx, lead, p.trigger, p.stepIndex + 1, new Date());
      if (next) await logActivity(c, job.workspace_id, { leadId, kind: "followup_scheduled", summary: `Next step scheduled`, detail: { at: next.toISOString() } });
    }
    return { messageId: needsApproval ? null : rows[0].id };
  });

  if ("messageId" in created && created.messageId) {
    try {
      await deliverMessage(job.workspace_id, created.messageId);
    } catch {
      await withTenant(job.workspace_id, (c) =>
        enqueue(c, { workspaceId: job.workspace_id, kind: "deliver", leadId, payload: { messageId: created.messageId }, dedupeKey: `deliver:${created.messageId}` }),
      );
    }
  }
}

async function deliver(job: ClaimedJob) {
  const messageId = String(job.payload.messageId ?? "");
  if (!messageId) throw new PermanentError("Delivery job has no message.");
  await deliverMessage(job.workspace_id, messageId);
}

async function email(job: ClaimedJob) {
  const { to, subject, text } = job.payload as { to?: string; subject?: string; text?: string };
  if (!to || !subject) throw new PermanentError("Email job is missing an address or subject.");
  const result = await withTenant(job.workspace_id, (c) => sendEmail(c, job.workspace_id, { to, subject, text: text ?? "" }));
  if (result.status === "failed") throw new Error(result.error ?? "Email failed");
}

async function weeklyCheck(job: ClaimedJob) {
  const workspace = await getWorkspace(job.workspace_id);
  if (!workspace) throw new PermanentError("Workspace not found.");
  const [before] = await latestAudits(job.workspace_id, 1);
  const presence = { websiteUrl: workspace.websiteUrl, instagramUrl: workspace.instagramUrl, googleProfileUrl: workspace.googleProfileUrl };
  const { outcome } = await runAudit(presence);
  await saveAudit(job.workspace_id, outcome, workspace.websiteUrl);

  await withTenant(job.workspace_id, async (c) => {
    const after = { ...outcome, createdAt: new Date() };
    const drop = before ? before.score - outcome.score : 0;
    const newLeaks = before
      ? outcome.results.filter((r) => !r.passed && (after.facts.fetched || r.group !== "site") && before.results.find((b) => b.id === r.id)?.passed)
      : [];
    await logActivity(c, job.workspace_id, {
      kind: "weekly_check",
      summary: `Weekly check: ${outcome.score} out of 100${before ? ` (was ${before.score})` : ""}`,
      detail: { leaking: counts(after).leaking },
    });
    if (before && (drop >= automationConfig.weekly.scoreDropAlert || newLeaks.length > 0)) {
      const lines = [
        drop > 0 ? `Your score fell from ${before.score} to ${outcome.score}.` : `Your score is ${outcome.score}.`,
        ...newLeaks.map((r) => `New leak: ${r.label}. ${r.fix}`),
      ];
      await notify(c, job.workspace_id, {
        kind: "weekly_check",
        title: newLeaks.length ? `${newLeaks.length} new leak${newLeaks.length === 1 ? "" : "s"} found this week` : `Your score dropped to ${outcome.score}`,
        body: lines.join("\n"),
        link: "/audit",
        email: true,
      });
    }
  });
}

export const handlers: Record<ClaimedJob["kind"], (job: ClaimedJob) => Promise<void>> = {
  followup,
  deliver,
  email,
  weekly_check: weeklyCheck,
};

/** Runs when a job has used up its retries, so nothing is left silently waiting. */
export async function onGiveUp(job: ClaimedJob, error: unknown) {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  await withTenant(job.workspace_id, async (c) => {
    if (job.kind === "deliver" && job.payload.messageId) {
      await c.query("update messages set status = 'failed', status_detail = $2 where id = $1 and status = 'queued'", [
        job.payload.messageId,
        `Gave up after ${job.attempts} attempts: ${reason}`,
      ]);
    }
    await logActivity(c, job.workspace_id, {
      leadId: job.lead_id,
      kind: "job_failed",
      summary: `${job.kind === "deliver" ? "A message" : job.kind === "email" ? "An alert email" : job.kind === "weekly_check" ? "The weekly check" : "A follow up"} failed after ${job.attempts} attempts: ${reason}`,
    });
    if (job.kind !== "email") {
      await notify(c, job.workspace_id, {
        kind: "job_failed",
        title: job.kind === "deliver" ? "A message could not be sent" : "An automation step failed",
        body: reason,
        link: job.lead_id ? `/inbox/${job.lead_id}` : "/automations",
      });
    }
  });
}
