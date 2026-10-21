// Reading conversations and checking AI drafts, with no database and no network.
import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { budgetIsGrounded, concernIn, findBudget, heatBand, mergeReadings, readWithRules, scoreLead, worthReading, type Turn } from "../src/lib/insight";
import { checkWrittenMessage, clockTimesIn } from "../src/lib/pipeline/personal";
import { automationConfig } from "../src/lib/config";

const said = (...texts: string[]): Turn[] => texts.flatMap((t) => [{ from: "customer" as const, text: t }, { from: "business" as const, text: "Thanks." }]);
const read = (turns: Turn[], services = ["3 bedroom terrace", "Land in Ibeju Lekki"]) =>
  readWithRules({ turns, qualifierAnswers: [], services, stage: "qualifying" });

describe("reading a conversation with the rules", () => {
  test("a serious buyer: what they want, budget, urgency and buying signals", () => {
    const r = read(said("Good afternoon. I need a 3 bedroom terrace.", "My budget is 80m. Can I inspect tomorrow?"));
    assert.equal(r.wants, "3 bedroom terrace");
    assert.equal(r.budget, "80m");
    assert.equal(r.urgency, "now");
    assert.ok(r.signals.some((s) => /inspect tomorrow/.test(s)));
    assert.equal(r.intent, "ready_to_book");
    assert.match(r.summary, /Wants 3 bedroom terrace, budget 80m/);
  });

  test("concerns are noticed in French and Spanish, quoted in the customer's words", () => {
    const fr = read(said("C'est trop cher pour moi, je vais réfléchir."));
    assert.deepEqual(fr.concerns.map((c) => c.type).sort(), ["price", "timing"]);
    assert.match(fr.concerns[0].quote, /trop cher/);
    const es = read(said("Lo necesito lo antes posible, ¿tienen disponibilidad?"));
    assert.equal(es.urgency, "now");
    assert.ok(es.signals.length > 0);
  });

  test("the latest statement about timing wins", () => {
    assert.equal(read(said("No rush, just looking.", "Actually I need it this week.")).urgency, "soon");
    assert.equal(read(said("I need it today.", "Sorry, no rush after all.")).urgency, "later");
  });

  test("a budget is only a number the customer gave as money", () => {
    assert.equal(findBudget("I want 2 rooms and 3 toilets"), null, "counts of rooms are not a budget");
    assert.equal(findBudget("Is it about 500 square metres?"), null, "a small bare number is not a budget");
    assert.equal(findBudget("My budget is around 2 lakh"), "2 lakh");
    assert.equal(findBudget("I can pay ₦5,000,000 now"), "₦5,000,000");
    assert.equal(findBudget("between 40 and 45 million naira"), "45 million naira");
  });

  test("a family member is not a competitor; a family member who does the job is", () => {
    assert.equal(concernIn("My brother needs braces too"), null);
    assert.equal(concernIn("My brother knows a dentist who does it"), "competitor");
    assert.equal(concernIn("Is there a cheaper option?"), "price");
    assert.equal(concernIn("Can I see reviews first?"), "trust");
  });

  test("one word replies and STOP are never sent to the AI", () => {
    assert.equal(worthReading("ok"), false);
    assert.equal(worthReading("STOP"), false);
    assert.equal(worthReading("I want to book a check up"), true);
  });
});

describe("heat score", () => {
  const facts = { stage: "qualifying", answered: 2, totalQualifiers: 4, paidSource: true, customerMessages: 4 };
  test("an urgent buyer with a budget is hot, with every reason shown", () => {
    const r = read(said("I need a 3 bedroom terrace.", "Budget 80m. Can I inspect tomorrow?"));
    const { heat, reasons } = scoreLead(r, facts);
    assert.ok(heat >= automationConfig.scoring.hot, `scored ${heat}`);
    assert.equal(heatBand(heat), "hot");
    assert.ok(reasons.some((x) => /wants it today or tomorrow/.test(x)));
    assert.ok(reasons.some((x) => /paid ad/.test(x)));
  });
  test("someone just looking with no rush is cold, and the score never goes below zero", () => {
    const r = read(said("Just looking, no rush. Too expensive anyway."));
    const { heat } = scoreLead(r, { stage: "new", answered: 0, totalQualifiers: 4, paidSource: false, customerMessages: 1 });
    assert.equal(heat, 0);
    assert.equal(heatBand(heat), "cold");
  });
  test("the weights come from config", () => {
    const r = read(said("I need it today."));
    const before = scoreLead(r, facts).heat;
    const saved = automationConfig.scoring.weights.urgencyNow;
    automationConfig.scoring.weights.urgencyNow = saved + 10;
    try {
      assert.equal(scoreLead(r, facts).heat, Math.min(100, before + 10));
    } finally {
      automationConfig.scoring.weights.urgencyNow = saved;
    }
  });
});

