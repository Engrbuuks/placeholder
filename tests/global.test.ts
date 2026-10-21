// Round 4 against the real database: languages, time zones, SMS, STOP and START, and customer data rights.
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
import { deliverMessage } from "../src/lib/pipeline/delivery";
import { deleteCustomer, exportCustomer } from "../src/lib/privacy";
import { localHour } from "../src/lib/time";
import { automationConfig } from "../src/lib/config";

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
after(async () => {
  await getPool().end();
});

const twilioSid = "AC" + "c".repeat(32);
const twilioToken = "0123456789abcdef0123456789abcdef";
let numberSeq = 0;

async function business(opts: { country: string; language?: string; timeZone?: string; pack?: string; sms?: boolean }) {
  const acct = (await createAccountWithWorkspace({ email: uniqueEmail("global"), passwordHash: "x", fullName: "Owner", businessName: "Bright Smile Dental" }))!;
  const ws = acct.workspaceId;
  const smsNumber = `+1415${String(Date.now() % 1_000_000).padStart(6, "0")}${numberSeq++}`.slice(0, 13);
  await withTenant(ws, async (c) => {
    await c.query("update workspaces set country = $2, language = $3, time_zone = $4, niche_pack = $5, onboarding_step = 'done' where id = $1", [
      ws,
      opts.country,
      opts.language ?? "en",
      opts.timeZone ?? null,
      opts.pack ?? "dental",
    ]);
    await c.query("update brand_brains set data = $2, status = 'confirmed' where workspace_id = $1", [
      ws,
      JSON.stringify({
        businessName: "Bright Smile Dental",
        summary: "Family dentist.",
        hours: "Mon to Fri 9am to 5pm",
        services: [{ name: "Check up", price: "$95" }],
        faqs: [{ q: "Do you see children?", a: "Yes, from age 3." }],
        answers: {},
      }),
    ]);
    await c.query("insert into automation_settings (workspace_id) values ($1)", [ws]);
    await c.query("insert into channel_connections (workspace_id, channel, public_key) values ($1, 'webchat', $2)", [ws, randomBytes(12).toString("base64url")]);
    if (opts.sms) {
      await c.query(
        "insert into channel_connections (workspace_id, channel, external_account_id, secret_enc, settings) values ($1, 'sms', $2, $3, $4)",
        [ws, smsNumber, encryptSecret(twilioToken), JSON.stringify({ accountSid: twilioSid })],
      );
    }
  });
  return { ws, smsNumber };
}

const q = <T extends Record<string, unknown>>(ws: string, sql: string, params: unknown[] = []) => withTenant(ws, async (c) => (await c.query<T>(sql, params)).rows);
const outgoing = (ws: string, leadId: string) =>
  q<{ body: string; status: string; author: string; status_detail: string | null }>(ws, "select body, status, author, status_detail from messages where lead_id = $1 and direction = 'out' order by created_at, id", [leadId]);
const followups = (ws: string, leadId: string) =>
  q<{ run_at: Date; payload: { trigger: string } }>(ws, "select run_at, payload from jobs where lead_id = $1 and kind = 'followup' and status = 'queued' order by run_at", [leadId]);

