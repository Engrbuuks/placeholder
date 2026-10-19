// What the business owner can do with a conversation: reply, approve or discard a follow up,
// move the lead to a stage (booked, won, lost), pause or hand back to the assistant.
import { withTenant } from "../db";
import { logActivity } from "../activity";
import { cancelLeadJobs, enqueue } from "../queue";
import { formatBookingTime } from "../time";
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

export async function setStage(workspaceId: string, leadId: string, stage: Lead["stage"], bookedFor?: Date | null) {
  return withTenant(workspaceId, async (c) => {
    const ctx = await loadContext(c, workspaceId);
    const lead = await getLead(c, leadId);
    if (!ctx || !lead) throw new Error("Conversation not found.");
    if (stage === "booked" && (!bookedFor || Number.isNaN(bookedFor.getTime()))) throw new Error("Choose the date and time of the booking.");

    await c.query("update leads set stage = $2, booked_for = $3, updated_at = now() where id = $1", [
      leadId,
      stage,
      stage === "booked" ? bookedFor : lead.booked_for,
    ]);
    await cancelLeadJobs(c, leadId, "no_reply");

    let summary = `Moved to ${stage}`;
    if (stage === "booked" && bookedFor) {
      const reminders = await scheduleBookingReminders(c, ctx, lead, bookedFor);
      summary = `Booked for ${formatBookingTime(bookedFor, ctx.timeZone)}; ${reminders.length} reminder${reminders.length === 1 ? "" : "s"} scheduled`;
    } else if (stage === "won") {
      await cancelLeadJobs(c, leadId, "booked");
      const at = await scheduleChainedStep(c, ctx, lead, "won", 0, new Date());
      summary = at ? "Marked as won; thank you message scheduled" : "Marked as won";
    } else if (stage === "lost") {
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
