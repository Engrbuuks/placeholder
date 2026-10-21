// Self booking: customers pick a free time from the business's own hours, and the booking, the lead,
// the reminders and the confirmation are all made together. Two people can never take the last place
// in the same slot: bookings for a business are made one at a time under a database lock.
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { globalQuery, isUuid, withTenant } from "./db";
import { logActivity, notify } from "./activity";
import { cancelLeadJobs } from "./queue";
import { render, firstName } from "./templates";
import { formatBookingTime, zonedLocalToDate } from "./time";
import type { Attribution } from "./attribution";
import { normalisePhone } from "./phone";
import { loadContext, type WorkspaceContext } from "./pipeline/context";
import { publicTokenFor } from "./leadToken";
export { publicTokenFor };
import { scheduleBookingReminders } from "./pipeline/sequences";
import { deliverOrQueue } from "./pipeline/jobs";

export type BookingSettings = {
  enabled: boolean;
  title: string;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  capacity: number;
  weekly: Record<string, [string, string]>;
  closedDates: string[];
};

export const defaultBookingSettings: BookingSettings = {
  enabled: false,
  title: "Appointment",
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  capacity: 1,
  weekly: { "1": ["09:00", "17:00"], "2": ["09:00", "17:00"], "3": ["09:00", "17:00"], "4": ["09:00", "17:00"], "5": ["09:00", "17:00"] },
  closedDates: [],
};

type SettingsRow = {
  enabled: boolean;
  title: string;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  capacity: number;
  weekly: Record<string, [string, string]>;
  closed_dates: (string | Date)[];
};

const isoDay = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export async function bookingSettings(c: PoolClient, workspaceId: string): Promise<BookingSettings> {
  const r = (await c.query<SettingsRow>("select * from booking_settings where workspace_id = $1", [workspaceId])).rows[0];
  if (!r) return defaultBookingSettings;
  return {
    enabled: r.enabled,
    title: r.title,
    slotMinutes: r.slot_minutes,
    bufferMinutes: r.buffer_minutes,
    minNoticeHours: r.min_notice_hours,
    maxDaysAhead: r.max_days_ahead,
    capacity: r.capacity,
    weekly: r.weekly,
    closedDates: r.closed_dates.map(isoDay),
  };
}

/** The local calendar date (YYYY-MM-DD) and weekday of a moment in a time zone. */
function localDate(date: Date, timeZone: string): { day: string; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday };
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export type Slot = { start: Date; end: Date; day: string; label: string };

/**
 * Every bookable slot from now to the booking horizon, in the business's time zone, with slots already full
 * left out. Pure, so the rules can be tested without a database.
 */
export function availableSlots(
  settings: BookingSettings,
  timeZone: string,
  taken: { starts_at: Date; ends_at: Date }[],
  now = new Date(),
): Slot[] {
  const slots: Slot[] = [];
  const earliest = now.getTime() + settings.minNoticeHours * 3600_000;
  const today = localDate(now, timeZone).day;
  const closed = new Set(settings.closedDates);
  for (let i = 0; i <= settings.maxDaysAhead; i++) {
    const day = addDays(today, i);
    if (closed.has(day)) continue;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const hours = settings.weekly[String(weekday)];
    if (!hours) continue;
    const open = toMinutes(hours[0]);
    const close = toMinutes(hours[1]);
    for (let m = open; m + settings.slotMinutes <= close; m += settings.slotMinutes + settings.bufferMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const start = zonedLocalToDate(`${day}T${hh}:${mm}`, timeZone);
      if (!start || start.getTime() < earliest) continue;
      const end = new Date(start.getTime() + settings.slotMinutes * 60_000);
      const overlapping = taken.filter((t) => t.starts_at < end && t.ends_at > start).length;
      if (overlapping >= settings.capacity) continue;
      slots.push({ start, end, day, label: `${hh}:${mm}` });
    }
  }
  return slots;
}

async function takenSlots(c: PoolClient, excludeBookingId?: string) {
  return (
    await c.query<{ starts_at: Date; ends_at: Date }>(
      "select starts_at, ends_at from bookings where status = 'confirmed' and ends_at > now() and ($1::uuid is null or id <> $1::uuid)",
      [excludeBookingId ?? null],
    )
  ).rows;
}

