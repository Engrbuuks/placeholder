// Loads what the pipeline needs about a workspace, inside a tenant transaction.
import type { PoolClient } from "pg";
import { parseStoredBrandBrain, type BrandBrain } from "../brandBrain";
import { getPack, localeFor, workspaceTimeZone, type Locale, type MarketCode, type NichePack } from "../config";

export type Settings = {
  enabled: boolean;
  approvalMode: "auto" | "approve";
  alertEmail: string | null;
  weeklyCheck: boolean;
  reviewEnabled: boolean;
  reviewLink: string | null;
  reviewDelayHours: number;
  missedCallEnabled: boolean;
  forwardTo: string | null;
};

export const defaultSettings: Settings = {
  enabled: true,
  approvalMode: "auto",
  alertEmail: null,
  weeklyCheck: true,
  reviewEnabled: false,
  reviewLink: null,
  reviewDelayHours: 24,
  missedCallEnabled: false,
  forwardTo: null,
};

type SettingsRow = {
  enabled: boolean;
  approval_mode: "auto" | "approve";
  alert_email: string | null;
  weekly_check: boolean;
  review_enabled: boolean;
  review_link: string | null;
  review_delay_hours: number;
  missed_call_enabled: boolean;
  forward_to: string | null;
};

export function settingsFromRow(s: SettingsRow | undefined): Settings {
  if (!s) return defaultSettings;
  return {
    enabled: s.enabled,
    approvalMode: s.approval_mode,
    alertEmail: s.alert_email,
    weeklyCheck: s.weekly_check,
    reviewEnabled: s.review_enabled,
    reviewLink: s.review_link,
    reviewDelayHours: s.review_delay_hours,
    missedCallEnabled: s.missed_call_enabled,
    forwardTo: s.forward_to,
  };
}

export type WorkspaceContext = {
  workspaceId: string;
  businessName: string;
  country: MarketCode | null;
  timeZone: string;
  language: string;
  /** Fixed texts in the business's language. */
  locale: Locale;
  pack: NichePack;
  brain: BrandBrain;
  brainConfirmed: boolean;
  settings: Settings;
};

export async function loadContext(c: PoolClient, workspaceId: string): Promise<WorkspaceContext | null> {
  const ws = await c.query<{ name: string; country: MarketCode | null; niche_pack: string | null; time_zone: string | null; language: string }>(
    "select name, country, niche_pack, time_zone, language from workspaces where id = $1",
    [workspaceId],
  );
  if (!ws.rows[0]) return null;
  const brain = await c.query<{ data: unknown; status: string }>("select data, status from brand_brains where workspace_id = $1", [
    workspaceId,
  ]);
  const settings = await c.query<SettingsRow>("select * from automation_settings where workspace_id = $1", [workspaceId]);
  const data = parseStoredBrandBrain(brain.rows[0]?.data);
  const country = ws.rows[0].country;
  return {
    workspaceId,
    businessName: data.businessName || ws.rows[0].name,
    country,
    timeZone: workspaceTimeZone(country, ws.rows[0].time_zone),
    language: ws.rows[0].language,
    locale: localeFor(ws.rows[0].language),
    pack: getPack(ws.rows[0].niche_pack, country),
    brain: data,
    brainConfirmed: brain.rows[0]?.status === "confirmed",
    settings: settingsFromRow(settings.rows[0]),
  };
}

export type Lead = {
  id: string;
  workspace_id: string;
  channel: "webchat" | "whatsapp" | "sms" | "form" | "email";
  external_id: string;
  opted_out_at: Date | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  value: string | null;
  booked_at: Date | null;
  won_at: Date | null;
  lost_at: Date | null;
  marketing_consent_at: Date | null;
  review_status: "requested" | "rated" | null;
  review_rating: number | null;
  review_requested_at: Date | null;
  review_token: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  stage: "new" | "qualifying" | "qualified" | "handoff" | "booked" | "won" | "lost";
  qualifier_index: number;
  qualifier_answers: { q: string; a: string }[];
  handoff_reason: string | null;
  automation_paused: boolean;
  booked_for: Date | null;
  unread: number;
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  insight: import("../insight").Insight | null;
  insight_source: "rules" | "ai" | null;
  insight_at: Date | null;
  heat: number;
  hot_alerted_at: Date | null;
  concerns_alerted: string[];
  created_at: Date;
  updated_at: Date;
};

export async function getLead(c: PoolClient, leadId: string): Promise<Lead | null> {
  const { rows } = await c.query<Lead>("select * from leads where id = $1", [leadId]);
  return rows[0] ?? null;
}

export function leadLabel(lead: Pick<Lead, "name" | "phone" | "email" | "channel">): string {
  return lead.name || lead.phone || lead.email || (lead.channel === "webchat" ? "A website visitor" : "A WhatsApp contact");
}
