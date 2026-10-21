// A customer's right to their data: everything held about one customer, and deleting it all.
// Both run inside the business's tenant, so one business can never reach another's customers.
import { isUuid, withTenant } from "./db";
import { logActivity } from "./activity";

export type CustomerExport = {
  exportedAt: string;
  business: string;
  customer: Record<string, unknown>;
  messages: { at: string; direction: string; from: string; channel: string; text: string; status: string }[];
  scheduledMessages: { at: string; kind: string; status: string }[];
  activity: { at: string; summary: string }[];
};

export async function exportCustomer(workspaceId: string, leadId: string): Promise<CustomerExport | null> {
  if (!isUuid(leadId)) return null;
  return withTenant(workspaceId, async (c) => {
    const lead = await c.query(
      `select id, channel, external_id, name, phone, email, stage, qualifier_answers, booked_for, opted_out_at, created_at, updated_at
       from leads where id = $1`,
      [leadId],
    );
    if (!lead.rows[0]) return null;
    const ws = await c.query<{ name: string }>("select name from workspaces where id = $1", [workspaceId]);
    const messages = await c.query<{ created_at: Date; direction: string; author: string; channel: string; body: string; status: string }>(
      "select created_at, direction, author, channel, body, status from messages where lead_id = $1 order by created_at, id",
      [leadId],
    );
    const jobs = await c.query<{ run_at: Date; kind: string; status: string }>("select run_at, kind, status from jobs where lead_id = $1 order by run_at", [leadId]);
    const activity = await c.query<{ created_at: Date; summary: string }>("select created_at, summary from activity where lead_id = $1 order by created_at", [leadId]);
    await logActivity(c, workspaceId, { leadId, kind: "privacy_export", summary: "Downloaded this customer's data" });
    return {
      exportedAt: new Date().toISOString(),
      business: ws.rows[0]?.name ?? "",
      customer: lead.rows[0],
      messages: messages.rows.map((m) => ({
        at: m.created_at.toISOString(),
        direction: m.direction === "in" ? "received" : "sent",
        from: m.author,
        channel: m.channel,
        text: m.body,
        status: m.status,
      })),
      scheduledMessages: jobs.rows.map((j) => ({ at: j.run_at.toISOString(), kind: j.kind, status: j.status })),
      activity: activity.rows.map((a) => ({ at: a.created_at.toISOString(), summary: a.summary })),
    };
  });
}

/**
 * Deletes the customer, their messages, scheduled steps, activity and the alerts that named them.
 * Leaves one line in the business's log, without the customer's details, as a record that it was done.
 */
export async function deleteCustomer(workspaceId: string, leadId: string): Promise<boolean> {
  if (!isUuid(leadId)) return false;
  return withTenant(workspaceId, async (c) => {
    const lead = await c.query<{ channel: string }>("select channel from leads where id = $1", [leadId]);
    if (!lead.rows[0]) return false;
    await c.query("delete from notifications where link = $1", [`/inbox/${leadId}`]);
    await c.query("delete from leads where id = $1", [leadId]); // messages, jobs and activity go with it
    const channel = { webchat: "web chat", whatsapp: "WhatsApp", sms: "SMS" }[lead.rows[0].channel] ?? lead.rows[0].channel;
    await logActivity(c, workspaceId, { kind: "privacy_delete", summary: `Deleted a ${channel} customer's data on request` });
    return true;
  });
}