export async function slotsFor(workspaceId: string, excludeBookingId?: string) {
  return withTenant(workspaceId, async (c) => {
    const ctx = (await loadContext(c, workspaceId))!;
    const settings = await bookingSettings(c, workspaceId);
    return { settings, ctx, slots: settings.enabled ? availableSlots(settings, ctx.timeZone, await takenSlots(c, excludeBookingId)) : [] };
  });
}

const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

/** The booking page link for one customer, so the booking lands on their conversation. */
export async function bookingInvite(c: PoolClient, ctx: WorkspaceContext, leadId: string): Promise<string | null> {
  const settings = await bookingSettings(c, ctx.workspaceId);
  if (!settings.enabled) return null;
  const key = (await c.query<{ public_key: string }>("select public_key from channel_connections where channel = 'webchat'")).rows[0]?.public_key;
  if (!key) return null;
  const token = await publicTokenFor(c, leadId);
  return render(ctx.locale.assistant.bookingInvite, { link: `${appUrl()}/b/${key}?l=${token}` });
}

export const bookingRequestSchema = z
  .object({
    start: z.string().datetime({ offset: true }),
    name: z.string().trim().min(1, "Add your name.").max(80),
    phone: z.string().trim().max(30).default(""),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Check the email address.").max(200)]).default(""),
    note: z.string().trim().max(500).default(""),
    lead: z.string().max(40).optional(),
    reschedule: z.string().max(40).optional(),
  })
  .refine((d) => d.phone || d.email || d.lead || d.reschedule, { message: "Add a phone number or an email so we can confirm." });

export type BookingOutcome = { ok: true; bookingId: string; manageToken: string; when: string } | { ok: false; error: string };

/**
 * Books a slot. Under a lock per business: checks the slot is still free, finds or creates the customer,
 * records the booking, moves the conversation to booked, schedules reminders and sends the confirmation.
 */
