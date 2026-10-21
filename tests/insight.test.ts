// Round 7 against the real database: reading conversations, hot lead alerts, concerns answered in the owner's
// own words, and AI written follow ups that are checked before they are sent.
import "./helpers";
import { uniqueEmail } from "./helpers";
import { after, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getPool, withTenant } from "../src/lib/db";
import { createAccountWithWorkspace } from "../src/lib/workspaces";
import { automationConfig, packs } from "../src/lib/config";
import { handleInbound } from "../src/lib/pipeline/engine";
import { readLead } from "../src/lib/pipeline/reading";
import { runDueJobs } from "../src/lib/pipeline/worker";

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;

const estate = packs.find((p) => p.id === "real_estate")!;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ANTHROPIC_API_KEY;
});
after(async () => {
  await getPool().end();
});

const allWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), ["09:00", "17:00"]]));

async function business(opts: { objections?: Record<string, string>; booking?: boolean; approval?: "auto" | "approve" } = {}) {
  const acct = (await createAccountWithWorkspace({ email: uniqueEmail("insight"), passwordHash: "x", fullName: "Owner", businessName: "Lekki Gardens Homes" }))!;
  const ws = acct.workspaceId;
  await withTenant(ws, async (c) => {
    await c.query("update workspaces set country = 'NG', niche_pack = 'real_estate', onboarding_step = 'done' where id = $1", [ws]);
    await c.query("update brand_brains set data = $2, status = 'confirmed' where workspace_id = $1", [
      ws,
      JSON.stringify({
        businessName: "Lekki Gardens Homes",
        summary: "Verified plots and terraces in Lekki.",
        hours: "Mon to Sat 9am to 6pm",
        phone: "+2348000000000",
        services: [{ name: "3 bedroom terrace", price: "₦85,000,000" }],
        faqs: [],
        answers: {},
        objections: { price: "", trust: "", timing: "", competitor: "", ...(opts.objections ?? {}) },
      }),
    ]);
    await c.query("insert into automation_settings (workspace_id, approval_mode) values ($1, $2)", [ws, opts.approval ?? "auto"]);
    await c.query("insert into channel_connections (workspace_id, channel, public_key) values ($1, 'webchat', $2)", [ws, randomBytes(12).toString("base64url")]);
    if (opts.booking)
      await c.query("insert into booking_settings (workspace_id, enabled, slot_minutes, min_notice_hours, max_days_ahead, weekly) values ($1, true, 30, 1, 14, $2)", [
        ws,
        JSON.stringify(allWeek),
      ]);
  });
  return ws;
}

const q = <T extends Record<string, unknown>>(ws: string, sql: string, params: unknown[] = []) => withTenant(ws, async (c) => (await c.query<T>(sql, params)).rows);
const say = (ws: string, text: string, who = "visitor-1") => handleInbound({ workspaceId: ws, channel: "webchat", externalId: who, text });
const lead = async (ws: string, id: string) => (await q<Record<string, any>>(ws, "select * from leads where id = $1", [id]))[0];
const outgoing = (ws: string, id: string) =>
  q<{ body: string; author: string; status: string; ai_written: boolean }>(ws, "select body, author, status, ai_written from messages where lead_id = $1 and direction = 'out' order by created_at, id", [id]);

/** Answers Claude calls with a reply chosen per call, and counts them. */
function mockClaude(reply: (system: string, user: any) => unknown) {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const calls: { model: string; system: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).includes("anthropic.com")) {
      const body = JSON.parse(String(init.body));
      calls.push({ model: body.model, system: body.system });
      const out = reply(body.system, JSON.parse(body.messages[0].content));
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(out) }] }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  return calls;
}

