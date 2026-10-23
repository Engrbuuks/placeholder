import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { loadAppPage } from "@/lib/shell";
import { withTenant } from "@/lib/db";
import { bookingSettings, bookingsFor } from "@/lib/booking";
import { ensureWebchat } from "@/lib/webchat";
import { bookingOutcomeAction, ownerCancelBookingAction } from "@/app/actions/booking";
import { EmptyBookingsArt, EmptyState } from "@/components/illustrations";
import { AppShell } from "@/components/AppShell";
import { BookingSettingsForm } from "@/components/BookingSettingsForm";
import { ChannelChip } from "@/components/inbox";
import { CopyButton, SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export default async function BookingsPage() {
  const { session, workspace, shell } = await loadAppPage();
  const key = await ensureWebchat(session.workspaceId);
  const [settings, list, base] = await Promise.all([
    withTenant(session.workspaceId, (c) => bookingSettings(c, session.workspaceId)),
    bookingsFor(session.workspaceId),
    origin(),
  ]);
  const link = `${base}/b/${key}`;
  const embed = `<iframe src="${link}" title="Book online" style="width:100%;max-width:560px;height:760px;border:0" loading="lazy"></iframe>`;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: workspace.timeZone, weekday: "long", day: "numeric", month: "long" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: workspace.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  const now = new Date();
  const groups = new Map<string, typeof list>();
  for (const b of list) groups.set(day.format(b.starts_at), [...(groups.get(day.format(b.starts_at)) ?? []), b]);

  return (
    <AppShell {...shell} active="bookings" title="Bookings" subtitle="Customers book themselves; you see every appointment in one place">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">Appointments</h2>
          {list.length === 0 ? (
            <EmptyState art={EmptyBookingsArt}>
              No appointments yet.{" "}
              {settings.enabled
                ? "Share your booking link, and the assistant offers it to customers who are ready."
                : "Turn online booking on to let customers book themselves."}
            </EmptyState>
          ) : (
            <div className="mt-4 space-y-5">
              {[...groups.entries()].map(([label, items]) => (
                <div key={label}>
                  <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-soft">{label}</p>
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {items.map((b) => {
                      const past = b.starts_at < now;
                      return (
                        <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2">
                              <span className="font-mono text-sm tabular-nums">{time.format(b.starts_at)}</span>
                              <Link href={`/inbox/${b.lead_id}`} className="truncate font-medium hover:underline">
                                {b.name ?? b.phone ?? b.email ?? "Customer"}
                              </Link>
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-soft">
                              <ChannelChip channel={b.channel} />
                              {b.source === "owner" ? "Booked by you" : "Booked online"}
                              {b.note && <span>/ {b.note}</span>}
                            </p>
                          </div>
                          {b.status === "confirmed" ? (
                            past ? (
                              <div className="flex gap-2">
                                <form action={bookingOutcomeAction}>
                                  <input type="hidden" name="bookingId" value={b.id} />
                                  <input type="hidden" name="outcome" value="completed" />
                                  <SubmitButton tone="quiet" pending="Saving">
                                    Came
                                  </SubmitButton>
                                </form>
                                <form action={bookingOutcomeAction}>
                                  <input type="hidden" name="bookingId" value={b.id} />
                                  <input type="hidden" name="outcome" value="no_show" />
                                  <SubmitButton tone="quiet" pending="Saving">
                                    No show
                                  </SubmitButton>
                                </form>
                              </div>
                            ) : (
                              <form action={ownerCancelBookingAction}>
                                <input type="hidden" name="token" value={b.manage_token} />
                                <SubmitButton tone="quiet" pending="Cancelling">
                                  Cancel
                                </SubmitButton>
                              </form>
                            )
                          ) : (
                            <span className="font-mono text-xs text-ink-soft">{b.status === "completed" ? "Came" : "No show"}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 font-mono text-[0.6875rem] text-ink-soft">
            After someone comes, open their conversation and mark the sale won with its value, so it shows in Results.
          </p>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">Your booking link</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-mist px-3 py-2 font-mono text-[0.75rem]">{link}</code>
              <CopyButton text={link} />
            </div>
            <a href={`/b/${key}`} target="_blank" rel="noopener" className="mt-2 inline-block text-sm underline underline-offset-4">
              Open the booking page
            </a>
            <p className="mt-4 text-sm font-medium">Code for your website</p>
            <div className="mt-1 rounded-xl bg-ink p-3">
              <code className="block break-all font-mono text-[0.75rem] text-white/90">{embed}</code>
            </div>
            <div className="mt-2">
              <CopyButton text={embed} label="Copy code" />
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">Availability</h2>
            <div className="mt-4">
              <BookingSettingsForm settings={settings} />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