function mockTwilio() {
  const sent: { to: string; from: string; body: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).includes("api.twilio.com")) {
      const p = new URLSearchParams(String(init.body));
      sent.push({ to: p.get("To")!, from: p.get("From")!, body: p.get("Body")! });
      return new Response(JSON.stringify({ sid: "SM" + randomBytes(16).toString("hex") }), { status: 201 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  return sent;
}

describe("languages", () => {
  test("a French business greets in French, and understands a customer asking for a person in Spanish", async () => {
    const { ws } = await business({ country: "FR", language: "fr" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Bonjour", name: "Camille" });
    assert.match((await outgoing(ws, r.leadId!))[0].body, /^Bonjour Camille, merci d'avoir contacté Bright Smile Dental\./);
    const h = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v2", text: "quiero hablar con una persona" });
    assert.equal(h.reason, "handoff");
    assert.match((await outgoing(ws, h.leadId!)).at(-1)!.body, /transmis votre message/);
  });
});

describe("greetings without a name", () => {
  test("a customer who gave no name is greeted naturally in the business's language, not with an English \"there\"", async () => {
    const { ws } = await business({ country: "MX", language: "es" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Buenas tardes" });
    const body = (await outgoing(ws, r.leadId!))[0].body;
    assert.match(body, /^Hola, gracias por escribir a Bright Smile Dental\./);
    assert.doesNotMatch(body, /there/);
  });
});

describe("time zones", () => {
  test("a Chicago business's follow ups land inside its own waking hours", async () => {
    const { ws } = await business({ country: "US", timeZone: "America/Chicago" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hello" });
    const [job] = await followups(ws, r.leadId!);
    assert.ok(job, "a follow up is scheduled for web chat in the US");
    const hour = localHour(job.run_at, "America/Chicago");
    assert.ok(hour >= automationConfig.quietHours.end && hour < automationConfig.quietHours.start, `scheduled for ${hour}:00 Chicago time`);
  });
});

describe("SMS", () => {
  test("a US text gets an instant reply through Twilio, but no automated follow up texts (TCPA)", async () => {
    const sent = mockTwilio();
    const { ws, smsNumber } = await business({ country: "US", sms: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550101", text: "Hi, do you see children?", externalMessageId: "SM1" });
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0].to, sent[0].from], ["+13125550101", smsNumber]);
    assert.match(sent[0].body, /Yes, from age 3/);
    assert.equal((await outgoing(ws, r.leadId!))[0].status, "sent");
    assert.equal((await followups(ws, r.leadId!)).length, 0, "no follow up text in the US");
    const lead = (await q<{ phone: string }>(ws, "select phone from leads where id = $1", [r.leadId]))[0];
    assert.equal(lead.phone, "+13125550101");
  });

  test("booking reminders still go by text in the US, because they are service messages", async () => {
    mockTwilio();
    const { ws } = await business({ country: "US", sms: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550102", text: "Hello", externalMessageId: "SM2" });
    await setStage(ws, r.leadId!, "booked", new Date(Date.now() + 5 * 24 * 3600_000));
    const jobs = await followups(ws, r.leadId!);
    assert.ok(jobs.length >= 1 && jobs.every((j) => j.payload.trigger === "booked"));
  });

  test("in Nigeria, follow up texts are allowed", async () => {
    mockTwilio();
    const { ws } = await business({ country: "NG", sms: true });
    const r = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+2348031234567", text: "Hello", externalMessageId: "SM3" });
    assert.equal((await followups(ws, r.leadId!)).length, 1);
  });

  test("the same Twilio message delivered twice is handled once", async () => {
    const sent = mockTwilio();
    const { ws } = await business({ country: "US", sms: true });
    await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550103", text: "Hello", externalMessageId: "SM4" });
    const again = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550103", text: "Hello", externalMessageId: "SM4" });
    assert.equal(again.duplicate, true);
    assert.equal(sent.length, 1);
  });
});

describe("STOP and START", () => {
  test("STOP on web chat: confirmed in the business's language, follow ups cancelled, nothing automatic after", async () => {
    const { ws } = await business({ country: "ES", language: "es" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hola" });
    assert.equal((await followups(ws, r.leadId!)).length, 1);
    const stop = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "STOP" });
    assert.match((await outgoing(ws, r.leadId!)).at(-1)!.body, /No recibirás más mensajes automáticos/);
    assert.equal(stop.reason, "Opted out");
    assert.equal((await followups(ws, r.leadId!)).length, 0, "pending follow ups cancelled");
    const after = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Una pregunta más" });
    assert.equal(after.replied, false);
    assert.match(after.reason, /opted out/);

    const back = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "start" });
    assert.equal(back.reason, "Opted in");
    const lead = (await q<{ opted_out_at: Date | null }>(ws, "select opted_out_at from leads where id = $1", [r.leadId]))[0];
    assert.equal(lead.opted_out_at, null);
  });

  test("STOP by text is recorded but not answered, since Twilio already confirms it", async () => {
    const sent = mockTwilio();
    const { ws } = await business({ country: "US", sms: true });
    await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550104", text: "Hi", externalMessageId: "SM5" });
    const stop = await handleInbound({ workspaceId: ws, channel: "sms", externalId: "+13125550104", text: "Stop", externalMessageId: "SM6" });
    assert.equal(stop.replied, false);
    assert.equal(sent.length, 1, "only the first reply was texted");
  });

  test("a follow up already queued is not delivered to someone who opted out", async () => {
    const { ws } = await business({ country: "NG" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hello" });
    const [{ id }] = await q<{ id: string }>(
      ws,
      "insert into messages (workspace_id, lead_id, direction, author, body, status, channel) values ($1, $2, 'out', 'automation', 'Still interested?', 'queued', 'webchat') returning id",
      [ws, r.leadId],
    );
    await q(ws, "update leads set opted_out_at = now() where id = $1", [r.leadId]);
    assert.equal(await deliverMessage(ws, id), "skipped");
  });

  test("'don't stop' is an ordinary message", async () => {
    const { ws } = await business({ country: "UK" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "please don't stop the reminders" });
    assert.notEqual(r.reason, "Opted out");
  });
});

describe("customer data rights", () => {
  test("export holds the whole conversation, and only the business that owns it can get it", async () => {
    const { ws } = await business({ country: "UK" });
    const other = await business({ country: "UK" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Hello, I'm Priya", name: "Priya" });
    const data = await exportCustomer(ws, r.leadId!);
    assert.equal(data?.customer.name, "Priya");
    assert.equal(data?.messages.length, 2);
    assert.equal(data?.messages[0].text, "Hello, I'm Priya");
    assert.equal(await exportCustomer(other.ws, r.leadId!), null, "another business gets nothing");
  });

  test("delete removes the customer, their messages, schedule and alerts, and leaves an anonymous note", async () => {
    const { ws } = await business({ country: "UK" });
    const other = await business({ country: "UK" });
    const r = await handleInbound({ workspaceId: ws, channel: "webchat", externalId: "v1", text: "Can I speak to a person?", name: "Priya" });
    assert.ok((await q(ws, "select id from notifications where link = $1", [`/inbox/${r.leadId}`])).length > 0);

    assert.equal(await deleteCustomer(other.ws, r.leadId!), false, "another business cannot delete it");
    assert.equal(await deleteCustomer(ws, r.leadId!), true);
    for (const table of ["leads", "messages", "jobs"]) {
      const col = table === "leads" ? "id" : "lead_id";
      assert.equal((await q(ws, `select 1 from ${table} where ${col} = $1`, [r.leadId])).length, 0, `${table} cleared`);
    }
    assert.equal((await q(ws, "select id from notifications where link = $1", [`/inbox/${r.leadId}`])).length, 0, "alerts naming them cleared");
    const log = await q<{ summary: string }>(ws, "select summary from activity where kind = 'privacy_delete'");
    assert.equal(log.length, 1);
    assert.doesNotMatch(log[0].summary, /Priya/);
  });
});
