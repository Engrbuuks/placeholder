"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { cancelBooking, markBookingOutcome } from "@/lib/booking";

export type BookingActionState = { error?: string; notice?: string };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use times like 09:00 and 17:30.");

const schema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(2, "Name what customers book, for example Consultation.").max(60),
  slotMinutes: z.coerce.number().int().min(5).max(480),
  bufferMinutes: z.coerce.number().int().min(0).max(240),
  minNoticeHours: z.coerce.number().int().min(0).max(720),
  maxDaysAhead: z.coerce.number().int().min(1).max(365),
  capacity: z.coerce.number().int().min(1).max(100),
});

export async function saveBookingSettings(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const { workspaceId } = await requireSession();
  const parsed = schema.safeParse({
    enabled: formData.get("enabled") === "on",
    title: formData.get("title"),
    slotMinutes: formData.get("slotMinutes"),
    bufferMinutes: formData.get("bufferMinutes") || 0,
    minNoticeHours: formData.get("minNoticeHours") || 0,
    maxDaysAhead: formData.get("maxDaysAhead"),
    capacity: formData.get("capacity") || 1,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const weekly: Record<string, [string, string]> = {};
  for (let d = 0; d < 7; d++) {
    if (formData.get(`open${d}`) !== "on") continue;
    const from = time.safeParse(formData.get(`from${d}`));
    const to = time.safeParse(formData.get(`to${d}`));
    if (!from.success || !to.success) return { error: "Use times like 09:00 and 17:30 for each open day." };
    if (from.data >= to.data) return { error: "Each day's closing time must be after its opening time." };
    weekly[String(d)] = [from.data, to.data];
  }
  if (parsed.data.enabled && Object.keys(weekly).length === 0) return { error: "Open at least one day before turning online booking on." };
  const closed = String(formData.get("closedDates") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (closed.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(d).getTime()))) return { error: "Write closed dates as 2026-12-25, one per line." };
  const d = parsed.data;
  await withTenant(workspaceId, async (c) => {
    await c.query(
      `insert into booking_settings (workspace_id, enabled, title, slot_minutes, buffer_minutes, min_notice_hours, max_days_ahead, capacity, weekly, closed_dates, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       on conflict (workspace_id) do update set enabled = $2, title = $3, slot_minutes = $4, buffer_minutes = $5, min_notice_hours = $6,
         max_days_ahead = $7, capacity = $8, weekly = $9, closed_dates = $10, updated_at = now()`,
      [workspaceId, d.enabled, d.title, d.slotMinutes, d.bufferMinutes, d.minNoticeHours, d.maxDaysAhead, d.capacity, JSON.stringify(weekly), closed],
    );
    await logActivity(c, workspaceId, { kind: "settings", summary: `Online booking ${d.enabled ? "on" : "off"}` });
  });
  revalidatePath("/bookings");
  return { notice: d.enabled ? "Saved. Your booking page is live, and the assistant now offers it to customers who are ready." : "Saved. Online booking is off." };
}

export async function bookingOutcomeAction(formData: FormData) {
  const { workspaceId } = await requireSession();
  const outcome = formData.get("outcome") === "no_show" ? "no_show" : "completed";
  await markBookingOutcome(workspaceId, String(formData.get("bookingId") ?? ""), outcome);
  revalidatePath("/bookings");
}

export async function ownerCancelBookingAction(formData: FormData) {
  await requireSession();
  await cancelBooking(String(formData.get("token") ?? ""), "owner");
  revalidatePath("/bookings");
}
