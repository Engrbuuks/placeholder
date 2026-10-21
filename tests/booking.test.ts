// Round 6 against the real database: self booking end to end, no double booking, rescheduling and cancelling,
// the booking link in the assistant's replies, and email as a channel with unsubscribe.
import "./helpers";
import { uniqueEmail } from "./helpers";
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getPool, withTenant } from "../src/lib/db";
import { createAccountWithWorkspace } from "../src/lib/workspaces";
import { encryptSecret } from "../src/lib/crypto";
import { packs } from "../src/lib/config";
import { handleInbound } from "../src/lib/pipeline/engine";
import { setStage } from "../src/lib/pipeline/owner";
import { bookSlot, cancelBooking, slotsFor } from "../src/lib/booking";
import { submitLeadForm } from "../src/lib/leadForm";
import { unsubscribe } from "../src/lib/unsubscribe";
import { previewCampaign } from "../src/lib/pipeline/campaigns";
import { writeReviewRequest } from "../src/lib/pipeline/reviews";
import { loadContext, getLead } from "../src/lib/pipeline/context";
import { POST as oneClick } from "../src/app/api/unsubscribe/[token]/route";

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL = "https://app.example.com";
delete process.env.ANTHROPIC_API_KEY;

const realFetch = globalThis.fetch;
before(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Placeholder <hello@mail.example.com>";
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
after(async () => {
  delete process.env.RESEND_API_KEY;
  await getPool().end();
});

const allWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), ["00:00", "23:59"]]));

let seq = 0;
async function business(opts: { country?: string; sms?: boolean; booking?: Record<string, unknown> | false; reviews?: boolean } = {}) {
  const email = uniqueEmail("booking");
  const acct = (await createAccountWithWorkspace({ email, passwordHash: "x", fullName: "Owner", businessName: "Bright Smile Dental" }))!;
  const ws = acct.workspaceId;
  const smsNumber = `+1415${String(Date.now()).slice(-5)}${seq++ % 10}`;
  await withTenant(ws, async (c) => {
    await c.query("update workspaces set country = $2, niche_pack = 'dental', onboarding_step = 'done' where id = $1", [ws, opts.country ?? "NG"]);
    await c.query("update brand_brains set data = $2, status = 'confirmed' where workspace_id = $1", [
      ws,
      JSON.stringify({ businessName: "Bright Smile Dental", summary: "Dentist.", hours: "9 to 5", services: [{ name: "Check up", price: "₦15,000" }], faqs: [], answers: {} }),
    ]);
    await c.query("insert into automation_settings (workspace_id, review_enabled, review_link) values ($1, $2, $3)", [
      ws,
      Boolean(opts.reviews),
      opts.reviews ? "https://g.page/r/bright/review" : null,
    ]);
    await c.query("insert into channel_connections (workspace_id, channel, public_key) values ($1, 'webchat', $2)", [ws, randomBytes(12).toString("base64url")]);
    if (opts.sms)
      await c.query("insert into channel_connections (workspace_id, channel, external_account_id, secret_enc, settings) values ($1, 'sms', $2, $3, $4)", [
        ws,
        smsNumber,
        encryptSecret("0123456789abcdef0123456789abcdef"),
        JSON.stringify({ accountSid: "AC" + "c".repeat(32) }),
      ]);
    if (opts.booking !== false) {
      const b = { capacity: 1, ...(opts.booking ?? {}) };
      await c.query("insert into booking_settings (workspace_id, enabled, slot_minutes, min_notice_hours, max_days_ahead, capacity, weekly) values ($1, true, 30, 1, 14, $2, $3)", [
        ws,
        b.capacity,
        JSON.stringify(allWeek),
      ]);
    }
  });
  return { ws, ownerEmail: email };
}

const q = <T extends Record<string, unknown>>(ws: string, sql: string, params: unknown[] = []) => withTenant(ws, async (c) => (await c.query<T>(sql, params)).rows);

