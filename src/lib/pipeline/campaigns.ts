// Reactivation campaigns: one message to a group of past leads, to bring them back.
// Before anything is sent, each person is checked: opted out, no way to reach them first, the market's
// texting rules, WhatsApp's 24 hour window, and a frequency cap. Skipped people are listed with the reason.
// Sending runs in batches through the job queue, outside quiet hours, and results are traced to bookings and revenue.
import type { PoolClient } from "pg";
import { automationConfig, markets } from "../config";
import { isUuid, withTenant } from "../db";
import { logActivity } from "../activity";
import { enqueue, type ClaimedJob } from "../queue";
import { render, firstName } from "../templates";
import { inQuietHours, nextAllowedTime } from "../time";
import { withinWindow } from "../channels/whatsapp";
import { emailConfigured } from "../channels/email";
import { loadContext, type Lead, type WorkspaceContext } from "./context";
import { deliverMessage } from "./delivery";
import { smsFollowUpsAllowed } from "./sequences";

export type Segment = "lost" | "quiet" | "customers" | "booked_no_show";

export const segments: { id: Segment; label: string; help: string }[] = [
  { id: "quiet", label: "Went quiet", help: "Asked about you, then stopped replying. Still open, no message from them for the number of days you choose." },
  { id: "lost", label: "Lost leads", help: "Marked lost. A new offer or a second look often brings a share of them back." },
  { id: "customers", label: "Past customers", help: "Marked won. Repeat business and referrals." },
  { id: "booked_no_show", label: "Booked, then nothing", help: "Booked for a date that has passed, but never marked won or lost. Often missed appointments." },
];

const segmentWhere: Record<Segment, string> = {
  lost: "l.stage = 'lost'",
  quiet: "l.stage in ('new', 'qualifying', 'qualified') and coalesce(l.last_inbound_at, l.created_at) < now() - make_interval(days => $2)",
  customers: "l.stage = 'won'",
  booked_no_show: "l.stage = 'booked' and l.booked_for < now() - interval '1 day'",
};

type Connections = { sms: boolean; whatsapp: boolean; whatsappTemplate: boolean; email?: boolean };
export type Reach = { ok: true; via: "text" | "template" | "email" } | { ok: false; reason: string };

/**
 * Marketing email follows the same consent rule as marketing texts in each market, with one addition: past
 * customers may be emailed (the "soft opt in" for existing customers), always with an unsubscribe link.
 */
function emailReach(ctx: WorkspaceContext, lead: Lead, conn: Connections): Reach {
  if (!conn.email) return { ok: false, reason: "Email sending is not set up on the server" };
  const permissive = ctx.country ? (markets[ctx.country]?.smsFollowUps ?? false) : false;
  if (!permissive && !lead.marketing_consent_at && lead.stage !== "won") {
    return { ok: false, reason: `Marketing emails need their consent in ${ctx.country ? markets[ctx.country]?.name : "this market"}` };
  }
  return { ok: true, via: "email" };
}

/** Whether one person may be messaged first by this business, and how. */
export function reach(ctx: WorkspaceContext, lead: Lead, conn: Connections, lastCampaignAt: Date | null, now = new Date()): Reach {
  if (lead.opted_out_at) return { ok: false, reason: "Opted out" };
  const cap = automationConfig.campaigns.frequencyCapDays;
  if (cap > 0 && lastCampaignAt && now.getTime() - lastCampaignAt.getTime() < cap * 86_400_000) {
    return { ok: false, reason: `Already sent a campaign in the last ${cap} days` };
  }
  if (lead.channel === "email") return emailReach(ctx, lead, conn);
  // Web chat and form customers can be reached only when they left an email address.
  if (lead.channel === "webchat") return lead.email ? emailReach(ctx, lead, conn) : { ok: false, reason: "Web chat visitors without an email address cannot be messaged first" };
  if (lead.channel === "form") return lead.email ? emailReach(ctx, lead, conn) : { ok: false, reason: "Came from the lead form with no way to message them" };
  if (lead.channel === "sms") {
    if (!conn.sms) return { ok: false, reason: "SMS is not connected" };
    if (!smsFollowUpsAllowed(ctx, lead)) {
      const name = ctx.country ? markets[ctx.country]?.name : "this market";
      return { ok: false, reason: `Marketing texts need their consent in ${name}` };
    }
    return { ok: true, via: "text" };
  }
  if (!conn.whatsapp) return { ok: false, reason: "WhatsApp is not connected" };
  if (withinWindow(lead.last_inbound_at, now)) return { ok: true, via: "text" };
  if (conn.whatsappTemplate) return { ok: true, via: "template" };
  return { ok: false, reason: "WhatsApp needs an approved template after 24 hours" };
}

