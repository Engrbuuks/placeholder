// Missed call text back: when nobody answers, the caller gets a text within seconds and the conversation
// starts in the inbox, where the assistant takes it from their first reply.
import { withTenant } from "../db";
import { logActivity, notify } from "../activity";
import { render } from "../templates";
import { loadContext } from "./context";
import { deliverOrQueue } from "./jobs";

export type MissedCallResult = { texted: boolean; leadId: string | null; reason: string };

export async function handleMissedCall(workspaceId: string, caller: string, callSid: string): Promise<MissedCallResult> {
  if (!/^\+[1-9]\d{7,14}$/.test(caller)) return { texted: false, leadId: null, reason: "The caller's number was hidden" };
  const result = await withTenant(workspaceId, async (c): Promise<MissedCallResult & { messageId?: string }> => {
    const ctx = await loadContext(c, workspaceId);
    if (!ctx) return { texted: false, leadId: null, reason: "Business not found" };
    const lead = (
      await c.query<{ id: string; opted_out_at: Date | null }>(
        `insert into leads (workspace_id, channel, external_id, phone, source) values ($1, 'sms', $2, $2, 'missed_call')
         on conflict (workspace_id, channel, external_id) do update set updated_at = now()
         returning id, opted_out_at`,
        [workspaceId, caller],
      )
    ).rows[0];
    await c.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lead.id]);
    // Twilio can call the webhook twice for one call; the call id makes the second a no op.
    const logged = await c.query(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel, external_message_id)
       values ($1, $2, 'in', 'customer', $3, 'received', 'sms', $4)
       on conflict (workspace_id, channel, external_message_id) where external_message_id is not null do nothing returning id`,
      [workspaceId, lead.id, "(Missed call)", callSid],
    );
    if (!logged.rowCount) return { texted: false, leadId: lead.id, reason: "Already handled" };
    await c.query("update leads set last_inbound_at = now(), unread = unread + 1, updated_at = now() where id = $1", [lead.id]);
    if (lead.opted_out_at) {
      await logActivity(c, workspaceId, { leadId: lead.id, kind: "missed_call", summary: `Missed call from ${caller}. Not texted: they opted out` });
      return { texted: false, leadId: lead.id, reason: "Opted out" };
    }
    const body = render(ctx.locale.assistant.missedCallText, { businessName: ctx.businessName });
    const m = await c.query<{ id: string }>(
      `insert into messages (workspace_id, lead_id, direction, author, body, status, channel) values ($1, $2, 'out', 'assistant', $3, 'queued', 'sms') returning id`,
      [workspaceId, lead.id, body],
    );
    await logActivity(c, workspaceId, { leadId: lead.id, kind: "missed_call", summary: `Missed call from ${caller}. Texted them straight away` });
    await notify(c, workspaceId, {
      kind: "missed_call",
      title: `Missed call from ${caller}`,
      body: "They were texted straight away. Their reply will appear in your inbox, or call them back now.",
      link: `/inbox/${lead.id}`,
      email: true,
    });
    return { texted: true, leadId: lead.id, reason: "Texted", messageId: m.rows[0].id };
  });
  if (result.messageId && result.leadId) await deliverOrQueue(workspaceId, result.leadId, result.messageId);
  return { texted: result.texted, leadId: result.leadId, reason: result.reason };
}