describe("reading conversations", () => {
  test("every message queues one reading, and a burst of messages is read once", async () => {
    const ws = await business();
    const r = await say(ws, "Hello, I want a 3 bedroom terrace");
    await say(ws, "Is it in Lekki?");
    const jobs = await q(ws, "select run_at from jobs where lead_id = $1 and kind = 'lead_insight' and status = 'queued'", [r.leadId]);
    assert.equal(jobs.length, 1, "one reading for the burst");
  });

  test("with no AI key the rules read the conversation, score it, and alert the owner once when it turns hot", async () => {
    const ws = await business();
    const r = await say(ws, "Hello, I want a 3 bedroom terrace");
    await say(ws, "My budget is 85m and I can pay the deposit tomorrow");
    const first = await readLead(ws, r.leadId!);
    assert.equal(first!.source, "rules");
    assert.equal(first!.insight.budget, "85m");
    assert.equal(first!.insight.urgency, "now");
    assert.ok(first!.heat >= automationConfig.scoring.hot, `heat ${first!.heat}`);
    const l = await lead(ws, r.leadId!);
    assert.equal(l.heat, first!.heat);
    assert.equal(l.insight.wants, "3 bedroom terrace");
    assert.ok(l.insight.nextStep.length > 0);
    await readLead(ws, r.leadId!);
    const alerts = await q<{ title: string }>(ws, "select title from notifications where kind = 'hot_lead'");
    assert.equal(alerts.length, 1, "the hot alert goes out once, not on every reading");
    assert.match(alerts[0].title, /Hot lead/);
    const emails = await q(ws, "select 1 from jobs where kind = 'email' and payload->>'subject' like 'Hot lead%'");
    assert.equal(emails.length, 1, "and it is emailed");
  });

  test("the reading job runs from the queue like any other step", async () => {
    const ws = await business();
    const r = await say(ws, "I need a 3 bedroom terrace today");
    await q(ws, "update jobs set run_at = now() - interval '1 second' where lead_id = $1 and kind = 'lead_insight'", [r.leadId]);
    await runDueJobs({ budgetMs: 8000 });
    assert.ok((await lead(ws, r.leadId!)).insight_at, "the lead was read");
  });

  test("with AI on, the AI reads it, and an invented budget is replaced by the customer's own", async () => {
    const calls = mockClaude((system) =>
      system.includes("read sales conversations")
        ? { wants: "A family terrace near the coast road", urgency: "soon", budget: "₦120m", concerns: [], signals: ["can I come and see it"], intent: "ready_to_book", summary: "Wants a family terrace; asked to view it this week." }
        : { answer: null },
    );
    const ws = await business();
    const r = await say(ws, "Hello, I want a terrace for my family, budget 85m, can I come and see it this week?");
    const read = await readLead(ws, r.leadId!);
    assert.equal(read!.source, "ai");
    assert.equal(read!.insight.wants, "A family terrace near the coast road");
    assert.equal(read!.insight.budget, "85m", "₦120m was never written by the customer");
    assert.ok(calls.some((c) => c.model === automationConfig.ai.readModel));
    const ledger = await q(ws, "select 1 from usage_ledger where kind = 'ai_read'");
    assert.equal(ledger.length, 1);
  });

  test("if the AI fails, the rules reading is kept", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    globalThis.fetch = (async (url: string, init: RequestInit) =>
      String(url).includes("anthropic.com") ? new Response("busy", { status: 529 }) : realFetch(url, init)) as typeof fetch;
    const ws = await business();
    const r = await say(ws, "I need a 3 bedroom terrace urgently");
    const read = await readLead(ws, r.leadId!);
    assert.equal(read!.source, "rules");
    assert.equal(read!.insight.urgency, "now");
  });

  test("once the month's AI allowance is used, readings use the rules and Claude is not called", async () => {
    const saved = automationConfig.ai.monthlyCallsPerWorkspace;
    automationConfig.ai.monthlyCallsPerWorkspace = 0;
    try {
      const calls = mockClaude(() => ({ answer: null }));
      const ws = await business();
      const r = await say(ws, "I need a 3 bedroom terrace this week");
      const read = await readLead(ws, r.leadId!);
      assert.equal(read!.source, "rules");
      assert.equal(calls.length, 0);
    } finally {
      automationConfig.ai.monthlyCallsPerWorkspace = saved;
    }
  });
});

describe("concerns", () => {
  test("a concern the owner has answered gets the owner's words, then the assistant carries on", async () => {
    const answer = "We understand. Our price includes the C of O and we offer a 12 month payment plan.";
    const ws = await business({ objections: { price: answer } });
    const r = await say(ws, "Hello, I want a 3 bedroom terrace");
    await say(ws, "Hmm, that's too expensive for me");
    const out = await outgoing(ws, r.leadId!);
    assert.ok(out.at(-1)!.body.includes(answer));
    assert.ok(out.at(-1)!.body.includes(estate.qualifiers[0]), "the same question is asked again, because a concern is not an answer");
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "qualifying");
    assert.equal(l.qualifier_index, 0);
    assert.equal((await q(ws, "select 1 from activity where kind = 'concern_answered'")).length, 1);
  });

  test("a concern with no written answer goes to the owner; the assistant never improvises one", async () => {
    const ws = await business();
    const r = await say(ws, "Hello, I want a 3 bedroom terrace");
    await say(ws, "Is this legit? How do I know you are genuine?");
    const out = await outgoing(ws, r.leadId!);
    assert.match(out.at(-1)!.body, /answer that for you personally/);
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "handoff");
    assert.match(l.handoff_reason, /whether they can trust you/);
    await readLead(ws, r.leadId!);
    const concernAlerts = await q(ws, "select 1 from notifications where kind = 'concern'");
    assert.equal(concernAlerts.length, 0, "already handed over, so no second alert for the same thing");
    assert.equal((await q(ws, "select 1 from notifications where kind = 'handoff'")).length, 1);
  });
});