async function connections(c: PoolClient): Promise<Connections> {
  const { rows } = await c.query<{ channel: string; ok: boolean; template: string | null }>(
    "select channel, secret_enc is not null as ok, settings->>'templateName' as template from channel_connections",
  );
  const wa = rows.find((r) => r.channel === "whatsapp");
  return {
    sms: Boolean(rows.find((r) => r.channel === "sms")?.ok),
    whatsapp: Boolean(wa?.ok),
    whatsappTemplate: Boolean(wa?.ok && wa.template),
    email: emailConfigured(),
  };
}

export type Preview = {
  total: number;
  reachable: number;
  viaTemplate: number;
  viaEmail: number;
  skipped: { reason: string; count: number }[];
  sample: string;
};

export async function previewCampaign(workspaceId: string, input: { segment: Segment; quietDays: number; message: string }): Promise<Preview> {
  return withTenant(workspaceId, async (c) => {
    const ctx = (await loadContext(c, workspaceId))!;
    const conn = await connections(c);
    const people = await audienceFor(c, workspaceId, input.segment, input.quietDays);
    const skipped = new Map<string, number>();
    let reachable = 0;
    let viaTemplate = 0;
    let viaEmail = 0;
    let sampleName: string | null = null;
    for (const p of people) {
      const r = reach(ctx, p, conn, p.last_campaign_at);
      if (r.ok) {
        reachable++;
        if (r.via === "template") viaTemplate++;
        if (r.via === "email") viaEmail++;
        sampleName ??= p.name;
      } else skipped.set(r.reason, (skipped.get(r.reason) ?? 0) + 1);
    }
    return {
      total: people.length,
      reachable,
      viaTemplate,
      viaEmail,
      skipped: [...skipped].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      sample: render(input.message, { firstName: firstName(sampleName ?? "Ada", ""), businessName: ctx.businessName }),
    };
  });
}

async function audienceFor(c: PoolClient, workspaceId: string, segment: Segment, quietDays: number) {
  const { rows } = await c.query<Lead & { last_campaign_at: Date | null }>(
    `select l.*, (select max(r.sent_at) from campaign_recipients r where r.lead_id = l.id and r.status = 'sent') as last_campaign_at
     from leads l where l.workspace_id = $1 and ${segmentWhere[segment]}
     order by l.updated_at desc limit ${automationConfig.campaigns.maxAudience}`,
    segment === "quiet" ? [workspaceId, quietDays] : [workspaceId],
  );
  return rows;
}

/** Creates the campaign, decides who gets it (and why the rest do not), and starts sending. */
export async function startCampaign(
  workspaceId: string,
  input: { name: string; segment: Segment; quietDays: number; message: string },
): Promise<{ campaignId: string; queued: number; skipped: number }> {
  return withTenant(workspaceId, async (c) => {
    const ctx = (await loadContext(c, workspaceId))!;
    const conn = await connections(c);
    const people = await audienceFor(c, workspaceId, input.segment, input.quietDays);
    const { rows } = await c.query<{ id: string }>(
      `insert into campaigns (workspace_id, name, segment, quiet_days, message, status, started_at)
       values ($1, $2, $3, $4, $5, 'sending', now()) returning id`,
      [workspaceId, input.name, input.segment, input.quietDays, input.message],
    );
    const campaignId = rows[0].id;
    let queued = 0;
    for (const p of people) {
      const r = reach(ctx, p, conn, p.last_campaign_at);
      await c.query(
        "insert into campaign_recipients (campaign_id, workspace_id, lead_id, status, reason) values ($1, $2, $3, $4, $5)",
        [campaignId, workspaceId, p.id, r.ok ? "queued" : "skipped", r.ok ? (r.via === "template" ? "Will use your approved WhatsApp template" : r.via === "email" ? "By email" : null) : r.reason],
      );
      if (r.ok) queued++;
    }
    if (queued === 0) await c.query("update campaigns set status = 'sent', finished_at = now() where id = $1", [campaignId]);
    else await enqueue(c, { workspaceId, kind: "campaign_send", payload: { campaignId }, runAt: nextAllowedTime(new Date(), ctx.timeZone, automationConfig.quietHours), dedupeKey: `campaign:${campaignId}:0` });
    await logActivity(c, workspaceId, {
      kind: "campaign_started",
      summary: `Campaign "${input.name}" started: ${queued} to send, ${people.length - queued} skipped`,
    });
    return { campaignId, queued, skipped: people.length - queued };
  });
}