function mockChannels() {
  const sent: { channel: string; to: string; body: string; raw?: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u.includes("api.twilio.com")) {
      const p = new URLSearchParams(String(init.body));
      sent.push({ channel: "sms", to: p.get("To")!, body: p.get("Body")! });
      return new Response(JSON.stringify({ sid: "SM" + randomBytes(8).toString("hex") }), { status: 201 });
    }
    if (u.includes("api.resend.com")) {
      const b = JSON.parse(String(init.body));
      sent.push({ channel: "email", to: b.to[0], body: b.text, raw: b });
      return new Response(JSON.stringify({ id: "em_" + randomBytes(6).toString("hex") }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  return sent;
}

const firstFree = async (ws: string) => (await slotsFor(ws)).slots[0].start.toISOString();
/** A slot a few days out, so reminders (which go 24 and 2 hours before) have time to be scheduled. */
const daysOut = async (ws: string, days: number, offset = 0) =>
  (await slotsFor(ws)).slots.filter((x) => x.start.getTime() > Date.now() + days * 86_400_000)[offset].start.toISOString();

describe("self booking", () => {
  test("a new customer books: lead, booking, reminders and a text confirmation with a manage link", async () => {
    const sent = mockChannels();
    const { ws } = await business({ sms: true });
    const start = await daysOut(ws, 3);
    const r = await bookSlot(ws, { start, name: "Ada Obi", phone: "0803 111 2222", email: "", note: "Tooth ache" }, { utmSource: "google", utmMedium: "cpc" });
    assert.ok(r.ok);
    const [lead] = await q<{ id: string; channel: string; stage: string; source: string; utm_source: string; booked_for: Date }>(ws, "select * from leads");
    assert.deepEqual([lead.channel, lead.stage, lead.source, lead.utm_source], ["sms", "booked", "booking", "google"]);
    assert.equal(lead.booked_for.toISOString(), start);
    const reminders = await q(ws, "select 1 from jobs where lead_id = $1 and kind = 'followup' and payload->>'trigger' = 'booked' and status = 'queued'", [lead.id]);
    assert.ok(reminders.length >= 1, "reminders scheduled");
    assert.equal(sent[0].to, "+2348031112222");
    assert.match(sent[0].body, /You are booked with Bright Smile Dental for .* To change or cancel: https:\/\/app\.example\.com\/b\/manage\//);
    assert.equal((await q(ws, "select 1 from notifications where kind = 'booking'")).length, 1);
    assert.ok(!(await slotsFor(ws)).slots.some((s) => s.start.toISOString() === start), "the slot is gone");
  });

  test("people racing for the last place: exactly one gets it, every time", async () => {
    mockChannels();
    const { ws } = await business({ sms: true });
    const slots = (await slotsFor(ws)).slots;
    // Several rounds with several people each, so the race is not left to chance.
    for (let round = 0; round < 4; round++) {
      const start = slots[round * 3].start.toISOString();
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((n) => bookSlot(ws, { start, name: `Racer ${round}.${n}`, phone: `0803 00${round} 00${n}0`, email: "", note: "" })),
      );
      assert.equal(results.filter((r) => r.ok).length, 1, `round ${round}`);
      assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && /just taken/.test(r.error)));
    }
    assert.equal((await q(ws, "select 1 from bookings where status = 'confirmed'")).length, 4);
  });

  test("with room for two, two can book the same time, and the third cannot", async () => {
    mockChannels();
    const { ws } = await business({ sms: true, booking: { capacity: 2 } });
    const start = await firstFree(ws);
    const a = await bookSlot(ws, { start, name: "A", phone: "08030000011", email: "", note: "" });
    const b = await bookSlot(ws, { start, name: "B", phone: "08030000012", email: "", note: "" });
    const c = await bookSlot(ws, { start, name: "C", phone: "08030000013", email: "", note: "" });
    assert.deepEqual([a.ok, b.ok, c.ok], [true, true, false]);
  });

  test("a time outside the opening hours, or with booking off, is refused", async () => {
    const { ws } = await business();
    const r = await bookSlot(ws, { start: "2026-10-26T08:07:00Z", name: "X", phone: "08030000021", email: "", note: "" });
    assert.ok(!r.ok);
    const off = await business({ booking: false });
    const r2 = await bookSlot(off.ws, { start: new Date(Date.now() + 86_400_000).toISOString(), name: "X", phone: "08030000022", email: "", note: "" });
    assert.ok(!r2.ok && /not open/.test(r2.error));
  });

  test("rescheduling moves the same booking and its reminders; cancelling frees the time and tells the owner", async () => {
    const sent = mockChannels();
    const { ws } = await business({ sms: true });
    const first = await bookSlot(ws, { start: await daysOut(ws, 3), name: "Ada", phone: "08030000031", email: "", note: "" });
    assert.ok(first.ok);
    const later = await daysOut(ws, 5, 3);
    const moved = await bookSlot(ws, { start: later, name: "", phone: "", email: "", note: "", reschedule: first.manageToken });
    assert.ok(moved.ok && moved.bookingId === first.bookingId, "the same booking");
    const [b] = await q<{ starts_at: Date }>(ws, "select starts_at from bookings where id = $1", [first.bookingId]);
    assert.equal(b.starts_at.toISOString(), later);
    assert.match(sent.at(-1)!.body, /is moved to/);
    const jobs = await q<{ payload: { bookedFor: string } }>(ws, "select payload from jobs where kind = 'followup' and status = 'queued' and payload->>'trigger' = 'booked'");
    assert.ok(jobs.length > 0 && jobs.every((j) => j.payload.bookedFor === later), "reminders follow the new time");

    assert.equal(await cancelBooking(first.manageToken, "customer"), true);
    const [after] = await q<{ status: string }>(ws, "select status from bookings where id = $1", [first.bookingId]);
    assert.equal(after.status, "cancelled");
    assert.equal((await q(ws, "select 1 from jobs where kind = 'followup' and status = 'queued' and payload->>'trigger' = 'booked'")).length, 0);
    assert.ok((await slotsFor(ws)).slots.some((s) => s.start.toISOString() === later), "the time is free again");
    assert.equal(await cancelBooking(first.manageToken, "customer"), false, "cancelling twice does nothing");
  });

  test("a customer ready to book is offered the booking page, and booking from it lands on their conversation", async () => {
    mockChannels();
    const { ws } = await business();
    const dental = packs.find((p) => p.id === "dental")!;
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hello", name: "Ada" });
    await q(ws, "update leads set stage = 'qualifying', qualifier_index = $2 where id = $1", [r.leadId, dental.qualifiers.length - 1]);
    await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Next week is fine" });
    const [reply] = await q<{ body: string }>(ws, "select body from messages where lead_id = $1 and direction = 'out' order by created_at desc limit 1", [r.leadId]);
    const token = reply.body.match(/\/b\/[\w-]+\?l=([\w-]+)/)?.[1];
    assert.ok(token, `the reply offers the booking page: ${reply.body}`);
    const booked = await bookSlot(ws, { start: await firstFree(ws), name: "Ada", phone: "", email: "", note: "", lead: token });
    assert.ok(booked.ok);
    const leads = await q<{ id: string; stage: string }>(ws, "select id, stage from leads");
    assert.equal(leads.length, 1, "no duplicate customer");
    assert.equal(leads[0].stage, "booked");
    const [confirm] = await q<{ body: string; channel: string }>(ws, "select body, channel from messages where sequence_id = 'booking'");
    assert.equal(confirm.channel, "webchat", "confirmed in the chat they were using");
  });

  test("marking booked from the inbox puts the appointment on the calendar too", async () => {
    const { ws } = await business();
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hi" });
    await setStage(ws, r.leadId!, "booked", new Date(Date.now() + 3 * 86_400_000));
    const [b] = await q<{ source: string; status: string }>(ws, "select source, status from bookings");
    assert.deepEqual([b.source, b.status], ["owner", "confirmed"]);
  });
});

describe("email", () => {
  test("a form lead with only an email gets one reply by email, as the business, replies to the owner, with an unsubscribe link", async () => {
    const sent = mockChannels();
    const { ws, ownerEmail } = await business();
    const { channel } = await submitLeadForm(ws, { name: "Bola", phone: "", email: "bola@example.com", message: "How much is a check up?", consent: false, website: "" }, {});
    assert.equal(channel, "email");
    const mail = sent.find((s) => s.channel === "email")!;
    assert.equal(mail.to, "bola@example.com");
    assert.equal(mail.raw!.from, '"Bright Smile Dental" <hello@mail.example.com>');
    assert.deepEqual(mail.raw!.reply_to, [ownerEmail]);
    assert.match(mail.body, /Check up is ₦15,000/);
    assert.match(mail.body, /Choose a time that suits you here: https:\/\/app\.example\.com\/b\//, "offers the booking page");
    const unsub = mail.body.match(/https:\/\/app\.example\.com\/u\/([\w-]+)/)?.[1];
    assert.ok(unsub);
    assert.match(String((mail.raw!.headers as Record<string, string>)["List-Unsubscribe"]), /\/api\/unsubscribe\//);

    // One click unsubscribe from the mail app stops everything.
    const res = await oneClick(new Request("https://app.example.com/api/unsubscribe/" + unsub, { method: "POST" }), { params: Promise.resolve({ token: unsub! }) });
    assert.equal(res.status, 200);
    const [lead] = await q<{ opted_out_at: Date | null }>(ws, "select opted_out_at from leads");
    assert.ok(lead.opted_out_at);
  });

  test("email campaigns follow the market's consent rule; past customers may be emailed", async () => {
    mockChannels();
    const ng = await business({ country: "NG" });
    const us = await business({ country: "US" });
    for (const { ws } of [ng, us]) {
      for (const [id, stage] of [["lead", "lost"], ["customer", "won"]] as const) {
        const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: id, text: `Hi, my email is ${id}@example.com` });
        await q(ws, "update leads set stage = $2 where id = $1", [r.leadId, stage]);
      }
    }
    const msg = "Hi {firstName}, we have a new offer.";
    const ngLost = await previewCampaign(ng.ws, { segment: "lost", quietDays: 30, message: msg });
    assert.equal(ngLost.viaEmail, 1, "Nigeria: a web chat lead who left an email can be emailed");
    const usLost = await previewCampaign(us.ws, { segment: "lost", quietDays: 30, message: msg });
    assert.equal(usLost.reachable, 0);
    assert.match(usLost.skipped[0].reason, /Marketing emails need their consent in United States/);
    const usCustomers = await previewCampaign(us.ws, { segment: "customers", quietDays: 30, message: msg });
    assert.equal(usCustomers.viaEmail, 1, "US: past customers may be emailed");
  });

  test("without email set up on the server, nothing pretends to send", async () => {
    mockChannels();
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const { ws } = await business();
      await submitLeadForm(ws, { name: "Bola", phone: "", email: "bola2@example.com", message: "Hi", consent: false, website: "" }, {});
      const [m] = await q<{ status: string; status_detail: string }>(ws, "select status, status_detail from messages where direction = 'out'");
      assert.equal(m.status, "skipped");
      assert.match(m.status_detail, /not set up on the server/);
    } finally {
      process.env.RESEND_API_KEY = saved;
    }
  });

  test("an email customer is sent the review link directly, and an unhappy one can reply privately", async () => {
    mockChannels();
    const { ws } = await business({ reviews: true });
    const { result } = await submitLeadForm(ws, { name: "Bola", phone: "", email: "bola3@example.com", message: "Hi", consent: false, website: "" }, {});
    await setStage(ws, result.leadId!, "won");
    const written = await withTenant(ws, async (c) => writeReviewRequest(c, (await loadContext(c, ws))!, (await getLead(c, result.leadId!))!));
    assert.ok("messageId" in written);
    const [m] = await q<{ body: string }>(ws, "select body from messages where sequence_id = 'review'");
    assert.match(m.body, /would you leave a quick review\? https:\/\/app\.example\.com\/r\//);
    assert.match(m.body, /reply to this email/);
  });

  test("unsubscribing twice is harmless, and an unknown link changes nothing", async () => {
    const { ws } = await business();
    const r = await submitLeadForm(ws, { name: "C", phone: "", email: "c@example.com", message: "Hi", consent: false, website: "" }, {});
    const [lead] = await q<{ public_token: string }>(ws, "select public_token from leads where id = $1", [r.result.leadId]);
    assert.ok(await unsubscribe(lead.public_token));
    assert.ok(await unsubscribe(lead.public_token));
    assert.equal(await unsubscribe("not-a-real-token-123"), null);
  });
});
