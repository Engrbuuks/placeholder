// Read models for the owner's screens: inbox, conversation, automations, channels, notifications.
import { withTenant } from "./db";
import { automationConfig } from "./config";
import { encryptionReady } from "./crypto";
import { emailConfigured } from "./channels/email";
import { settingsFromRow, type Lead, type Settings } from "./pipeline/context";

export type InboxFilter = "all" | "needs_you" | "hot" | "open" | "booked" | "closed";

export type InboxRow = Lead & { last_body: string | null; last_at: Date | null; last_direction: "in" | "out" | null; last_author: string | null; pending: number };

const filterSql: Record<InboxFilter, string> = {
  all: "true",
  needs_you: "(l.stage = 'handoff' or l.unread > 0 or exists (select 1 from messages p where p.lead_id = l.id and p.status = 'pending_approval'))",
  hot: `l.heat >= ${Number(automationConfig.scoring.hot)} and l.stage in ('new', 'qualifying', 'qualified', 'handoff')`,
  open: "l.stage in ('new', 'qualifying', 'qualified', 'handoff')",
  booked: "l.stage = 'booked'",
  closed: "l.stage in ('won', 'lost')",
};

export async function listLeads(workspaceId: string, filter: InboxFilter = "all", limit = 100): Promise<InboxRow[]> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<InboxRow>(
      `select l.*, last.body as last_body, last.created_at as last_at, last.direction as last_direction, last.author as last_author,
              (select count(*)::int from messages p where p.lead_id = l.id and p.status = 'pending_approval') as pending
       from leads l
       left join lateral (
         select body, created_at, direction, author from messages m where m.lead_id = l.id and m.status <> 'discarded'
         order by created_at desc, id desc limit 1
       ) last on true
       where ${filterSql[filter]}
       order by ${filter === "hot" ? "l.heat desc, " : ""}coalesce(last.created_at, l.updated_at) desc
       limit $1`,
      [limit],
    );
    return rows;
  });
}

export async function inboxCounts(workspaceId: string) {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<Record<InboxFilter, number>>(
      `select count(*)::int as all,
              count(*) filter (where ${filterSql.needs_you})::int as needs_you,
              count(*) filter (where ${filterSql.hot})::int as hot,
              count(*) filter (where ${filterSql.open})::int as open,
              count(*) filter (where ${filterSql.booked})::int as booked,
              count(*) filter (where ${filterSql.closed})::int as closed
       from leads l`,
    );
    return rows[0];
  });
}

export type ThreadMessage = {
  id: string;
  direction: "in" | "out";
  author: "customer" | "assistant" | "owner" | "automation";
  body: string;
  status: string;
  status_detail: string | null;
  ai_written: boolean;
  created_at: Date;
};

export async function leadDetail(workspaceId: string, leadId: string) {
  return withTenant(workspaceId, async (c) => {
    const lead = (await c.query<Lead>("select * from leads where id = $1", [leadId])).rows[0];
    if (!lead) return null;
    const messages = (
      await c.query<ThreadMessage>(
        "select id, direction, author, body, status, status_detail, ai_written, created_at from messages where lead_id = $1 order by created_at, id",
        [leadId],
      )
    ).rows;
    const upcoming = (
      await c.query<{ id: number; run_at: Date; payload: { trigger: string; stepIndex: number; sequenceId: string } }>(
        "select id, run_at, payload from jobs where lead_id = $1 and status = 'queued' and kind = 'followup' order by run_at",
        [leadId],
      )
    ).rows;
    const activity = (
      await c.query<{ id: number; kind: string; summary: string; created_at: Date }>(
        "select id, kind, summary, created_at from activity where lead_id = $1 order by created_at desc, id desc limit 30",
        [leadId],
      )
    ).rows;
    return { lead, messages, upcoming, activity };
  });
}

