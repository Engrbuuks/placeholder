// The whole automation loop against the real database: message in, reply out, qualifying,
// handoff, follow ups on schedule, approvals, bookings, retries, WhatsApp rules and isolation.
import "./helpers";
import { uniqueEmail } from "./helpers";
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getPool, globalQuery, withTenant } from "../src/lib/db";
import { createAccountWithWorkspace } from "../src/lib/workspaces";
import { encryptSecret } from "../src/lib/crypto";
import { packs } from "../src/lib/config";
import { handleInbound } from "../src/lib/pipeline/engine";
import { approveMessage, ownerReply, setPaused, setStage } from "../src/lib/pipeline/owner";
import { runDueJobs } from "../src/lib/pipeline/worker";

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;

const estate = packs.find((p) => p.id === "real_estate")!;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
after(async () => {
  await getPool().end();
});

const brainData = {
  businessName: "Lekki Gardens Homes",
  summary: "Verified plots and terraces in Lekki.",
  hours: "Mon to Sat 9am to 6pm",
  phone: "+2348000000000",
  services: [{ name: "3 bedroom terrace", price: "₦85,000,000" }],
  faqs: [{ q: "Do you offer virtual inspections?", a: "Yes, by video call any weekday." }],
  answers: { titleDocuments: "Every plot has a C of O." },
};

async function business(opts: { confirmed?: boolean; approval?: "auto" | "approve"; pack?: string } = {}) {
  const acct = (await createAccountWithWorkspace({
    email: uniqueEmail("pipe"),
    passwordHash: "x",
    fullName: "Owner Person",
    businessName: "Lekki Gardens Homes",
  }))!;
  const ws = acct.workspaceId;
  await withTenant(ws, async (c) => {
    await c.query("update workspaces set country = 'NG', niche_pack = $2, onboarding_step = 'done' where id = $1", [ws, opts.pack ?? "real_estate"]);
    await c.query("update brand_brains set data = $2, status = $3 where workspace_id = $1", [
      ws,
      JSON.stringify(brainData),
      opts.confirmed === false ? "draft" : "confirmed",
    ]);
    await c.query("insert into automation_settings (workspace_id, approval_mode) values ($1, $2)", [ws, opts.approval ?? "auto"]);
    await c.query("insert into channel_connections (workspace_id, channel, public_key) values ($1, 'webchat', $2)", [
      ws,
      randomBytes(12).toString("base64url"),
    ]);
  });
  return ws;
}

const q = <T extends Record<string, unknown>>(ws: string, sql: string, params: unknown[] = []) =>
  withTenant(ws, async (c) => (await c.query<T>(sql, params)).rows);

const outgoing = (ws: string, leadId: string) =>
  q<{ body: string; status: string; author: string; status_detail: string | null }>(
    ws,
    "select body, status, author, status_detail from messages where lead_id = $1 and direction = 'out' order by created_at, id",
    [leadId],
  );
const lead = async (ws: string, leadId: string) => (await q<Record<string, any>>(ws, "select * from leads where id = $1", [leadId]))[0];
const queued = (ws: string, leadId: string) =>
  q<{ id: number; kind: string; payload: any; run_at: Date }>(ws, "select id, kind, payload, run_at from jobs where lead_id = $1 and status = 'queued' order by run_at", [leadId]);
const makeDue = (ws: string, jobId: number) => q(ws, "update jobs set run_at = now() - interval '1 second' where id = $1", [jobId]);

const say = (ws: string, text: string, who = "visitor-1", channel: "webchat" | "whatsapp" = "webchat", id?: string) =>
  handleInbound({ workspaceId: ws, channel, externalId: who, text, externalMessageId: id });

