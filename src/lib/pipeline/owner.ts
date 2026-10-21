// What the business owner can do with a conversation: reply, approve or discard a follow up,
// move the lead to a stage (booked, won, lost), pause or hand back to the assistant.
import { randomBytes } from "node:crypto";
import { withTenant } from "../db";
import { logActivity } from "../activity";
import { cancelLeadJobs, enqueue } from "../queue";
import { formatBookingTime } from "../time";
import { formatMoney } from "../config";
import { scheduleReviewRequest } from "./reviews";
import { getLead, loadContext, type Lead } from "./context";
import { deliverMessage } from "./delivery";
import { scheduleBookingReminders, scheduleChainedStep } from "./sequences";

async function deliverOrRetry(workspaceId: string, leadId: string, messageId: string) {
  try {
    return await deliverMessage(workspaceId, messageId);
  } catch {
    await withTenant(workspaceId, (c) =>
      enqueue(c, { workspaceId, kind: "deliver", leadId, payload: { messageId }, dedupeKey: `deliver:${messageId}` }),
    );
    return "retrying" as const;
  }
}

export async function ownerReply(workspaceId: string, leadId: string, text: string) {
  const body = text.trim().slice(0, 4000);
  if (!body) throw new Error("Write a message first.");
  const id = await withTenant(workspaceId, async (c) => {
    const lead = await getLead(c, leadId);
    if (!lead) throw new Error("Conversation not found.");
    const { rows } = await c.query<{ id: string }>(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel)
       values ($1, $2, 'out', 'owner', $3, 'queued', $4) returning id`,
      [workspaceId, leadId, body, lead.channel],
    );
    // A person has stepped in, so the assistant stops replying to this lead until handed back.
    await c.query(
      `update leads set unread = 0, updated_at = now(),
         stage = case when stage in ('new', 'qualifying', 'qualified') then 'handoff' else stage end,
         handoff_reason = case when stage in ('new', 'qualifying', 'qualified') then 'You replied to this conversation' else handoff_reason end
       where id = $1`,
      [leadId],
    );
    await cancelLeadJobs(c, leadId, "no_reply");
    await logActivity(c, workspaceId, { leadId, kind: "owner_reply", summary: "You replied" });
    return rows[0].id;
  });
  return deliverOrRetry(workspaceId, leadId, id);
}

export async function approveMessage(workspaceId: string, messageId: string) {
  const leadId = await withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{ lead_id: string }>(
      "update messages set status = 'queued', created_at = now() where id = $1 and status = 'pending_approval' returning lead_id",
      [messageId],
    );
    if (!rows[0]) return null;
    await logActivity(c, workspaceId, { leadId: rows[0].lead_id, kind: "approved", summary: "You approved a follow up" });
    return rows[0].lead_id;
  });
  if (!leadId) return "not_pending" as const;
  return deliverOrRetry(workspaceId, leadId, messageId);
}

export async function discardMessage(workspaceId: string, messageId: string) {
  await withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{ lead_id: string }>(
      "update messages set status = 'discarded' where id = $1 and status = 'pending_approval' returning lead_id",
      [messageId],
    );
    if (rows[0]) await logActivity(c, workspaceId, { leadId: rows[0].lead_id, kind: "discarded", summary: "You discarded a follow up" });
  });
}

export async function setStage(workspaceId: string, leadId: string, stage: Lead["stage"], bookedFor?: Date | null, value?: number | null) {
  return withTenant(workspaceId, async (c) => {
    const ctx = await loadContext(c, workspaceId);
    const lead = await getLead(c, leadId);
    if (!ctx || !lead) throw new Error("Conversation not found.");
    if (stage === "booked" && (!bookedFor || Number.isNaN(bookedFor.getTime()))) throw new Error("Choose the date and time of the booking.");

    if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Enter the sale value as a number, or leave it empty.");
    await c.query(
      `update leads set stage = $2, booked_for = $3, updated_at = now(),
         booked_at = case when $2 = 'booked' then coalesce(booked_at, now()) else booked_at end,
         won_at = case when $2 = 'won' then now() when $2 in ('lost') then null else won_at end,
         lost_at = case when $2 = 'lost' then now() when $2 = 'won' then null else lost_at end,
         value = case when $2 = 'won' and $4::numeric is not null then $4::numeric else value end
       where id = $1`,
      [leadId, stage, stage === "booked" ? bookedFor : lead.booked_for, value ?? null],
    );
    await cancelLeadJobs(c, leadId, "no_reply");

    let summary = `Moved to ${stage}`;
    if (stage === "booked" && bookedFor) {
      // The calendar shows every booking, whether the customer made it or the owner did.
      const slot = (await c.query<{ slot_minutes: number }>("select slot_minutes from booking_settings where workspace_id = $1", [workspaceId])).rows[0]?.slot_minutes ?? 30;
      await c.query("update bookings set status = 'cancelled', cancelled_at = now() where lead_id = $1 and status = 'confirmed'", [leadId]);
      await c.query(
        "insert into bookings (workspace_id, lead_id, starts_at, ends_at, source, manage_token) values ($1, $2, $3, $4, 'owner', $5)",
        [workspaceId, leadId, bookedFor, new Date(bookedFor.getTime() + slot * 60_000), randomBytes(15).toString("base64url")],
      );
      const reminders = await scheduleBookingReminders(c, ctx, lead, bookedFor);
      summary = `Booked for ${formatBookingTime(bookedFor, ctx.timeZone)}; ${reminders.length} reminder${reminders.length === 1 ? "" : "s"} scheduled`;
    } else if (stage === "won") {
      await cancelLeadJobs(c, leadId, "booked");
      const at = await scheduleChainedStep(c, ctx, lead, "won", 0, new Date());
      const review = await scheduleReviewRequest(c, ctx, { ...lead, stage: "won" });
      const worth = value ? `, worth ${formatMoney(value, ctx.country)}` : "";
      summary = [`Marked as won${worth}`, at && "thank you message scheduled", review && `review request on ${formatBookingTime(review, ctx.timeZone)}`]
        .filter(Boolean)
        .join("; ");
    } else if (stage === "lost") {
      await c.query("update bookings set status = 'cancelled', cancelled_at = now() where lead_id = $1 and status = 'confirmed' and starts_at > now()", [leadId]);
      await cancelLeadJobs(c, leadId);
      summary = "Marked as lost; all follow ups stopped";
    }
    await logActivity(c, workspaceId, { leadId, kind: "stage", summary });
    return summary;
  });
}

/** Pausing stops automatic replies and follow ups for this conversation; resuming hands it back to the assistant. */
export async function setPaused(workspaceId: string, leadId: string, paused: boolean) {
  await withTenant(workspaceId, async (c) => {
    const lead = await getLead(c, leadId);
    if (!lead) throw new Error("Conversation not found.");
    const backTo = lead.qualifier_answers.length > 0 ? "qualifying" : "new";
    await c.query(
      `update leads set automation_paused = $2, updated_at = now(),
         stage = case when $2 = false and stage = 'handoff' then $3 else stage end,
         handoff_reason = case when $2 = false and stage = 'handoff' then null else handoff_reason end
       where id = $1`,
      [leadId, paused, backTo],
    );
    if (paused) await cancelLeadJobs(c, leadId, "no_reply");
    await logActivity(c, workspaceId, {
      leadId,
      kind: paused ? "paused" : "resumed",
      summary: paused ? "You paused automation for this conversation" : "You handed the conversation back to the assistant",
    });
  });
}

export async function markRead(workspaceId: string, leadId: string) {
  await withTenant(workspaceId, (c) => c.query("update leads set unread = 0 where id = $1 and unread > 0", [leadId]));
}