export async function automationOverview(workspaceId: string) {
  return withTenant(workspaceId, async (c) => {
    const settings: Settings = settingsFromRow(
      (await c.query("select * from automation_settings where workspace_id = $1", [workspaceId])).rows[0],
    );
    const stats = (
      await c.query<{ scheduled: number; due: number; done_7d: number; failed_7d: number; replies_7d: number; followups_7d: number; handoffs_7d: number }>(
        `select
           (select count(*)::int from jobs where status = 'queued') as scheduled,
           (select count(*)::int from jobs where status = 'queued' and run_at <= now()) as due,
           (select count(*)::int from jobs where status = 'done' and finished_at > now() - interval '7 days') as done_7d,
           (select count(*)::int from jobs where status = 'failed' and finished_at > now() - interval '7 days') as failed_7d,
           (select count(*)::int from activity where kind = 'auto_reply' and created_at > now() - interval '7 days') as replies_7d,
           (select count(*)::int from activity where kind = 'followup_sent' and created_at > now() - interval '7 days') as followups_7d,
           (select count(*)::int from activity where kind = 'handoff' and created_at > now() - interval '7 days') as handoffs_7d`,
      )
    ).rows[0];
    const activity = (
      await c.query<{ id: number; kind: string; summary: string; created_at: Date; lead_id: string | null }>(
        "select id, kind, summary, created_at, lead_id from activity order by created_at desc, id desc limit 40",
      )
    ).rows;
    const failed = (
      await c.query<{ id: number; kind: string; last_error: string | null; lead_id: string | null; finished_at: Date; attempts: number }>(
        "select id, kind, last_error, lead_id, finished_at, attempts from jobs where status = 'failed' order by finished_at desc limit 10",
      )
    ).rows;
    const emails = (
      await c.query<{ id: number; to_address: string; subject: string; transport: string; status: string; error: string | null; created_at: Date }>(
        "select id, to_address, subject, transport, status, error, created_at from email_log order by id desc limit 8",
      )
    ).rows;
    const lastTick = (await c.query<{ at: Date | null }>("select max(finished_at) as at from jobs where status in ('done', 'failed')")).rows[0]?.at ?? null;
    return { settings, stats, activity, failed, emails, lastTick, emailReady: emailConfigured() };
  });
}

export async function channelsOverview(workspaceId: string) {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{
      channel: "webchat" | "whatsapp" | "sms";
      public_key: string | null;
      external_account_id: string | null;
      has_secret: boolean;
      settings: { templateName?: string; templateLanguage?: string; accountSid?: string };
      status: string;
      last_event_at: Date | null;
      last_error: string | null;
    }>(
      "select channel, public_key, external_account_id, secret_enc is not null as has_secret, settings, status, last_event_at, last_error from channel_connections",
    );
    return {
      webchat: rows.find((r) => r.channel === "webchat") ?? null,
      whatsapp: rows.find((r) => r.channel === "whatsapp") ?? null,
      sms: rows.find((r) => r.channel === "sms") ?? null,
      ready: {
        whatsappAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
        whatsappVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
        encryption: encryptionReady(),
        appUrl: process.env.APP_URL ?? null,
      },
    };
  });
}

export type NotificationRow = { id: number; kind: string; title: string; body: string; link: string | null; read_at: Date | null; created_at: Date };

export async function notificationsFor(workspaceId: string, limit = 8) {
  return withTenant(workspaceId, async (c) => {
    const list = (
      await c.query<NotificationRow>("select id, kind, title, body, link, read_at, created_at from notifications order by created_at desc, id desc limit $1", [
        limit,
      ])
    ).rows;
    const unread = (await c.query<{ n: number }>("select count(*)::int as n from notifications where read_at is null")).rows[0].n;
    const needsYou = (await c.query<{ n: number }>(`select count(*)::int as n from leads where stage = 'handoff' or unread > 0`)).rows[0].n;
    return { list, unread, needsYou };
  });
}

export async function automationSettingsFor(workspaceId: string): Promise<Settings> {
  return withTenant(workspaceId, async (c) => settingsFromRow((await c.query("select * from automation_settings where workspace_id = $1", [workspaceId])).rows[0]));
}
