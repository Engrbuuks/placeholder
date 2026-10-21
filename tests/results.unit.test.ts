// Round 5 rules that need no database: ratings, attribution, phone numbers, and who a campaign may reach.
import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseRating } from "../src/lib/pipeline/reviews";
import { attributionFromPage, sourceLabel } from "../src/lib/attribution";
import { normalisePhone } from "../src/lib/leadForm";
import { reach } from "../src/lib/pipeline/campaigns";
import { render } from "../src/lib/templates";
import { change, formatDuration } from "../src/lib/results";
import type { Lead, WorkspaceContext } from "../src/lib/pipeline/context";

describe("ratings", () => {
  test("clear ratings are read", () => {
    for (const [t, v] of [["5", 5], ["4 stars", 4], ["1/5", 1], ["3 out of 5", 3], ["⭐⭐⭐⭐⭐", 5], ["I give you 5!", 5], ["2 estrellas", 2], ["5.", 5]] as const) {
      assert.equal(parseRating(t), v, t);
    }
  });
  test("anything else is a normal message", () => {
    for (const t of ["6", "0", "thanks", "5 bedrooms please", "call me at 5", "10/10", "45"]) assert.equal(parseRating(t), null, t);
  });
});

describe("attribution", () => {
  test("utm tags, ad click ids and referrers become a source", () => {
    const a = attributionFromPage("https://shop.example.com/teeth?utm_source=facebook&utm_medium=paid&utm_campaign=whitening_oct", null);
    assert.deepEqual([a.utmSource, a.utmMedium, a.utmCampaign, a.landingPage], ["facebook", "paid", "whitening_oct", "https://shop.example.com/teeth"]);
    assert.deepEqual([attributionFromPage("https://x.com/?gclid=abc", null).utmSource, attributionFromPage("https://x.com/?gclid=abc", null).utmMedium], ["google", "cpc"]);
    const organic = attributionFromPage("https://x.com/", "https://www.google.com/");
    assert.deepEqual([organic.utmSource, organic.utmMedium], ["google", "organic"]);
    assert.equal(attributionFromPage("https://x.com/", "https://x.com/about").utmSource, null, "moving around the same site is not a source");
    assert.equal(attributionFromPage("javascript:alert(1)", null).landingPage, null);
  });
  test("labels read like a person would say them", () => {
    assert.equal(sourceLabel({ source: "webchat", utm_source: null, utm_medium: null }), "Web chat");
    assert.equal(sourceLabel({ source: "webchat", utm_source: "google", utm_medium: "cpc" }), "Google (cpc)");
    assert.equal(sourceLabel({ source: "missed_call", utm_source: null, utm_medium: null }), "Missed call");
  });
});

describe("phone numbers from the lead form", () => {
  test("local numbers get the business's country code", () => {
    assert.equal(normalisePhone("0803 123 4567", "NG"), "+2348031234567");
    assert.equal(normalisePhone("(312) 555-0100", "US"), "+13125550100");
    assert.equal(normalisePhone("1 312 555 0100", "US"), "+13125550100");
    assert.equal(normalisePhone("07700 900123", "UK"), "+447700900123");
    assert.equal(normalisePhone("+44 7700 900123", "US"), "+447700900123", "an international number is kept as written");
    assert.equal(normalisePhone("0044 7700 900123", "NG"), "+447700900123");
    assert.equal(normalisePhone("12", "NG"), null);
    assert.equal(normalisePhone("call me", "NG"), null);
  });
});

describe("who a campaign may reach", () => {
  const ctx = (country: string) => ({ country, settings: {} }) as unknown as WorkspaceContext;
  const lead = (p: Partial<Lead>) => ({ channel: "whatsapp", opted_out_at: null, last_inbound_at: null, marketing_consent_at: null, ...p }) as Lead;
  const all = { sms: true, whatsapp: true, whatsappTemplate: true };
  const now = new Date("2026-10-21T12:00:00Z");

  test("opt outs, web chat and the frequency cap always skip", () => {
    assert.deepEqual(reach(ctx("NG"), lead({ opted_out_at: new Date() }), all, null, now), { ok: false, reason: "Opted out" });
    assert.equal(reach(ctx("NG"), lead({ channel: "webchat" }), all, null, now).ok, false);
    const recent = reach(ctx("NG"), lead({}), all, new Date(now.getTime() - 2 * 86_400_000), now);
    assert.ok(!recent.ok && /last 7 days/.test(recent.reason));
  });
  test("WhatsApp: free text inside 24 hours, the approved template after, nothing without one", () => {
    assert.deepEqual(reach(ctx("NG"), lead({ last_inbound_at: new Date(now.getTime() - 3600_000) }), all, null, now), { ok: true, via: "text" });
    assert.deepEqual(reach(ctx("NG"), lead({}), all, null, now), { ok: true, via: "template" });
    assert.equal(reach(ctx("NG"), lead({}), { ...all, whatsappTemplate: false }, null, now).ok, false);
  });
  test("SMS follows the market's consent rule, and form consent unlocks it", () => {
    assert.equal(reach(ctx("NG"), lead({ channel: "sms" }), all, null, now).ok, true);
    const us = reach(ctx("US"), lead({ channel: "sms" }), all, null, now);
    assert.ok(!us.ok && /consent in United States/.test(us.reason));
    assert.equal(reach(ctx("US"), lead({ channel: "sms", marketing_consent_at: new Date() }), all, null, now).ok, true);
    assert.equal(reach(ctx("NG"), lead({ channel: "sms" }), { ...all, sms: false }, null, now).ok, false);
  });
});

describe("small helpers", () => {
  test("an empty name leaves no stray comma", () => {
    assert.equal(render("Thank you, {firstName}!", { firstName: "" }), "Thank you!");
    assert.equal(render("Hi {firstName}, welcome.", { firstName: "" }), "Hi, welcome.");
    assert.equal(render("Thanks for choosing X, {firstName}. How did we do?", { firstName: "" }), "Thanks for choosing X. How did we do?");
  });
  test("durations and changes read plainly", () => {
    assert.equal(formatDuration(42), "42 seconds");
    assert.equal(formatDuration(0.4), "1 second");
    assert.equal(formatDuration(300), "5 minutes");
    assert.equal(formatDuration(null), "No replies yet");
    assert.equal(change(15, 10), 50);
    assert.equal(change(5, 0), null);
    assert.equal(change(0, 0), 0);
  });
});
