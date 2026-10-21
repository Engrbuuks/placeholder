// Free slot rules, with no database: opening hours in the business's own time zone, notice, closed days,
// gaps between appointments and how many customers fit in one time.
import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { availableSlots, defaultBookingSettings, icsFor, type BookingSettings } from "../src/lib/booking";

// Monday 26 October 2026, 07:00 in Lagos (06:00 UTC).
const monday7am = new Date("2026-10-26T06:00:00Z");
const s = (p: Partial<BookingSettings> = {}): BookingSettings => ({ ...defaultBookingSettings, enabled: true, maxDaysAhead: 6, minNoticeHours: 0, ...p });

describe("free slots", () => {
  test("slots follow the opening hours in the business's own time zone", () => {
    const slots = availableSlots(s({ weekly: { "1": ["09:00", "11:00"] } }), "Africa/Lagos", [], monday7am);
    assert.deepEqual(slots.map((x) => x.label), ["09:00", "09:30", "10:00", "10:30"]);
    assert.equal(slots[0].start.toISOString(), "2026-10-26T08:00:00.000Z", "09:00 in Lagos is 08:00 UTC");
    assert.equal(slots.at(-1)!.end.toISOString(), "2026-10-26T10:00:00.000Z", "the last slot ends at closing time");
  });
  test("the same hours in Chicago are different moments", () => {
    const slots = availableSlots(s({ weekly: { "1": ["09:00", "10:00"] } }), "America/Chicago", [], monday7am);
    assert.equal(slots[0].start.toISOString(), "2026-10-26T14:00:00.000Z");
  });
  test("notice, closed days and the booking horizon are respected", () => {
    const hours = { "1": ["09:00", "11:00"], "2": ["09:00", "10:00"] } as Record<string, [string, string]>;
    const withNotice = availableSlots(s({ weekly: hours, minNoticeHours: 3 }), "Africa/Lagos", [], monday7am);
    assert.equal(withNotice[0].label, "10:00", "07:00 plus 3 hours notice: the first slot is 10:00");
    const closed = availableSlots(s({ weekly: hours, closedDates: ["2026-10-26"] }), "Africa/Lagos", [], monday7am);
    assert.ok(closed.every((x) => x.day !== "2026-10-26"));
    assert.equal(closed[0].day, "2026-10-27");
    const short = availableSlots(s({ weekly: hours, maxDaysAhead: 0 }), "Africa/Lagos", [], monday7am);
    assert.ok(short.every((x) => x.day === "2026-10-26"));
  });
  test("a gap after each appointment spaces the slots", () => {
    const slots = availableSlots(s({ weekly: { "1": ["09:00", "11:00"] }, slotMinutes: 45, bufferMinutes: 15 }), "Africa/Lagos", [], monday7am);
    assert.deepEqual(slots.map((x) => x.label), ["09:00", "10:00"]);
  });
  test("a full slot disappears; with room for two it stays until both are taken", () => {
    const nine = { starts_at: new Date("2026-10-26T08:00:00Z"), ends_at: new Date("2026-10-26T08:30:00Z") };
    const one = availableSlots(s({ weekly: { "1": ["09:00", "10:00"] } }), "Africa/Lagos", [nine], monday7am);
    assert.deepEqual(one.map((x) => x.label), ["09:30"]);
    const two = availableSlots(s({ weekly: { "1": ["09:00", "10:00"] }, capacity: 2 }), "Africa/Lagos", [nine], monday7am);
    assert.deepEqual(two.map((x) => x.label), ["09:00", "09:30"]);
    const twoTaken = availableSlots(s({ weekly: { "1": ["09:00", "10:00"] }, capacity: 2 }), "Africa/Lagos", [nine, nine], monday7am);
    assert.deepEqual(twoTaken.map((x) => x.label), ["09:30"]);
  });
  test("a longer appointment blocks every slot it overlaps", () => {
    const long = { starts_at: new Date("2026-10-26T08:15:00Z"), ends_at: new Date("2026-10-26T09:15:00Z") };
    const slots = availableSlots(s({ weekly: { "1": ["09:00", "11:00"] } }), "Africa/Lagos", [long], monday7am);
    assert.deepEqual(slots.map((x) => x.label), ["10:30"]);
  });
});

describe("calendar file", () => {
  test("is a valid event in UTC with the business named", () => {
    const ics = icsFor({ id: "abc", starts_at: new Date("2026-10-26T08:00:00Z"), ends_at: new Date("2026-10-26T08:30:00Z") }, "Consultation", "Smile, Studio");
    assert.match(ics, /BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20261026T080000Z/);
    assert.match(ics, /DTEND:20261026T083000Z/);
    assert.match(ics, /SUMMARY:Consultation with Smile\\, Studio/);
  });
});
