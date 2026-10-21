// Round 5 against the real database: attribution and revenue, results, reviews, campaigns,
// missed call text back, the lead form and the weekly results report.
import "./helpers";
import { uniqueEmail } from "./helpers";
import { after, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getPool, withTenant } from "../src/lib/db";
import { createAccountWithWorkspace } from "../src/lib/workspaces";
import { encryptSecret } from "../src/lib/crypto";
import { handleInbound } from "../src/lib/pipeline/engine";
import { setStage } from "../src/lib/pipeline/owner";
import { runDueJobs } from "../src/lib/pipeline/worker";
import { campaignStats, previewCampaign, startCampaign } from "../src/lib/pipeline/campaigns";
import { handleMissedCall } from "../src/lib/pipeline/missedCalls";
import { submitLeadForm } from "../src/lib/leadForm";
import { resultsFor } from "../src/lib/results";
import { sendWeeklyResults } from "../src/lib/pipeline/jobs";
import { GET as reviewLink } from "../src/app/r/[token]/route";
import { automationConfig } from "../src/lib/config";
import { localHour } from "../src/lib/time";

/** Runs a test with quiet hours placed either around this moment or well away from it, in the given zone. */
async function withQuietHours<T>(zone: string, quietNow: boolean, fn: () => Promise<T>): Promise<T> {
  const saved = { ...automationConfig.quietHours };
  const h = localHour(new Date(), zone);
  Object.assign(automationConfig.quietHours, quietNow ? { start: h, end: (h + 2) % 24 } : { start: (h + 3) % 24, end: (h + 5) % 24 });
  try {
    return await fn();
  } finally {
    Object.assign(automationConfig.quietHours, saved);
  }
}

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL = "https://app.example.com";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
after(async () => {
  await getPool().end();
});

let seq = 0;
async function business(opts: { country?: string; sms?: boolean; whatsapp?: boolean; reviews?: boolean; missedCalls?: boolean } = {}) {
  const acct = (await createAccountWithWorkspace({ email: uniqueEmail("results"), passwordHash: "x", fullName: "Owner", businessName: "Bright Smile Dental" }))!;
  const ws = acct.workspaceId;
  const smsNumber = `+1415${String(Date.now()).slice(-5)}${seq++ % 10}`;
  await withTenant(ws, async (c) => {
    await c.query("update workspaces set country = $2, niche_pack = 'dental', onboarding_step = 'done' where id = $1", [ws, opts.country ?? "NG"]);
    await c.query("update brand_brains set data = $2, status = 'confirmed' where workspace_id = $1", [
      ws,
      JSON.stringify({ businessName: "Bright Smile Dental", summary: "Dentist.", hours: "9 to 5", services: [{ name: "Check up", price: "₦15,000" }], faqs: [], answers: {} }),
    ]);
    await c.query(
      "insert into automation_settings (workspace_id, review_enabled, review_link, review_delay_hours, missed_call_enabled, forward_to) values ($1, $2, $3, 2, $4, $5)",
      [ws, Boolean(opts.reviews), opts.reviews ? "https://g.page/r/bright-smile/review" : null, Boolean(opts.missedCalls), opts.missedCalls ? "+2348000000001" : null],
    );
    await c.query("insert into channel_connections (workspace_id, channel, public_key) values ($1, 'webchat', $2)", [ws, randomBytes(12).toString("base64url")]);
    if (opts.sms)
      await c.query("insert into channel_connections (workspace_id, channel, external_account_id, secret_enc, settings) values ($1, 'sms', $2, $3, $4)", [
        ws,
        smsNumber,
        encryptSecret("0123456789abcdef0123456789abcdef"),
        JSON.stringify({ accountSid: "AC" + "c".repeat(32) }),
      ]);
    if (opts.whatsapp)
      await c.query("insert into channel_connections (workspace_id, channel, external_account_id, secret_enc, settings) values ($1, 'whatsapp', $2, $3, $4)", [
        ws,
        String(Date.now()) + seq++,
        encryptSecret("wa-token"),
        JSON.stringify({ templateName: "win_back", templateLanguage: "en" }),
      ]);
  });
  return { ws, smsNumber };
}

