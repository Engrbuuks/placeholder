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
import { change, formatDuration, resultsFor } from "../results";
import { formatMoney } from "../config";
import { getWorkspace, latestAudits, saveAudit } from "../workspaces";
import { getLead, leadLabel, loadContext } from "./context";
import { deliverMessage } from "./delivery";
import { scheduleChainedStep, smsFollowUpsAllowed } from "./sequences";
import { writeReviewRequest } from "./reviews";
import { campaignSend } from "./campaigns";
import { personalFollowUp } from "./personal";
import { leadInsight } from "./reading";

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
    // The AI may rewrite it from the conversation; every draft is checked, and the template is the fallback.
    const personal = await personalFollowUp(c, ctx, lead, p.trigger, body);
    const needsApproval = ctx.settings.approvalMode === "approve";
    const { rows } = await c.query<{ id: string }>(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel, sequence_id, ai_written)
       values ($1, $2, 'out', 'automation', $3, $4, $5, $6, $7) returning id`,
      [job.workspace_id, leadId, personal.body, needsApproval ? "pending_approval" : "queued", lead.channel, seq.id, personal.aiWritten],
    );
    if (personal.note) await logActivity(c, job.workspace_id, { leadId, kind: "followup_template", summary: personal.note });

    const label = `${seq.name}, step ${p.stepIndex + 1} of ${seq.steps.length}${personal.aiWritten ? ", written personally by AI" : ""}`;
    if (needsApproval) {
      await notify(c, job.workspace_id, {
        kind: "approval",
        title: `Follow up for ${leadLabel(lead)} is waiting for you`,
        body: personal.body,
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

  await sendWeeklyResults(job.workspace_id, workspace.timeZone, workspace.country);

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

async function reviewRequest(job: ClaimedJob) {
  if (!job.lead_id) throw new PermanentError("Review request has no lead.");
  const leadId = job.lead_id;
  const result = await withTenant(job.workspace_id, async (c) => {
    const ctx = await loadContext(c, job.workspace_id);
    const lead = await getLead(c, leadId);
    if (!ctx || !lead) return { skip: "The conversation no longer exists" };
    const written = await writeReviewRequest(c, ctx, lead);
    if ("skip" in written) await logActivity(c, job.workspace_id, { leadId, kind: "review_skipped", summary: `Review request not sent: ${written.skip}` });
    return written;
  });
  if ("messageId" in result) await deliverOrQueue(job.workspace_id, leadId, result.messageId);
}

/** Sends now; if the channel is briefly down, a delivery job retries it with backoff. */
export async function deliverOrQueue(workspaceId: string, leadId: string, messageId: string) {
  try {
    await deliverMessage(workspaceId, messageId);
  } catch {
    await withTenant(workspaceId, (c) =>
      enqueue(c, { workspaceId, kind: "deliver", leadId, payload: { messageId }, dedupeKey: `deliver:${messageId}` }),
    );
  }
}

/** The owner's weekly report: what came in, how fast it was answered, what it turned into, and where from. */
export async function sendWeeklyResults(workspaceId: string, timeZone: string, country: string | null) {
  const r = await resultsFor(workspaceId, 7, timeZone);
  const money = (v: number) => formatMoney(v, country);
  const diff = (now: number, before: number) => {
    const pct = change(now, before);
    return pct === null ? "" : pct === 0 ? " (same as last week)" : ` (${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on last week)`;
  };
  const top = r.sources[0];
  const lines = [
    `Leads: ${r.current.leads}${diff(r.current.leads, r.previous.leads)}`,
    `Booked: ${r.current.booked}. Won: ${r.current.won}. Revenue: ${money(r.current.revenue)}${diff(r.current.revenue, r.previous.revenue)}`,
    `Typical first reply: ${formatDuration(r.medianFirstReplySeconds)}. ${Math.round(r.answeredWithinMinute * 100)}% answered within a minute.`,
    r.afterHours > 0 ? `${r.afterHours} came in while you were closed and were answered straight away.` : null,
    top ? `Best source: ${top.label}, with ${top.leads} lead${top.leads === 1 ? "" : "s"} and ${money(top.revenue)}.` : null,
    r.reviews.rated > 0 ? `Reviews: ${r.reviews.rated} rated, average ${r.reviews.average} out of 5, ${r.reviews.clicks} opened your review link.` : null,
    r.campaigns.sent > 0 ? `Campaigns: ${r.campaigns.sent} sent, ${r.campaigns.replied} replies, ${money(r.campaigns.revenue)} won back.` : null,
  ].filter(Boolean);
  await withTenant(workspaceId, (c) =>
    notify(c, workspaceId, {
      kind: "weekly_results",
      title: `Your week: ${r.current.leads} lead${r.current.leads === 1 ? "" : "s"}, ${r.current.won} sale${r.current.won === 1 ? "" : "s"}, ${money(r.current.revenue)}`,
      body: lines.join("\n"),
      link: "/results?days=7",
      email: true,
    }),
  );
}

export const handlers: Record<ClaimedJob["kind"], (job: ClaimedJob) => Promise<void>> = {
  followup,
  deliver,
  email,
  weekly_check: weeklyCheck,
  review_request: reviewRequest,
  campaign_send: campaignSend,
  lead_insight: leadInsight,
};

const jobNames: Record<ClaimedJob["kind"], string> = {
  deliver: "A message",
  email: "An alert email",
  weekly_check: "The weekly check",
  followup: "A follow up",
  review_request: "A review request",
  campaign_send: "A campaign batch",
  lead_insight: "Reading a conversation",
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
      summary: `${jobNames[job.kind]} failed after ${job.attempts} attempts: ${reason}`,
    });
    if (job.kind !== "email" && job.kind !== "lead_insight") {
      await notify(c, job.workspace_id, {
        kind: "job_failed",
        title: job.kind === "deliver" ? "A message could not be sent" : "An automation step failed",
        body: reason,
        link: job.lead_id ? `/inbox/${job.lead_id}` : "/automations",
      });
    }
  });
}