export async function bookSlot(workspaceId: string, input: z.infer<typeof bookingRequestSchema>, attribution: Attribution = {}): Promise<BookingOutcome> {
  const start = new Date(input.start);
  const done = await withTenant(workspaceId, async (c): Promise<(BookingOutcome & { messageId?: string; leadId?: string }) | { ok: false; error: string }> => {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1, 1))", [`booking:${workspaceId}`]);
    const ctx = (await loadContext(c, workspaceId))!;
    const settings = await bookingSettings(c, workspaceId);
    if (!settings.enabled) return { ok: false, error: "Online booking is not open right now." };

    // Rescheduling keeps the same booking and customer.
    const existing = input.reschedule
      ? (await c.query<{ id: string; lead_id: string; manage_token: string }>("select id, lead_id, manage_token from bookings where manage_token = $1 and status = 'confirmed'", [input.reschedule])).rows[0]
      : undefined;
    if (input.reschedule && !existing) return { ok: false, error: "That booking was cancelled or already changed. Choose a new time below." };

    const free = availableSlots(settings, ctx.timeZone, await takenSlots(c, existing?.id)).some((s) => s.start.getTime() === start.getTime());
    if (!free) return { ok: false, error: "Sorry, that time was just taken. Please choose another." };
    const end = new Date(start.getTime() + settings.slotMinutes * 60_000);

    let leadId = existing?.lead_id;
    if (!leadId && input.lead) leadId = (await c.query<{ id: string }>("select id from leads where public_token = $1", [input.lead])).rows[0]?.id;
    if (!leadId) {
      const phone = input.phone ? normalisePhone(input.phone, ctx.country) : null;
      if (input.phone && !phone) return { ok: false, error: "Check the phone number." };
      const sms = phone ? (await c.query("select 1 from channel_connections where channel = 'sms' and secret_enc is not null")).rowCount : 0;
      const channel = phone && sms ? "sms" : input.email ? "email" : "form";
      const externalId = channel === "sms" ? phone! : channel === "email" ? input.email : `${input.name.toLowerCase()}:${phone}`;
      const lead = await c.query<{ id: string }>(
        `insert into leads (workspace_id, channel, external_id, name, phone, email, source, utm_source, utm_medium, utm_campaign, landing_page, referrer)
         values ($1, $2, $3, $4, $5, $6, 'booking', $7, $8, $9, $10, $11)
         on conflict (workspace_id, channel, external_id) do update set name = coalesce(leads.name, excluded.name), updated_at = now()
         returning id`,
        [workspaceId, channel, externalId, input.name, phone, input.email || null, attribution.utmSource ?? null, attribution.utmMedium ?? null, attribution.utmCampaign ?? null, attribution.landingPage ?? null, attribution.referrer ?? null],
      );
      leadId = lead.rows[0].id;
    }

    let bookingId: string;
    let manageToken: string;
    if (existing) {
      await c.query("update bookings set starts_at = $2, ends_at = $3 where id = $1", [existing.id, start, end]);
      bookingId = existing.id;
      manageToken = existing.manage_token;
    } else {
      // One live booking per customer: a new one replaces the old.
      await c.query("update bookings set status = 'cancelled', cancelled_at = now() where lead_id = $1 and status = 'confirmed'", [leadId]);
      manageToken = randomBytes(15).toString("base64url");
      bookingId = (
        await c.query<{ id: string }>(
          "insert into bookings (workspace_id, lead_id, starts_at, ends_at, source, note, manage_token) values ($1, $2, $3, $4, 'self', $5, $6) returning id",
          [workspaceId, leadId, start, end, input.note || null, manageToken],
        )
      ).rows[0].id;
    }
    await c.query(
      `update leads set stage = 'booked', booked_for = $2, booked_at = coalesce(booked_at, now()), automation_paused = false,
         handoff_reason = null, updated_at = now(), unread = unread + 1 where id = $1`,
      [leadId, start],
    );
    await cancelLeadJobs(c, leadId, "no_reply");
    const lead = (await c.query<{ id: string; name: string | null; channel: string; opted_out_at: Date | null }>("select id, name, channel, opted_out_at from leads where id = $1", [leadId])).rows[0];
    await scheduleBookingReminders(c, ctx, { id: leadId }, start);

    const when = formatBookingTime(start, ctx.timeZone, ctx.language);
    const manageLink = `${appUrl()}/b/manage/${manageToken}`;
    const who = lead.name ?? "A customer";
    await logActivity(c, workspaceId, {
      leadId,
      kind: existing ? "booking_moved" : "booking_made",
      summary: existing ? `${who} moved their booking to ${when}` : `${who} booked ${settings.title.toLowerCase()} for ${when} online`,
    });
    await notify(c, workspaceId, {
      kind: "booking",
      title: existing ? `${who} moved their booking` : `New booking: ${who}`,
      body: `${settings.title} on ${when}.${input.note ? ` Note: ${input.note}` : ""}`,
      link: `/inbox/${leadId}`,
      email: true,
    });

    let messageId: string | undefined;
    if (!lead.opted_out_at && lead.channel !== "form") {
      const text = render(existing ? ctx.locale.assistant.bookingRescheduled : ctx.locale.assistant.bookingConfirmed, {
        businessName: ctx.businessName,
        bookingTime: when,
        link: manageLink,
        firstName: firstName(lead.name, ""),
      });
      messageId = (
        await c.query<{ id: string }>(
          "insert into messages (workspace_id, lead_id, direction, author, body, status, channel, sequence_id) values ($1, $2, 'out', 'automation', $3, 'queued', $4, 'booking') returning id",
          [workspaceId, leadId, text, lead.channel],
        )
      ).rows[0].id;
    }
    return { ok: true, bookingId, manageToken, when, messageId, leadId };
  });
  if (done.ok && "messageId" in done && done.messageId && done.leadId) await deliverOrQueue(workspaceId, done.leadId, done.messageId);
  return done.ok ? { ok: true, bookingId: done.bookingId, manageToken: done.manageToken, when: done.when } : done;
}

export async function bookingForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const { rows } = await globalQuery<{ workspace_id: string; booking_id: string }>("select * from booking_by_token($1)", [token]);
  const t = rows[0];
  if (!t) return null;
  return withTenant(t.workspace_id, async (c) => {
    const ctx = (await loadContext(c, t.workspace_id))!;
    const b = (
      await c.query<{ id: string; lead_id: string; starts_at: Date; ends_at: Date; status: string; manage_token: string }>("select * from bookings where id = $1", [t.booking_id])
    ).rows[0];
    const key = (await c.query<{ public_key: string }>("select public_key from channel_connections where channel = 'webchat'")).rows[0]?.public_key ?? "";
    const settings = await bookingSettings(c, t.workspace_id);
    return { workspaceId: t.workspace_id, booking: b, ctx, key, settings };
  });
}

