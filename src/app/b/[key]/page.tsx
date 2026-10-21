import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { slotsFor } from "@/lib/booking";
import { workspaceForWebchat } from "@/lib/webchat";
import { BookingPicker } from "@/components/BookingPicker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book", robots: { index: false } };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ l?: string; reschedule?: string }> }) {
  const { key } = await params;
  const { l, reschedule } = await searchParams;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) notFound();
  const { settings, ctx, slots } = await slotsFor(workspaceId);
  const lang = ctx.language === "en" ? "en-GB" : ctx.language;
  const dayLabel = new Intl.DateTimeFormat(lang, { timeZone: ctx.timeZone, weekday: "short", day: "numeric", month: "short" });
  const days = new Map<string, { label: string; times: { start: string; label: string }[] }>();
  for (const s of slots) {
    const d = days.get(s.day) ?? { label: dayLabel.format(s.start), times: [] };
    d.times.push({ start: s.start.toISOString(), label: s.label });
    days.set(s.day, d);
  }
  const zone = ctx.timeZone.split("/").pop()!.replaceAll("_", " ");
  return (
    <main lang={ctx.language} className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-soft">{ctx.businessName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{reschedule ? `Change your ${settings.title.toLowerCase()}` : `Book ${settings.title.toLowerCase()}`}</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          {settings.slotMinutes} minutes. Times are in {zone} time.
        </p>
        {!settings.enabled ? (
          <p className="mt-6 rounded-xl bg-mist px-4 py-4 text-[0.9375rem]">Online booking is not open right now. Please contact us directly.</p>
        ) : days.size === 0 ? (
          <p className="mt-6 rounded-xl bg-mist px-4 py-4 text-[0.9375rem]">There are no free times in the next {settings.maxDaysAhead} days. Please contact us directly.</p>
        ) : (
          <BookingPicker
            bookingKey={key}
            days={[...days.entries()].map(([day, d]) => ({ day, ...d }))}
            leadToken={l}
            rescheduleToken={reschedule}
            askContact={!l && !reschedule}
          />
        )}
      </div>
    </main>
  );
}
