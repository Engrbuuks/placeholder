"use client";

import { useState } from "react";

type Day = { day: string; label: string; times: { start: string; label: string }[] };

const input = "mt-1.5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink focus:border-ink focus:outline-none";

export function BookingPicker({
  bookingKey,
  days,
  leadToken,
  rescheduleToken,
  askContact,
}: {
  bookingKey: string;
  days: Day[];
  leadToken?: string;
  rescheduleToken?: string;
  askContact: boolean;
}) {
  const [day, setDay] = useState(days[0].day);
  const [start, setStart] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string; manage: string } | null>(null);
  const current = days.find((d) => d.day === day) ?? days[0];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!start) return setError("Choose a time first.");
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams(window.location.search);
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${bookingKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          start,
          name: f.get("name") ?? "Customer",
          phone: f.get("phone") ?? "",
          email: f.get("email") ?? "",
          note: f.get("note") ?? "",
          lead: leadToken,
          reschedule: rescheduleToken,
          context: { page: q.get("page") || window.location.href, referrer: q.get("ref") || document.referrer },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That did not go through. Please try again.");
      setDone({ when: data.when, manage: data.manage });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="mt-6 space-y-3 rounded-xl bg-mist p-5">
        <p className="text-lg font-semibold tracking-[-0.02em]">You are booked</p>
        <p className="text-[0.9375rem]">{done.when}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href={`${done.manage}/ics`} className="rounded-full bg-ink px-4 py-2 font-medium text-white">
            Add to calendar
          </a>
          <a href={done.manage} className="rounded-full border border-line bg-surface px-4 py-2">
            Change or cancel
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      {error && (
        <p role="alert" className="rounded-xl bg-accent-wash px-4 py-3 text-sm">
          {error}
        </p>
      )}
      <fieldset>
        <legend className="text-sm font-medium">Day</legend>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.day}
              type="button"
              aria-pressed={d.day === day}
              onClick={() => {
                setDay(d.day);
                setStart(null);
              }}
              className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${d.day === day ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/30"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Time</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {current.times.map((t) => (
            <button
              key={t.start}
              type="button"
              aria-pressed={t.start === start}
              onClick={() => setStart(t.start)}
              className={`rounded-xl border px-2 py-2.5 font-mono text-sm tabular-nums ${t.start === start ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-ink/30"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      {askContact && (
        <div className="space-y-4">
          <div>
            <label htmlFor="bk-name" className="text-sm font-medium">
              Name
            </label>
            <input id="bk-name" name="name" required maxLength={80} autoComplete="name" className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bk-phone" className="text-sm font-medium">
                Phone
              </label>
              <input id="bk-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className={input} />
            </div>
            <div>
              <label htmlFor="bk-email" className="text-sm font-medium">
                Email
              </label>
              <input id="bk-email" name="email" type="email" maxLength={200} autoComplete="email" className={input} />
            </div>
          </div>
          <div>
            <label htmlFor="bk-note" className="text-sm font-medium">
              Anything we should know? <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <textarea id="bk-note" name="note" rows={2} maxLength={500} className={input} />
          </div>
        </div>
      )}
      <button type="submit" disabled={sending || !start} className="w-full rounded-full bg-accent px-5 py-3 font-medium text-white hover:bg-accent-deep disabled:opacity-50">
        {sending ? "Booking" : rescheduleToken ? "Move my booking" : "Book this time"}
      </button>
    </form>
  );
}
