// Time helpers for automations: quiet hours in the business's own time zone, and readable booking times.

export function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(date);
  return Number(hour) % 24;
}

export function inQuietHours(date: Date, timeZone: string, quiet: { start: number; end: number }): boolean {
  if (quiet.start === quiet.end) return false;
  const h = localHour(date, timeZone);
  return quiet.start > quiet.end ? h >= quiet.start || h < quiet.end : h >= quiet.start && h < quiet.end;
}

const step = 15 * 60 * 1000;

/** Moves a time forward out of quiet hours, to the first allowed quarter hour. */
export function nextAllowedTime(date: Date, timeZone: string, quiet: { start: number; end: number }): Date {
  let t = date.getTime();
  for (let i = 0; i < 24 * 4 && inQuietHours(new Date(t), timeZone, quiet); i++) {
    t = Math.ceil((t + 1) / step) * step;
  }
  return new Date(t);
}

/** Moves a time backward out of quiet hours. Used for reminders, which must arrive before the booking. */
export function previousAllowedTime(date: Date, timeZone: string, quiet: { start: number; end: number }): Date {
  let t = date.getTime();
  for (let i = 0; i < 24 * 4 && inQuietHours(new Date(t), timeZone, quiet); i++) {
    t = Math.floor((t - 1) / step) * step;
  }
  return new Date(t);
}

export function formatBookingTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Reads a datetime typed into a local datetime field as a time in the business's own zone. */
export function zonedLocalToDate(local: string, timeZone: string): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Work out the zone's offset at that moment and correct for it.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(asUtc - (shown - asUtc));
}
