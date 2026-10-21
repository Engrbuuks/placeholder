"use client";


import { saveBookingSettings, type BookingActionState } from "@/app/actions/booking";
import type { BookingSettings } from "@/lib/booking";
import { FormError, Notice, SubmitButton, useActionForm } from "./ui";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const num = "mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none";

function NumberField({ label, name, value, help }: { label: string; name: string; value: number; help?: string }) {
  return (
    <div>
      <label htmlFor={`bs-${name}`} className="text-sm font-medium">
        {label}
      </label>
      {help && <p className="text-[0.75rem] text-ink-soft">{help}</p>}
      <input id={`bs-${name}`} name={name} type="number" min={0} defaultValue={value} className={num} />
    </div>
  );
}

export function BookingSettingsForm({ settings }: { settings: BookingSettings }) {
  const [state, action, pending] = useActionForm<BookingActionState>(saveBookingSettings, {});
  return (
    <form onSubmit={action} className="space-y-5">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block font-medium">Online booking</span>
          <span className="block text-sm text-ink-soft">Customers pick a free time themselves. Reminders and the confirmation go out on their channel.</span>
        </span>
        <span className="relative mt-1 inline-flex shrink-0">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="peer sr-only" />
          <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>
      <div>
        <label htmlFor="bs-title" className="text-sm font-medium">
          What customers book
        </label>
        <input id="bs-title" name="title" defaultValue={settings.title} maxLength={60} className={num} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NumberField label="Length (minutes)" name="slotMinutes" value={settings.slotMinutes} />
        <NumberField label="Gap after (minutes)" name="bufferMinutes" value={settings.bufferMinutes} />
        <NumberField label="Customers per time" name="capacity" value={settings.capacity} />
        <NumberField label="Notice needed (hours)" name="minNoticeHours" value={settings.minNoticeHours} />
        <NumberField label="Book up to (days ahead)" name="maxDaysAhead" value={settings.maxDaysAhead} />
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Opening hours for bookings</legend>
        <div className="mt-2 divide-y divide-line rounded-xl border border-line">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const hours = settings.weekly[String(d)];
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <input type="checkbox" name={`open${d}`} defaultChecked={Boolean(hours)} className="accent-[var(--color-accent)]" />
                  {days[d]}
                </label>
                <input aria-label={`${days[d]} opens`} type="time" name={`from${d}`} defaultValue={hours?.[0] ?? "09:00"} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
                <span className="text-sm text-ink-soft">to</span>
                <input aria-label={`${days[d]} closes`} type="time" name={`to${d}`} defaultValue={hours?.[1] ?? "17:00"} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
              </div>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="bs-closed" className="text-sm font-medium">
          Closed dates
        </label>
        <p className="text-[0.75rem] text-ink-soft">Holidays and days off, one per line, like 2026-12-25.</p>
        <textarea id="bs-closed" name="closedDates" rows={3} defaultValue={settings.closedDates.join("\n")} className={num} />
      </div>
      <SubmitButton busy={pending} pending="Saving">Save booking settings</SubmitButton>
    </form>
  );
}