const q = <T extends Record<string, unknown>>(ws: string, sql: string, params: unknown[] = []) => withTenant(ws, async (c) => (await c.query<T>(sql, params)).rows);
const outgoing = (ws: string, leadId: string) =>
  q<{ body: string; status: string; author: string; sequence_id: string | null }>(ws, "select body, status, author, sequence_id from messages where lead_id = $1 and direction = 'out' order by created_at, id", [leadId]);
const makeDue = (ws: string, kind: string) => q(ws, "update jobs set run_at = now() - interval '1 second' where kind = $1 and status = 'queued'", [kind]);

/** Pretends to be Twilio and Meta, and records what was sent. */
function mockChannels() {
  const sent: { channel: string; to: string; body: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u.includes("api.twilio.com")) {
      const p = new URLSearchParams(String(init.body));
      sent.push({ channel: "sms", to: p.get("To")!, body: p.get("Body")! });
      return new Response(JSON.stringify({ sid: "SM" + randomBytes(16).toString("hex") }), { status: 201 });
    }
    if (u.includes("graph.facebook.com")) {
      const b = JSON.parse(String(init.body));
      sent.push({ channel: "whatsapp", to: b.to, body: b.text?.body ?? `template:${b.template?.name}` });
      return new Response(JSON.stringify({ messages: [{ id: "wamid." + randomBytes(8).toString("hex") }] }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  return sent;
}

describe("attribution and revenue", () => {
  test("the first arrival's source and campaign are kept; later visits do not overwrite them", async () => {
    const { ws } = await business();
    const first = { source: "webchat", utmSource: "facebook", utmMedium: "paid", utmCampaign: "whitening_oct", landingPage: "https://bs.example.com/whitening" };
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hello", attribution: first });
    await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Still there?", attribution: { utmSource: "google", utmCampaign: "brand" } });
    const [lead] = await q<{ source: string; utm_source: string; utm_campaign: string; landing_page: string }>(ws, "select * from leads where id = $1", [r.leadId]);
    assert.deepEqual([lead.source, lead.utm_source, lead.utm_campaign, lead.landing_page], ["webchat", "facebook", "whitening_oct", "https://bs.example.com/whitening"]);
  });

  test("a won sale's value shows as revenue by source, with the funnel and speed to lead", async () => {
    const { ws } = await business();
    const a = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "a", text: "Hi", attribution: { utmSource: "google", utmMedium: "cpc" } });
    const b = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "b", text: "Hi" });
    await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "a", text: "Under 50k" });
    await setStage(ws, a.leadId!, "booked", new Date(Date.now() + 86_400_000));
    const summary = await setStage(ws, a.leadId!, "won", null, 120000);
    assert.match(summary, /Marked as won, worth ₦120,000/);
    await setStage(ws, b.leadId!, "lost");

    const r = await resultsFor(ws, 30, "Africa/Lagos");
    assert.deepEqual(r.current, { leads: 2, engaged: 1, booked: 1, won: 1, revenue: 120000 });
    assert.ok(r.medianFirstReplySeconds !== null && r.medianFirstReplySeconds < 60, "replied within a minute");
    assert.equal(r.answeredWithinMinute, 1);
    const google = r.sources.find((s) => s.label === "Google (cpc)")!;
    assert.deepEqual([google.leads, google.won, google.revenue], [1, 1, 120000]);
    assert.equal(r.sources[0].label, "Google (cpc)", "the source that made money comes first");
    assert.equal(r.daily.at(-1)!.leads, 2);
  });

  test("leads that arrive in quiet hours are counted as answered while closed", async () => {
    const { ws } = await business();
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "night", text: "Hi" });
    await q(ws, "update leads set created_at = date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' - interval '1 hour' where id = $1", [r.leadId]); // 23:00 Lagos yesterday
    const res = await resultsFor(ws, 7, "Africa/Lagos");
    assert.equal(res.afterHours, 1);
  });
});