/** Sends one batch, then queues the next. Waits out quiet hours in the business's own time zone. */
export async function campaignSend(job: ClaimedJob) {
  const campaignId = String(job.payload.campaignId ?? "");
  const batchNo = Number(job.payload.batch ?? 0);
  if (!isUuid(campaignId)) return;
  const plan = await withTenant(job.workspace_id, async (c) => {
    const ctx = await loadContext(c, job.workspace_id);
    const camp = (await c.query<{ name: string; message: string; status: string }>("select name, message, status from campaigns where id = $1", [campaignId])).rows[0];
    if (!ctx || !camp || camp.status !== "sending") return null;
    if (inQuietHours(new Date(), ctx.timeZone, automationConfig.quietHours)) {
      await enqueue(c, {
        workspaceId: job.workspace_id,
        kind: "campaign_send",
        payload: { campaignId, batch: batchNo + 1 },
        runAt: nextAllowedTime(new Date(), ctx.timeZone, automationConfig.quietHours),
        dedupeKey: `campaign:${campaignId}:${batchNo + 1}`,
      });
      return null;
    }
    const conn = await connections(c);
    const batch = await c.query<Lead & { last_campaign_at: Date | null }>(
      `select l.*, (select max(r2.sent_at) from campaign_recipients r2 where r2.lead_id = l.id and r2.status = 'sent') as last_campaign_at
       from campaign_recipients r join leads l on l.id = r.lead_id
       where r.campaign_id = $1 and r.status = 'queued' limit ${automationConfig.campaigns.batchSize}`,
      [campaignId],
    );
    const toSend: { leadId: string; messageId: string }[] = [];
    for (const lead of batch.rows) {
      // Checked again at send time: someone may have opted out since the campaign started.
      const r = reach(ctx, lead, conn, lead.last_campaign_at);
      if (!r.ok) {
        await c.query("update campaign_recipients set status = 'skipped', reason = $3 where campaign_id = $1 and lead_id = $2", [campaignId, lead.id, r.reason]);
        continue;
      }
      const body = render(camp.message, { firstName: firstName(lead.name, ""), businessName: ctx.businessName });
      const m = await c.query<{ id: string }>(
        `insert into messages (workspace_id, lead_id, direction, author, body, status, channel, sequence_id)
         values ($1, $2, 'out', 'automation', $3, 'queued', $4, $5) returning id`,
        [job.workspace_id, lead.id, body, r.via === "email" ? "email" : lead.channel, `campaign:${campaignId}`],
      );
      await c.query("update campaign_recipients set message_id = $3 where campaign_id = $1 and lead_id = $2", [campaignId, lead.id, m.rows[0].id]);
      toSend.push({ leadId: lead.id, messageId: m.rows[0].id });
    }
    return { toSend, name: camp.name };
  });
  if (!plan) return;

  for (const { leadId, messageId } of plan.toSend) {
    let status: "sent" | "skipped" | "failed" = "sent";
    let reason: string | null = null;
    try {
      const outcome = await deliverMessage(job.workspace_id, messageId);
      if (outcome === "skipped" || outcome === "failed") {
        status = outcome;
        reason = await withTenant(job.workspace_id, async (c) => (await c.query<{ status_detail: string | null }>("select status_detail from messages where id = $1", [messageId])).rows[0]?.status_detail ?? null);
      }
    } catch {
      // The channel is briefly down: a delivery job keeps retrying this one message.
      await withTenant(job.workspace_id, (c) => enqueue(c, { workspaceId: job.workspace_id, kind: "deliver", leadId, payload: { messageId }, dedupeKey: `deliver:${messageId}` }));
      reason = "Delivery is being retried";
    }
    await withTenant(job.workspace_id, (c) =>
      c.query("update campaign_recipients set status = $3, reason = coalesce($4, reason), sent_at = case when $3 = 'sent' then now() else sent_at end where campaign_id = $1 and lead_id = $2", [
        campaignId,
        leadId,
        status,
        reason,
      ]),
    );
  }

  await withTenant(job.workspace_id, async (c) => {
    const left = (await c.query<{ n: number }>("select count(*)::int as n from campaign_recipients where campaign_id = $1 and status = 'queued'", [campaignId])).rows[0].n;
    if (left > 0) {
      await enqueue(c, { workspaceId: job.workspace_id, kind: "campaign_send", payload: { campaignId, batch: batchNo + 1 }, dedupeKey: `campaign:${campaignId}:${batchNo + 1}` });
    } else {
      const done = await c.query("update campaigns set status = 'sent', finished_at = now() where id = $1 and status = 'sending' returning id", [campaignId]);
      if (done.rowCount) await logActivity(c, job.workspace_id, { kind: "campaign_sent", summary: `Campaign "${plan.name}" finished sending` });
    }
  });
}