describe("conversation engine", () => {
  test("first message: greets, answers the question, asks the first qualifying question", async () => {
    const ws = await business();
    const r = await say(ws, "How much is the 3 bedroom terrace?");
    assert.ok(r.replied);
    const [reply] = await outgoing(ws, r.leadId!);
    assert.equal(reply.status, "sent");
    assert.match(reply.body, /thanks for messaging Lekki Gardens Homes/);
    assert.match(reply.body, /₦85,000,000/);
    assert.match(reply.body, new RegExp(estate.qualifiers[0].replace("?", "\\?")));
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "qualifying");
    const jobs = await queued(ws, r.leadId!);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.trigger, "no_reply");
    assert.ok(jobs[0].run_at.getTime() > Date.now() + 23 * 3600_000, "first follow up waits about a day");
  });

  test("a webhook delivered twice is handled once", async () => {
    const ws = await business();
    const a = await say(ws, "Hello", "v", "webchat", "ext-1");
    const b = await say(ws, "Hello", "v", "webchat", "ext-1");
    assert.ok(!a.duplicate && b.duplicate);
    assert.equal((await outgoing(ws, a.leadId!)).length, 1);
  });

  test("works through every qualifying question, then alerts the owner and hands over the booking", async () => {
    const ws = await business();
    const r = await say(ws, "Hi there");
    for (const answer of ["About 80 million", "United Kingdom", "To live in", "Next year", "Payment plan"]) {
      await say(ws, answer);
    }
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "qualified");
    assert.equal(l.qualifier_answers.length, estate.qualifiers.length);
    assert.equal(l.qualifier_answers[1].a, "United Kingdom");
    const last = (await outgoing(ws, r.leadId!)).at(-1)!;
    assert.match(last.body, /everything I need/);
    assert.match(last.body, /inspection/);
    const notes = await q<{ kind: string }>(ws, "select kind from notifications order by id");
    assert.ok(notes.some((n) => n.kind === "qualified"));
    const emails = await q(ws, "select id from jobs where kind = 'email'");
    assert.ok(emails.length >= 1, "an alert email is queued");
    assert.equal((await queued(ws, r.leadId!)).filter((j) => j.kind === "followup").length, 1, "only one follow up is ever pending");

    await say(ws, "Saturday at 10am works for me");
    const after = await lead(ws, r.leadId!);
    assert.equal(after.stage, "handoff");
    assert.match(after.handoff_reason, /Wants to book/);
  });

  test("asking for a person hands over straight away", async () => {
    const ws = await business();
    const r = await say(ws, "I want to speak to a person");
    assert.equal((await lead(ws, r.leadId!)).stage, "handoff");
    assert.match((await outgoing(ws, r.leadId!))[0].body, /passed this to the Lekki Gardens Homes team/);
    // Once a person owns it, the assistant stays quiet.
    const again = await say(ws, "Hello?");
    assert.ok(!again.replied);
    assert.equal((await outgoing(ws, r.leadId!)).length, 1);
  });

  test("emergencies at a clinic go to a person", async () => {
    const ws = await business({ pack: "clinic" });
    const r = await say(ws, "My mother has chest pain right now");
    assert.equal((await lead(ws, r.leadId!)).stage, "handoff");
  });

  test("a question the brand brain cannot answer goes to a person instead of a guess", async () => {
    const ws = await business();
    const r = await say(ws, "Is the road to the estate tarred?");
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "handoff");
    assert.match((await outgoing(ws, r.leadId!))[0].body, /would rather not guess/);
  });

  test("nothing is sent until the brand brain is confirmed", async () => {
    const ws = await business({ confirmed: false });
    const r = await say(ws, "Hello");
    assert.ok(!r.replied);
    assert.equal((await outgoing(ws, r.leadId!)).length, 0);
    const notes = await q<{ title: string }>(ws, "select title from notifications");
    assert.match(notes[0].title, /New message/);
  });
});