describe("reviews", () => {
  test("won: asked after the delay; a 5 gets the review link, which counts the click and forwards", async () => {
    const sent = mockChannels();
    const { ws } = await business({ sms: true, reviews: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348031111111", text: "Hello, I'm Ada", name: "Ada Obi", externalMessageId: "s1" });
    const summary = await setStage(ws, r.leadId!, "won", null, 15000);
    assert.match(summary, /review request on/);
    const [job] = await q<{ run_at: Date }>(ws, "select run_at from jobs where kind = 'review_request' and lead_id = $1", [r.leadId]);
    assert.ok(job.run_at.getTime() > Date.now() + 3600_000, "waits the configured delay");

    await makeDue(ws, "review_request");
    await runDueJobs({ budgetMs: 5000 });
    assert.match(sent.at(-1)!.body, /^Thank you for choosing Bright Smile Dental, Ada\. How did we do\? Reply with a number from 1/);

    await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348031111111", text: "5", externalMessageId: "s2" });
    const happy = sent.at(-1)!.body;
    const token = happy.match(/https:\/\/app\.example\.com\/r\/([\w-]+)/)?.[1];
    assert.ok(token, "the happy reply carries the tracked review link");
    const [lead] = await q<{ review_status: string; review_rating: number }>(ws, "select review_status, review_rating from leads where id = $1", [r.leadId]);
    assert.deepEqual([lead.review_status, lead.review_rating], ["rated", 5]);

    const res = await reviewLink(new Request("https://app.example.com/r/" + token), { params: Promise.resolve({ token: token! }) });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://g.page/r/bright-smile/review");
    const [clicked] = await q<{ review_clicked_at: Date | null }>(ws, "select review_clicked_at from leads where id = $1", [r.leadId]);
    assert.ok(clicked.review_clicked_at);
    const bad = await reviewLink(new Request("https://app.example.com/r/nope"), { params: Promise.resolve({ token: "not-a-real-token-123" }) });
    assert.equal(bad.status, 404);

    // Marking won again never asks twice.
    await setStage(ws, r.leadId!, "won");
    assert.equal((await q(ws, "select 1 from jobs where kind = 'review_request' and lead_id = $1", [r.leadId])).length, 1);
  });

  test("a low rating stays private: no link, the owner is told", async () => {
    const sent = mockChannels();
    const { ws } = await business({ sms: true, reviews: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348032222222", text: "Hi", externalMessageId: "s3" });
    await setStage(ws, r.leadId!, "won");
    await makeDue(ws, "review_request");
    await runDueJobs({ budgetMs: 5000 });
    await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348032222222", text: "2", externalMessageId: "s4" });
    assert.doesNotMatch(sent.at(-1)!.body, /\/r\//);
    assert.match(sent.at(-1)!.body, /passed this to the Bright Smile Dental team/);
    const alerts = await q<{ title: string }>(ws, "select title from notifications where kind = 'review_unhappy'");
    assert.match(alerts[0].title, /rated you 2 out of 5/);
  });

  test("ordinary replies after the request are not taken as ratings", async () => {
    mockChannels();
    const { ws } = await business({ sms: true, reviews: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348033333333", text: "Hi", externalMessageId: "s5" });
    await setStage(ws, r.leadId!, "won");
    await makeDue(ws, "review_request");
    await runDueJobs({ budgetMs: 5000 });
    const reply = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348033333333", text: "Thanks, see you next year", externalMessageId: "s6" });
    assert.notEqual(reply.reason, "Rating received");
    const [lead] = await q<{ review_status: string }>(ws, "select review_status from leads where id = $1", [r.leadId]);
    assert.equal(lead.review_status, "requested");
  });

  test("no review link, no request", async () => {
    const { ws } = await business({ sms: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348034444444", text: "Hi", externalMessageId: "s7" });
    await setStage(ws, r.leadId!, "won");
    assert.equal((await q(ws, "select 1 from jobs where kind = 'review_request'")).length, 0);
  });
});

describe("campaigns", () => {
  test("only people who may legally be messaged get it, each the right way, and the results are traced", () =>
    withQuietHours("America/New_York", false, async () => {
    const sent = mockChannels();
    const { ws } = await business({ country: "US", sms: true, whatsapp: true });
    const mk = async (channel: "whatsapp" | "sms" | "webchat", id: string, extra = "") => {
      const r = await handleInbound({ workspaceId: ws, channel, externalId: id, text: "Hello", name: `Person ${id}`, externalMessageId: `m-${id}` });
      await q(ws, `update leads set stage = 'lost', last_inbound_at = now() - interval '40 days' ${extra} where id = $1`, [r.leadId]);
      return r.leadId!;
    };
    const waOld = await mk("whatsapp", "2348030000001");
    const smsNoConsent = await mk("sms", "+13125550111");
    const smsConsent = await mk("sms", "+13125550112", ", marketing_consent_at = now()");
    await mk("webchat", "visitor-9");
    await mk("whatsapp", "2348030000002", ", opted_out_at = now()");

    const message = "Hi {firstName}, it's {businessName}. New whitening offer this month. Interested?";
    const preview = await previewCampaign(ws, { segment: "lost", quietDays: 30, message });
    assert.equal(preview.total, 5);
    assert.equal(preview.reachable, 2);
    assert.equal(preview.viaTemplate, 1, "the old WhatsApp contact gets the approved template");
    const reasons = preview.skipped.map((s) => s.reason).join(" | ");
    assert.match(reasons, /consent in United States/);
    assert.match(reasons, /Web chat visitors cannot be messaged first/);
    assert.match(reasons, /Opted out/);
    assert.match(preview.sample, /^Hi Person, it's Bright Smile Dental\./);

    const before = sent.length; // the greetings each lead got when it first wrote in
    const started = await startCampaign(ws, { name: "October win back", segment: "lost", quietDays: 30, message });
    assert.deepEqual([started.queued, started.skipped], [2, 3]);
    await q(ws, "update jobs set run_at = now() - interval '1 second' where kind = 'campaign_send'");
    await runDueJobs({ budgetMs: 8000 });

    const campaignSends = sent.slice(before);
    const sms = campaignSends.filter((s) => s.channel === "sms" && s.to === "+13125550112");
    const wa = campaignSends.filter((s) => s.channel === "whatsapp" && s.to === "2348030000001");
    assert.equal((await q<{ status: string }>(ws, "select status from campaigns"))[0].status, "sent");
    assert.equal(sms.length, 1);
    assert.match(sms[0].body, /New whitening offer/);
    assert.equal(wa[0]?.body, "template:win_back");
    assert.equal(campaignSends.filter((s) => s.to === "+13125550111").length, 0, "no text without consent");

    // A reply names the campaign, and the sale it led to is counted.
    await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550112", text: "Yes please", externalMessageId: "reply-1" });
    const alert = (await q<{ title: string }>(ws, "select title from notifications where kind = 'campaign_reply'"))[0];
    assert.match(alert.title, /replied to your campaign "October win back"/);
    await setStage(ws, smsConsent, "won", null, 450);
    const [stats] = await campaignStats(ws);
    assert.deepEqual([stats.sent, stats.skipped, stats.replied, stats.won, stats.revenue], [2, 3, 1, 1, 450]);
    void waOld;
    void smsNoConsent;

    // Within the frequency cap, the same people are not messaged again.
    const again = await previewCampaign(ws, { segment: "lost", quietDays: 30, message });
    // The customer who bought has left the lost group; the WhatsApp contact who was sent it is capped.
    assert.equal(again.total, 4);
    assert.equal(again.skipped.find((s) => /last 7 days/.test(s.reason))?.count, 1);
  }));

  test("a campaign started during quiet hours waits for the morning", () =>
    withQuietHours("Africa/Lagos", true, async () => {
      const sent = mockChannels();
      const { ws } = await business({ sms: true });
      const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348036666666", text: "Hi", externalMessageId: "q1" });
      await q(ws, "update leads set stage = 'lost' where id = $1", [r.leadId]);
      const before = sent.length;
      await startCampaign(ws, { name: "Night test", segment: "lost", quietDays: 30, message: "Hi {firstName}, a new offer is here." });
      const [job] = await q<{ run_at: Date }>(ws, "select run_at from jobs where kind = 'campaign_send' and status = 'queued'");
      assert.ok(job.run_at.getTime() > Date.now() + 30 * 60_000, "scheduled after quiet hours end");
      await runDueJobs({ budgetMs: 3000 });
      assert.equal(sent.length, before, "nothing sent at night");
      // A later batch that comes due while it is night, for example a long campaign, also waits.
      await makeDue(ws, "campaign_send");
      await runDueJobs({ budgetMs: 3000 });
      assert.equal(sent.length, before, "a due batch still sends nothing at night");
      const [rescheduled] = await q<{ run_at: Date }>(ws, "select run_at from jobs where kind = 'campaign_send' and status = 'queued'");
      assert.ok(rescheduled && rescheduled.run_at.getTime() > Date.now(), "it moves itself to the morning");
    }));
});

describe("missed call text back", () => {
  test("the caller is texted at once; a repeat webhook does nothing; their reply is not greeted twice", async () => {
    const sent = mockChannels();
    const { ws } = await business({ sms: true, missedCalls: true });
    const first = await handleMissedCall(ws, "+2348035555555", "CA111");
    assert.equal(first.texted, true);
    assert.match(sent[0].body, /Sorry we missed your call/);
    const again = await handleMissedCall(ws, "+2348035555555", "CA111");
    assert.equal(again.texted, false);
    assert.equal(sent.length, 1);
    const [lead] = await q<{ source: string; channel: string }>(ws, "select source, channel from leads where id = $1", [first.leadId]);
    assert.deepEqual([lead.source, lead.channel], ["missed_call", "sms"]);
    assert.equal((await q(ws, "select 1 from notifications where kind = 'missed_call'")).length, 1);

    await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348035555555", text: "I need a check up", externalMessageId: "s9" });
    assert.doesNotMatch(sent.at(-1)!.body, /thanks for messaging/i, "no second greeting");
    assert.equal((await handleMissedCall(ws, "anonymous", "CA222")).texted, false);
  });
});

describe("lead form", () => {
  test("a local phone number becomes a text conversation, with consent recorded", async () => {
    const sent = mockChannels();
    const { ws } = await business({ sms: true });
    const { channel, result } = await submitLeadForm(
      ws,
      { name: "Chidi Okeke", phone: "0803 123 4567", email: "", message: "Do you do braces?", consent: true, website: "" },
      { utmSource: "instagram", utmMedium: "bio" },
    );
    assert.equal(channel, "sms");
    assert.equal(sent[0].to, "+2348031234567");
    assert.match(sent[0].body, /^Hi Chidi/);
    const [lead] = await q<{ source: string; marketing_consent_at: Date | null; utm_source: string; email: string | null }>(ws, "select * from leads where id = $1", [result.leadId]);
    assert.equal(lead.source, "form");
    assert.ok(lead.marketing_consent_at);
    assert.equal(lead.utm_source, "instagram");
  });

  test("without SMS the owner is alerted to call, and nothing is sent", async () => {
    const sent = mockChannels();
    const { ws } = await business();
    const { channel, result } = await submitLeadForm(ws, { name: "Bola", phone: "08031234567", email: "bola@example.com", message: "Price?", consent: false, website: "" }, {});
    assert.equal(channel, "form");
    assert.equal(result.replied, false);
    assert.equal(sent.length, 0);
    assert.equal((await q(ws, "select 1 from notifications where kind = 'message'")).length, 1);
  });

  test("consent on the form unlocks follow up texts in the US", async () => {
    mockChannels();
    const { ws } = await business({ country: "US", sms: true });
    const yes = await submitLeadForm(ws, { name: "Jo", phone: "(312) 555-0144", email: "", message: "Hi", consent: true, website: "" }, {});
    const no = await submitLeadForm(ws, { name: "Al", phone: "(312) 555-0145", email: "", message: "Hi", consent: false, website: "" }, {});
    const jobs = (id: string | null) => q(ws, "select 1 from jobs where lead_id = $1 and kind = 'followup' and status = 'queued'", [id]);
    assert.equal((await jobs(yes.result.leadId)).length, 1);
    assert.equal((await jobs(no.result.leadId)).length, 0);
  });
});

describe("weekly results report", () => {
  test("the owner gets the week's numbers by email and in the bell", async () => {
    const { ws } = await business();
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "w", text: "Hi", attribution: { utmSource: "google", utmMedium: "organic" } });
    await setStage(ws, r.leadId!, "won", null, 30000);
    const week = await resultsFor(ws, 7, "Africa/Lagos");
    assert.equal(week.current.booked, 1, "a sale marked won without a booking still counts as booked");
    await sendWeeklyResults(ws, "Africa/Lagos", "NG");
    const [n] = await q<{ title: string; body: string }>(ws, "select title, body from notifications where kind = 'weekly_results'");
    assert.equal(n.title, "Your week: 1 lead, 1 sale, ₦30,000");
    assert.match(n.body, /Best source: Google \(organic\)/);
    assert.ok((await q(ws, "select 1 from jobs where kind = 'email'")).length >= 1, "an email is queued");
  });
});