describe("keeping only what the customer actually said", () => {
  const customer = "I want a terrace. My budget is 80m. It's a bit expensive. Can I inspect tomorrow?";
  const rules = read(said(customer));
  const ai = {
    wants: "A 3 bedroom terrace for family use",
    urgency: "now" as const,
    budget: "₦90m",
    concerns: [{ type: "trust" as const, quote: "I am worried you are a scam" }],
    signals: ["Can I inspect tomorrow?", "I will pay today"],
    intent: "ready_to_book" as const,
    summary: "Wants a terrace soon and asked to inspect.",
  };
  const merged = mergeReadings(ai, rules, customer);
  test("an invented budget is replaced with the one they typed", () => {
    assert.equal(budgetIsGrounded("₦90m", customer), false);
    assert.equal(budgetIsGrounded("80m", customer), true);
    assert.equal(merged.budget, "80m");
  });
  test("an invented concern is dropped, and a concern the rules found is never hidden", () => {
    assert.ok(!merged.concerns.some((c) => c.type === "trust"));
    assert.ok(merged.concerns.some((c) => c.type === "price"));
  });
  test("signals the customer never wrote are dropped", () => {
    assert.ok(merged.signals.some((s) => /inspect tomorrow/.test(s)));
    assert.ok(!merged.signals.some((s) => /pay today/.test(s)));
  });
  test("the AI's understanding of what they want and the summary are kept", () => {
    assert.equal(merged.wants, "A 3 bedroom terrace for family use");
    assert.equal(merged.summary, "Wants a terrace soon and asked to inspect.");
  });
});

describe("checking an AI written follow up", () => {
  const facts = "Business: Bright Smile\nOpening hours: Mon to Sat 9am to 6pm\nService: Check up, price ₦15,000";
  const freeTimes = ["Thursday 29 October at 10:00 am", "Thursday 29 October at 10:30 am"];
  const link = "https://app.example/b/key?l=tok";
  const check = (m: string) => checkWrittenMessage(m, { facts, freeTimes, links: [link], maxLength: 300 });

  test("a personal message using real facts, a real free time and the booking link passes", () => {
    assert.deepEqual(check(`Hi Ada, you asked about a check up (₦15,000). Thursday at 10:30 am is free: ${link}`), { ok: true });
  });
  test("an invented price, time, day or link is refused, with the reason", () => {
    assert.match(String((check("A check up is only ₦10,000 this week.") as { reason: string }).reason), /price/);
    assert.match(String((check("We can see you Thursday at 2:15 pm.") as { reason: string }).reason), /time/);
    assert.match(String((check("We have space on Sunday.") as { reason: string }).reason), /day/);
    assert.match(String((check("Book here: https://evil.example/x") as { reason: string }).reason), /link/);
  });
  test("an empty, overlong or half filled message is refused", () => {
    assert.equal(check("  ").ok, false);
    assert.equal(check("a".repeat(301)).ok, false);
    assert.equal(check("Hi {firstName}").ok, false);
  });
  test("clock times are read in every common format, and counts are not times", () => {
    assert.deepEqual([...clockTimesIn("3pm, 10.30 am, 15h30, 9:05 and 12am")], [900, 630, 930, 545, 0]);
    assert.equal(clockTimesIn("a 3 bedroom flat for 2 people").size, 0);
  });
});