describe("asking to book", () => {
  test("a booking question the facts cannot answer gets the booking page, not a shrug", async () => {
    const ws = await business({ booking: true });
    const r = await say(ws, "Hello, I need it done tomorrow, can I book?");
    const reply = (await outgoing(ws, r.leadId!)).at(-1)!.body;
    assert.match(reply, /\/b\//);
    assert.doesNotMatch(reply, /rather not guess/);
    assert.ok(!reply.includes(estate.qualifiers[0]), "no more questions once they are offered the booking page");
    assert.notEqual((await lead(ws, r.leadId!)).stage, "handoff");
  });
  test("with no booking page it goes to the owner as a booking request", async () => {
    const ws = await business();
    const r = await say(ws, "Hello, can I book a viewing please?");
    const reply = (await outgoing(ws, r.leadId!)).at(-1)!.body;
    assert.match(reply, /arrange a time with you/);
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "handoff");
    assert.match(l.handoff_reason, /^Wants to book/);
  });
});

describe("personal follow ups", () => {
  async function quietLead(ws: string) {
    const r = await say(ws, "Hello, I want a 3 bedroom terrace for my family");
    await q(ws, "update jobs set run_at = now() - interval '1 second' where lead_id = $1 and kind = 'followup'", [r.leadId]);
    return r.leadId!;
  }

  test("the AI writes it from the conversation, offering a real free time, and it is labelled", async () => {
    let offered: string[] = [];
    let link = "";
    mockClaude((system, user) => {
      if (system.includes("follow up")) {
        offered = user.freeTimes;
        link = user.bookingLink;
        return { message: `Hi, you asked about a 3 bedroom terrace for your family. ${offered[0]} is free for a viewing: ${link}` };
      }
      return system.includes("read sales") ? { wants: null, urgency: "unknown", budget: null, concerns: [], signals: [], intent: "unknown", summary: "Asked about a terrace." } : { answer: null };
    });
    const ws = await business({ booking: true });
    const leadId = await quietLead(ws);
    await runDueJobs({ budgetMs: 8000 });
    assert.equal(offered.length, automationConfig.ai.freeTimesOffered, "real free times from the calendar were offered");
    const last = (await outgoing(ws, leadId)).at(-1)!;
    assert.equal(last.author, "automation");
    assert.equal(last.ai_written, true);
    assert.ok(last.body.includes(offered[0]) && last.body.includes(link));
    assert.equal((await q(ws, "select 1 from usage_ledger where kind = 'ai_followup'")).length, 1);
  });

  test("a draft with an invented price is not sent; the template goes instead and the owner sees why", async () => {
    mockClaude((system) =>
      system.includes("follow up")
        ? { message: "Hi, the terrace is now only ₦70,000,000 if you pay this week!" }
        : system.includes("read sales")
          ? { wants: null, urgency: "unknown", budget: null, concerns: [], signals: [], intent: "unknown", summary: "x" }
          : { answer: null },
    );
    const ws = await business();
    const leadId = await quietLead(ws);
    await runDueJobs({ budgetMs: 8000 });
    const last = (await outgoing(ws, leadId)).at(-1)!;
    assert.equal(last.ai_written, false);
    assert.doesNotMatch(last.body, /70,000,000/);
    const note = await q<{ summary: string }>(ws, "select summary from activity where kind = 'followup_template'");
    assert.match(note[0].summary, /price you never wrote down/);
  });

  test("with no AI key the planned template is sent exactly as before", async () => {
    const ws = await business();
    const leadId = await quietLead(ws);
    await runDueJobs({ budgetMs: 8000 });
    const last = (await outgoing(ws, leadId)).at(-1)!;
    assert.equal(last.ai_written, false);
    assert.equal(last.author, "automation");
    assert.equal((await q(ws, "select 1 from activity where kind = 'followup_template'")).length, 0, "nothing to explain when AI is simply off");
  });

  test("in approval mode an AI written follow up waits for the owner like any other", async () => {
    mockClaude((system) =>
      system.includes("follow up")
        ? { message: "Hi, you asked about a 3 bedroom terrace for your family. Would you like to view it?" }
        : system.includes("read sales")
          ? { wants: null, urgency: "unknown", budget: null, concerns: [], signals: [], intent: "unknown", summary: "x" }
          : { answer: null },
    );
    const ws = await business({ approval: "approve" });
    const leadId = await quietLead(ws);
    await runDueJobs({ budgetMs: 8000 });
    const last = (await outgoing(ws, leadId)).at(-1)!;
    assert.equal(last.status, "pending_approval");
    assert.equal(last.ai_written, true);
  });
});