describe("scheduled steps", () => {
  test("the follow up goes out when it is due, and the next step is scheduled", async () => {
    const ws = await business();
    const r = await say(ws, "Hello");
    const [job] = await queued(ws, r.leadId!);
    await makeDue(ws, job.id);
    await runDueJobs({ budgetMs: 8000 });
    const msgs = await outgoing(ws, r.leadId!);
    assert.equal(msgs.at(-1)!.author, "automation");
    assert.match(msgs.at(-1)!.body, /checking in from Lekki Gardens Homes/);
    const next = await queued(ws, r.leadId!);
    assert.equal(next[0].payload.stepIndex, 1);
  });

  test("a customer who replies is not chased with the old follow up", async () => {
    const ws = await business();
    const r = await say(ws, "Hello");
    const [job] = await queued(ws, r.leadId!);
    await say(ws, "About 80 million");
    const cancelled = await q<{ status: string }>(ws, "select status from jobs where id = $1", [job.id]);
    assert.equal(cancelled[0].status, "cancelled");
  });

  test("in approval mode, follow ups wait for the owner", async () => {
    const ws = await business({ approval: "approve" });
    const r = await say(ws, "Hello");
    const [job] = await queued(ws, r.leadId!);
    await makeDue(ws, job.id);
    await runDueJobs({ budgetMs: 8000 });
    const pending = await q<{ id: string; status: string }>(ws, "select id, status from messages where lead_id = $1 and author = 'automation'", [r.leadId]);
    assert.equal(pending[0].status, "pending_approval");
    assert.equal(await approveMessage(ws, pending[0].id), "sent");
    const sent = await q<{ status: string }>(ws, "select status from messages where id = $1", [pending[0].id]);
    assert.equal(sent[0].status, "sent");
  });

  test("booking schedules reminders before the appointment; losing the lead stops everything", async () => {
    const ws = await business();
    const r = await say(ws, "Hello");
    const bookedFor = new Date(Date.now() + 3 * 24 * 3600_000);
    bookedFor.setUTCHours(10, 0, 0, 0);
    await setStage(ws, r.leadId!, "booked", bookedFor);
    const reminders = (await queued(ws, r.leadId!)).filter((j) => j.payload.trigger === "booked");
    assert.equal(reminders.length, 2);
    assert.ok(reminders.every((j) => j.run_at < bookedFor));
    assert.equal((await queued(ws, r.leadId!)).filter((j) => j.payload.trigger === "no_reply").length, 0);

    await makeDue(ws, reminders[0].id);
    await runDueJobs({ budgetMs: 8000 });
    assert.match((await outgoing(ws, r.leadId!)).at(-1)!.body, /reminder of your inspection/);

    await setStage(ws, r.leadId!, "lost");
    assert.equal((await queued(ws, r.leadId!)).length, 0);
  });

  test("pausing a conversation stops replies; handing back resumes them", async () => {
    const ws = await business();
    const r = await say(ws, "Hello");
    await setPaused(ws, r.leadId!, true);
    assert.ok(!(await say(ws, "About 80 million")).replied);
    await setPaused(ws, r.leadId!, false);
    assert.ok((await say(ws, "United Kingdom")).replied);
  });

  test("an owner reply takes over the conversation", async () => {
    const ws = await business();
    const r = await say(ws, "Hello");
    assert.equal(await ownerReply(ws, r.leadId!, "Hi, this is Ada from the sales team."), "sent");
    const l = await lead(ws, r.leadId!);
    assert.equal(l.stage, "handoff");
    assert.equal(l.unread, 0);
  });
});