export async function cancelCampaign(workspaceId: string, campaignId: string) {
  if (!isUuid(campaignId)) return;
  await withTenant(workspaceId, async (c) => {
    const r = await c.query("update campaigns set status = 'cancelled', finished_at = now() where id = $1 and status = 'sending' returning name", [campaignId]);
    if (!r.rowCount) return;
    await c.query("update campaign_recipients set status = 'skipped', reason = 'Campaign stopped' where campaign_id = $1 and status = 'queued'", [campaignId]);
    await logActivity(c, workspaceId, { kind: "campaign_cancelled", summary: `Campaign "${r.rows[0].name}" stopped` });
  });
}

export type CampaignStats = {
  id: string;
  name: string;
  segment: Segment;
  status: string;
  created_at: Date;
  message: string;
  audience: number;
  sent: number;
  skipped: number;
  failed: number;
  queued: number;
  replied: number;
  booked: number;
  won: number;
  revenue: number;
};

/** Each campaign with what it produced: replies, bookings and revenue from the people it reached. */
export async function campaignStats(workspaceId: string, limit = 30): Promise<CampaignStats[]> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<CampaignStats>(
      `select ca.id, ca.name, ca.segment, ca.status, ca.created_at, ca.message,
         count(r.lead_id)::int as audience,
         count(*) filter (where r.status = 'sent')::int as sent,
         count(*) filter (where r.status = 'skipped')::int as skipped,
         count(*) filter (where r.status = 'failed')::int as failed,
         count(*) filter (where r.status = 'queued')::int as queued,
         count(*) filter (where r.status = 'sent' and exists (
           select 1 from messages m where m.lead_id = r.lead_id and m.direction = 'in' and m.created_at > r.sent_at))::int as replied,
         count(*) filter (where r.status = 'sent' and l.booked_at > r.sent_at and l.booked_at < r.sent_at + make_interval(days => $1))::int as booked,
         count(*) filter (where r.status = 'sent' and l.won_at > r.sent_at and l.won_at < r.sent_at + make_interval(days => $1))::int as won,
         coalesce(sum(l.value) filter (where r.status = 'sent' and l.won_at > r.sent_at and l.won_at < r.sent_at + make_interval(days => $1)), 0)::float as revenue
       from campaigns ca
       left join campaign_recipients r on r.campaign_id = ca.id
       left join leads l on l.id = r.lead_id
       group by ca.id order by ca.created_at desc limit $2`,
      [automationConfig.campaigns.attributionDays, limit],
    );
    return rows;
  });
}

export async function campaignSkips(workspaceId: string, campaignId: string) {
  if (!isUuid(campaignId)) return [];
  return withTenant(workspaceId, async (c) =>
    (
      await c.query<{ reason: string; count: number }>(
        "select coalesce(reason, 'Unknown') as reason, count(*)::int as count from campaign_recipients where campaign_id = $1 and status in ('skipped', 'failed') group by 1 order by 2 desc",
        [campaignId],
      )
    ).rows,
  );
}
