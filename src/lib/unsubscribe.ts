// Stopping messages from an email link. Works the same as texting STOP: nothing automatic is sent again,
// on any channel, until the customer writes START.
import { globalQuery, withTenant } from "./db";
import { logActivity } from "./activity";
import { loadContext } from "./pipeline/context";
import { cancelLeadJobs } from "./queue";

export async function leadForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const { rows } = await globalQuery<{ workspace_id: string; lead_id: string }>("select * from lead_by_public_token($1)", [token]);
  return rows[0] ?? null;
}

export async function unsubscribe(token: string): Promise<{ businessName: string; message: string } | null> {
  const t = await leadForToken(token);
  if (!t) return null;
  return withTenant(t.workspace_id, async (c) => {
    const ctx = (await loadContext(c, t.workspace_id))!;
    const r = await c.query("update leads set opted_out_at = coalesce(opted_out_at, now()), updated_at = now() where id = $1 and opted_out_at is null returning id", [t.lead_id]);
    if (r.rowCount) {
      await cancelLeadJobs(c, t.lead_id);
      await c.query("update messages set status = 'discarded', status_detail = 'Customer unsubscribed' where lead_id = $1 and status = 'pending_approval'", [t.lead_id]);
      await logActivity(c, t.workspace_id, { leadId: t.lead_id, kind: "opted_out", summary: "Unsubscribed from an email link. Nothing automatic will be sent to them." });
    }
    return { businessName: ctx.businessName, message: ctx.locale.assistant.unsubscribed.replace("{businessName}", ctx.businessName) };
  });
}
