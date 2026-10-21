// The review engine. After a sale, the customer is asked for a rating from 1 to 5.
// 4 or 5: they get the business's review link (clicks are counted). 1 to 3: the owner hears privately,
// so an unhappy customer is looked after before they post anywhere.
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { automationConfig } from "../config";
import { logActivity, notify } from "../activity";
import { enqueue } from "../queue";
import { render, firstName } from "../templates";
import { nextAllowedTime } from "../time";
import { leadLabel, type Lead, type WorkspaceContext } from "./context";
import { smsFollowUpsAllowed } from "./sequences";

/** A reply counts as a rating only when it is clearly one number from 1 to 5, or stars. */
export function parseRating(text: string): number | null {
  const t = text.trim();
  const stars = (t.match(/[★⭐]/gu) ?? []).length;
  if (stars >= 1 && stars <= 5 && t.replace(/[★⭐\s]/gu, "").length === 0) return stars;
  const m = t.match(/^(?:i\s+(?:give|rate)\s+(?:you\s+)?|rating:?\s*)?([1-5])(?:\s*(?:\/\s*5|out of 5|stars?|étoiles?|estrellas?|estrelas?))?[.!\s]*$/iu);
  return m ? Number(m[1]) : null;
}

export function reviewUrl(token: string): string {
  return `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/r/${token}`;
}

/** Why a review request would not be sent to this customer, or null when it can be. */
export function reviewBlocker(ctx: WorkspaceContext, lead: Lead): string | null {
  if (!ctx.settings.reviewEnabled) return "Review requests are off";
  if (!ctx.settings.reviewLink) return "No review link is set";
  if (lead.opted_out_at) return "The customer opted out of messages";
  if (lead.review_status) return "This customer was already asked";
  if (lead.channel === "form") return "This customer has no text channel";
  if (!smsFollowUpsAllowed(ctx, lead)) return "Review texts need the customer's consent in this market";
  return null;
}

/** Called when a sale is marked won. Schedules the request for the configured delay, outside quiet hours. */
export async function scheduleReviewRequest(c: PoolClient, ctx: WorkspaceContext, lead: Lead): Promise<Date | null> {
  if (reviewBlocker(ctx, lead)) return null;
  const runAt = nextAllowedTime(new Date(Date.now() + ctx.settings.reviewDelayHours * 3600_000), ctx.timeZone, automationConfig.quietHours);
  const id = await enqueue(c, { workspaceId: ctx.workspaceId, kind: "review_request", leadId: lead.id, runAt, dedupeKey: `review:${lead.id}` });
  return id ? runAt : null;
}

/** Writes the request message and marks the lead as asked. Returns the message id, or the reason it was skipped. */
export async function writeReviewRequest(c: PoolClient, ctx: WorkspaceContext, lead: Lead): Promise<{ messageId: string } | { skip: string }> {
  const blocker = reviewBlocker(ctx, lead) ?? (lead.stage !== "won" ? "The sale is no longer marked as won" : null);
  if (blocker) return { skip: blocker };
  const token = randomBytes(12).toString("base64url");
  const byEmail = lead.channel === "email";
  const body = render(byEmail ? ctx.locale.assistant.reviewAskEmail : ctx.locale.assistant.reviewAsk, {
    firstName: firstName(lead.name, ""),
    businessName: ctx.businessName,
    link: reviewUrl(lead.review_token ?? token),
  });
  const { rows } = await c.query<{ id: string }>(
    `insert into messages (workspace_id, lead_id, direction, author, body, status, channel, sequence_id)
     values ($1, $2, 'out', 'automation', $3, 'queued', $4, 'review') returning id`,
    [ctx.workspaceId, lead.id, body, lead.channel],
  );
  await c.query(
    "update leads set review_status = 'requested', review_requested_at = now(), review_token = coalesce(review_token, $2), updated_at = now() where id = $1",
    [lead.id, token],
  );
  await logActivity(c, ctx.workspaceId, { leadId: lead.id, kind: "review_requested", summary: byEmail ? "Emailed your review link" : "Asked for a rating from 1 to 5" });
  return { messageId: rows[0].id };
}

/**
 * Handles a customer's reply to a review request. Returns the reply message id when the text was a rating,
 * or null when it was something else (the conversation then carries on as normal).
 */
export async function handleRatingReply(c: PoolClient, ctx: WorkspaceContext, lead: Lead, text: string): Promise<string | null> {
  if (lead.review_status !== "requested") return null;
  const rating = parseRating(text);
  if (!rating) return null;
  const happy = rating >= 4;
  await c.query("update leads set review_status = 'rated', review_rating = $2, updated_at = now() where id = $1", [lead.id, rating]);
  const vars = {
    firstName: firstName(lead.name, ""),
    businessName: ctx.businessName,
    link: lead.review_token ? reviewUrl(lead.review_token) : ctx.settings.reviewLink ?? "",
  };
  const body = render(happy ? ctx.locale.assistant.reviewHappy : ctx.locale.assistant.reviewUnhappy, vars);
  const { rows } = await c.query<{ id: string }>(
    `insert into messages (workspace_id, lead_id, direction, author, body, status, channel)
     values ($1, $2, 'out', 'assistant', $3, 'queued', $4) returning id`,
    [ctx.workspaceId, lead.id, body, lead.channel],
  );
  const who = leadLabel(lead);
  await logActivity(c, ctx.workspaceId, {
    leadId: lead.id,
    kind: "review_rated",
    summary: happy ? `${who} rated you ${rating} out of 5 and was sent your review link` : `${who} rated you ${rating} out of 5. Kept private and passed to you`,
  });
  if (!happy) {
    await notify(c, ctx.workspaceId, {
      kind: "review_unhappy",
      title: `${who} rated you ${rating} out of 5`,
      body: "They were not sent your review link. Reply to them now to put it right.",
      link: `/inbox/${lead.id}`,
      email: true,
    });
  }
  return rows[0].id;
}