export async function cancelBooking(token: string, by: "customer" | "owner"): Promise<boolean> {
  const found = await bookingForToken(token);
  if (!found || found.booking.status !== "confirmed") return false;
  const { workspaceId, booking, ctx, key } = found;
  const messageId = await withTenant(workspaceId, async (c) => {
    await c.query("update bookings set status = 'cancelled', cancelled_at = now() where id = $1", [booking.id]);
    await c.query("update leads set stage = 'qualified', booked_for = null, updated_at = now() where id = $1 and stage = 'booked'", [booking.lead_id]);
    await cancelLeadJobs(c, booking.lead_id, "booked");
    const lead = (await c.query<{ name: string | null; channel: string; opted_out_at: Date | null }>("select name, channel, opted_out_at from leads where id = $1", [booking.lead_id])).rows[0];
    const when = formatBookingTime(booking.starts_at, ctx.timeZone, ctx.language);
    const who = lead.name ?? "A customer";
    await logActivity(c, workspaceId, { leadId: booking.lead_id, kind: "booking_cancelled", summary: by === "customer" ? `${who} cancelled their booking for ${when}` : `You cancelled the booking for ${when}` });
    if (by === "customer") {
      await notify(c, workspaceId, { kind: "booking", title: `${who} cancelled`, body: `The booking for ${when} is free again.`, link: `/inbox/${booking.lead_id}`, email: true });
      return null;
    }
    if (lead.opted_out_at || lead.channel === "form") return null;
    const text = render(ctx.locale.assistant.bookingCancelledCustomer, { businessName: ctx.businessName, bookingTime: when, link: `${appUrl()}/b/${key}` });
    return (
      await c.query<{ id: string }>(
        "insert into messages (workspace_id, lead_id, direction, author, body, status, channel, sequence_id) values ($1, $2, 'out', 'automation', $3, 'queued', $4, 'booking') returning id",
        [workspaceId, booking.lead_id, text, lead.channel],
      )
    ).rows[0].id;
  });
  if (messageId) await deliverOrQueue(workspaceId, booking.lead_id, messageId);
  return true;
}

/** An .ics file so the customer can add the booking to their own calendar. */
export function icsFor(b: { id: string; starts_at: Date; ends_at: Date }, title: string, businessName: string): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Placeholder//Booking//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@placeholder`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(b.starts_at)}`,
    `DTEND:${stamp(b.ends_at)}`,
    `SUMMARY:${esc(`${title} with ${businessName}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Upcoming and recent bookings for the owner's Bookings page. */
export async function bookingsFor(workspaceId: string) {
  return withTenant(workspaceId, async (c) =>
    (
      await c.query<{ id: string; lead_id: string; starts_at: Date; ends_at: Date; status: string; source: string; note: string | null; name: string | null; phone: string | null; email: string | null; channel: string; manage_token: string }>(
        `select b.*, l.name, l.phone, l.email, l.channel from bookings b join leads l on l.id = b.lead_id
         where b.starts_at > now() - interval '7 days' and b.status <> 'cancelled' order by b.starts_at limit 200`,
      )
    ).rows,
  );
}

/** After the appointment: showed up (and optionally the sale value) or did not. */
export async function markBookingOutcome(workspaceId: string, bookingId: string, outcome: "completed" | "no_show") {
  if (!isUuid(bookingId)) return null;
  return withTenant(workspaceId, async (c) => {
    const r = await c.query<{ lead_id: string }>("update bookings set status = $2 where id = $1 and status = 'confirmed' returning lead_id", [bookingId, outcome]);
    if (!r.rows[0]) return null;
    await logActivity(c, workspaceId, { leadId: r.rows[0].lead_id, kind: "booking_outcome", summary: outcome === "completed" ? "Came to their appointment" : "Did not come to their appointment" });
    return r.rows[0].lead_id;
  });
}