describe("whatsapp delivery", () => {
  async function whatsappBusiness(settings: Record<string, string> = {}) {
    const ws = await business();
    await withTenant(ws, (c) =>
      c.query(
        "insert into channel_connections (workspace_id, channel, external_account_id, secret_enc, settings) values ($1, 'whatsapp', $2, $3, $4)",
        [ws, `pn-${randomBytes(6).toString("hex")}`, encryptSecret("token-abc"), JSON.stringify(settings)],
      ),
    );
    return ws;
  }
  function mockFetch(status: number, captured: { url: string; body: any; auth: string }[]) {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured.push({ url: String(url), body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
      return new Response(JSON.stringify(status === 200 ? { messages: [{ id: `wamid.${captured.length}` }] } : { error: { message: "Service unavailable", code: 2 } }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  test("replies inside the 24 hour window go out as text with the stored token", async () => {
    const ws = await whatsappBusiness();
    const sent: { url: string; body: any; auth: string }[] = [];
    mockFetch(200, sent);
    const r = await say(ws, "Hello", "2348031234567", "whatsapp", "wamid.in1");
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /graph\.facebook\.com\/v\d+\.\d+\/pn-[a-f0-9]+\/messages/);
    assert.equal(sent[0].auth, "Bearer token-abc");
    assert.equal(sent[0].body.type, "text");
    assert.equal(sent[0].body.to, "2348031234567");
    const [m] = await outgoing(ws, r.leadId!);
    assert.equal(m.status, "sent");
  });

  test("after 24 hours, follow ups use the approved template or are skipped with a reason", async () => {
    const plain = await whatsappBusiness();
    const sent: { url: string; body: any; auth: string }[] = [];
    mockFetch(200, sent);
    const r = await say(plain, "Hello", "2348000000001", "whatsapp", "wamid.in2");
    await q(plain, "update leads set last_inbound_at = now() - interval '2 days' where id = $1", [r.leadId]);
    await ownerReply(plain, r.leadId!, "Are you still interested?");
    const skipped = (await outgoing(plain, r.leadId!)).at(-1)!;
    assert.equal(skipped.status, "skipped");
    assert.match(skipped.status_detail!, /24 hour/);

    const templated = await whatsappBusiness({ templateName: "follow_up_one", templateLanguage: "en_GB" });
    const r2 = await say(templated, "Hello", "2348000000002", "whatsapp", "wamid.in3");
    await q(templated, "update leads set last_inbound_at = now() - interval '2 days', name = 'Tunde' where id = $1", [r2.leadId]);
    sent.length = 0;
    await ownerReply(templated, r2.leadId!, "Are you still interested?");
    assert.equal(sent[0].body.type, "template");
    assert.equal(sent[0].body.template.name, "follow_up_one");
    assert.equal(sent[0].body.template.language.code, "en_GB");
    assert.equal(sent[0].body.template.components[0].parameters[0].text, "Tunde");
  });

  test("a failing send is retried with backoff, then marked failed and the owner told", async () => {
    const ws = await whatsappBusiness();
    mockFetch(200, []);
    const r = await say(ws, "Hello", "2348000000003", "whatsapp", "wamid.in4");
    mockFetch(503, []);
    assert.equal(await ownerReply(ws, r.leadId!, "Following up"), "retrying");
    const [job] = await q<{ id: number; status: string }>(ws, "select id, status from jobs where kind = 'deliver' and lead_id = $1", [r.leadId]);
    assert.equal(job.status, "queued");

    await makeDue(ws, job.id);
    await runDueJobs({ budgetMs: 8000 });
    const retried = await q<{ status: string; attempts: number; run_at: Date; last_error: string }>(ws, "select status, attempts, run_at, last_error from jobs where id = $1", [job.id]);
    assert.equal(retried[0].status, "queued");
    assert.equal(retried[0].attempts, 1);
    assert.ok(retried[0].run_at.getTime() > Date.now(), "next try is backed off");
    assert.match(retried[0].last_error, /Service unavailable/);

    await q(ws, "update jobs set attempts = max_attempts - 1, run_at = now() - interval '1 second' where id = $1", [job.id]);
    await runDueJobs({ budgetMs: 8000 });
    const final = await q<{ status: string }>(ws, "select status from jobs where id = $1", [job.id]);
    assert.equal(final[0].status, "failed");
    assert.equal((await outgoing(ws, r.leadId!)).at(-1)!.status, "failed");
    const notes = await q<{ kind: string }>(ws, "select kind from notifications");
    assert.ok(notes.some((n) => n.kind === "job_failed"));
  });
});

describe("weekly monitoring and isolation", () => {
  test("weekly checks are queued once per business and run", async () => {
    const ws = await business();
    await runDueJobs({ budgetMs: 1, scheduleWeekly: true });
    await runDueJobs({ budgetMs: 1, scheduleWeekly: true });
    const jobs = await q<{ status: string }>(ws, "select status from jobs where kind = 'weekly_check'");
    assert.equal(jobs.length, 1, "queued once, not twice");
    await runDueJobs({ budgetMs: 15000 });
    const audits = await q(ws, "select id from audit_reports");
    assert.equal(audits.length, 1);
    const log = await q<{ summary: string }>(ws, "select summary from activity where kind = 'weekly_check'");
    assert.match(log[0].summary, /Weekly check/);
  });

  test("one business cannot see another's conversations or jobs", async () => {
    const a = await business();
    const b = await business();
    const r = await say(b, "Hello");
    assert.equal((await q(a, "select id from leads where id = $1", [r.leadId])).length, 0);
    assert.equal((await q(a, "select id from messages where lead_id = $1", [r.leadId])).length, 0);
    assert.equal((await q(a, "select id from jobs where lead_id = $1", [r.leadId])).length, 0);
    await assert.rejects(
      withTenant(a, (c) => c.query("insert into leads (workspace_id, channel, external_id) values ($1, 'webchat', 'x')", [b])),
      /violates row.level security policy/,
    );
    const outside = await globalQuery("select id from leads");
    assert.equal(outside.rowCount, 0, "nothing is visible without a tenant");
  });
});

describe("ordering", () => {
  test("a reply is always stored after the message it answers", async () => {
    const ws = await business();
    const r = await say(ws, "Hello");
    for (const t of ["About 80 million", "United Kingdom", "To live in"]) await say(ws, t);
    const rows = await q<{ direction: string }>(ws, "select direction from messages where lead_id = $1 order by created_at, id", [r.leadId]);
    assert.deepEqual(rows.map((x) => x.direction), ["in", "out", "in", "out", "in", "out", "in", "out"]);
  });
});
