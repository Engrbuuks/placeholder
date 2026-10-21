import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { bookingForToken, cancelBooking } from "@/lib/booking";
import { formatBookingTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

async function cancel(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  await cancelBooking(token, "customer");
  redirect(`/b/manage/${token}`);
}

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await bookingForToken(token);
  if (!found) notFound();
  const { booking, ctx, key, settings } = found;
  const when = formatBookingTime(booking.starts_at, ctx.timeZone, ctx.language);
  const live = booking.status === "confirmed" && booking.starts_at > new Date();
  return (
    <main lang={ctx.language} className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-soft">{ctx.businessName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Your {settings.title.toLowerCase()}</h1>
        <p className="mt-2 text-[0.9375rem]">{when}</p>
        <p className="mt-1 font-mono text-xs text-ink-soft">
          {booking.status === "cancelled" ? "Cancelled" : booking.status === "completed" ? "Done" : booking.status === "no_show" ? "Missed" : "Confirmed"}
        </p>
        {live ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`/b/manage/${token}/ics`} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">
              Add to calendar
            </a>
            <a href={`/b/${key}?reschedule=${token}`} className="rounded-full border border-line px-4 py-2 text-sm">
              Change time
            </a>
            <form action={cancel}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm text-accent-deep">
                Cancel booking
              </button>
            </form>
          </div>
        ) : (
          booking.status === "cancelled" && (
            <a href={`/b/${key}`} className="mt-6 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
              Book a new time
            </a>
          )
        )}
      </div>
    </main>
  );
}
