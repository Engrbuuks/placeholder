import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { packs } from "../src/lib/config";
import { emptyBrandBrain } from "../src/lib/brandBrain";
import { answerFromBrain, detectHandoff, extractContact, factsText, isQuestion, pricesAreGrounded } from "../src/lib/pipeline/assistant";
import { render, firstName } from "../src/lib/templates";
import { inQuietHours, nextAllowedTime, previousAllowedTime, zonedLocalToDate } from "../src/lib/time";
import { parseWebhook, verifySignature, withinWindow } from "../src/lib/channels/whatsapp";

import { encryptSecret, decryptSecret } from "../src/lib/crypto";

process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

const estate = packs.find((p) => p.id === "real_estate")!;
const clinic = packs.find((p) => p.id === "clinic")!;
const brain = {
  ...emptyBrandBrain(),
  businessName: "Lekki Gardens Homes",
  summary: "Verified plots and terraces in Lekki.",
  hours: "Mon to Sat 9am to 6pm",
  address: "12 Admiralty Way, Lekki",
  phone: "+2348000000000",
  services: [
    { name: "Dry land plot 500sqm", price: "₦25,000,000" },
    { name: "3 bedroom terrace", price: "₦85,000,000" },
  ],
  faqs: [{ q: "Do you offer virtual inspections?", a: "Yes, by video call any weekday." }],
  answers: { titleDocuments: "Every plot has a C of O.", paymentPlans: "30% deposit, balance over 12 months." },
};

describe("assistant rules", () => {
  test("finds the price of the service asked about", () => {
    assert.equal(answerFromBrain("How much is the 3 bedroom terrace?", brain, estate), "3 bedroom terrace is ₦85,000,000.");
  });
  test("answers from a written FAQ first", () => {
    assert.equal(answerFromBrain("can I do a virtual inspection?", brain, estate), "Yes, by video call any weekday.");
  });
  test("a short fact is labelled so it makes sense on its own", () => {
    const terse = { ...brain, answers: { titleDocuments: "C of O" } };
    assert.equal(answerFromBrain("Do you have C of O?", terse, estate), "Title documents available: C of O.");
  });
  test("answers niche questions by their match words", () => {
    assert.equal(answerFromBrain("Do you have C of O?", brain, estate), "Every plot has a C of O.");
    assert.equal(answerFromBrain("is there a payment plan", brain, estate), "30% deposit, balance over 12 months.");
  });
  test("answers hours and address", () => {
    assert.match(answerFromBrain("What time do you open on Saturday?", brain, estate) ?? "", /Mon to Sat/);
    assert.match(answerFromBrain("where are you located", brain, estate) ?? "", /Admiralty/);
  });
  test("says nothing rather than guess", () => {
    assert.equal(answerFromBrain("Is the road to the estate tarred?", brain, estate), null);
  });
  test("spots questions and handoff phrases", () => {
    assert.ok(isQuestion("how much is it"));
    assert.ok(isQuestion("Price?"));
    assert.ok(!isQuestion("About 30 million"));
    assert.equal(detectHandoff("I want to speak to a person please", ["speak to a person"]), "speak to a person");
    assert.equal(detectHandoff("my child has chest pain", clinic.handoffKeywords), "chest pain");
    assert.equal(detectHandoff("humanity", ["human"]), null);
  });
  test("reads contact details from a message", () => {
    assert.deepEqual(extractContact("I'm Tunde, call me on +234 803 123 4567 or tunde@mail.com"), {
      email: "tunde@mail.com",
      phone: "+2348031234567",
      name: "Tunde",
    });
  });
  test("the price guard blocks amounts the business never wrote", () => {
    const facts = factsText(brain, estate);
    assert.ok(pricesAreGrounded("The terrace is ₦85,000,000.", facts));
    assert.ok(!pricesAreGrounded("The terrace is ₦70,000,000 this week only.", facts));
    assert.ok(!pricesAreGrounded("It costs £500.", facts));
    assert.ok(pricesAreGrounded("Yes, we have plots available.", facts));
  });
});

describe("templates and time", () => {
  test("templates fill names and drop unknown values", () => {
    assert.equal(render("Hi {firstName}, thanks for messaging {businessName}.", { firstName: "Ada", businessName: "X" }), "Hi Ada, thanks for messaging X.");
    assert.equal(render("Hi {firstName} {missing}.", { firstName: "Ada" }), "Hi Ada.");
    assert.equal(firstName("Chiamaka Obi"), "Chiamaka");
    assert.equal(firstName(null), "there");
    assert.equal(firstName("+2348000"), "there");
  });
  test("nothing is sent in quiet hours, local to the business", () => {
    const quiet = { start: 21, end: 8 };
    const lagos10pm = new Date("2026-10-19T21:00:00Z"); // 22:00 in Lagos
    assert.ok(inQuietHours(lagos10pm, "Africa/Lagos", quiet));
    const moved = nextAllowedTime(lagos10pm, "Africa/Lagos", quiet);
    assert.equal(moved.toISOString(), "2026-10-20T07:00:00.000Z"); // 08:00 in Lagos
    const back = previousAllowedTime(lagos10pm, "Africa/Lagos", quiet);
    assert.equal(back.toISOString(), "2026-10-19T19:45:00.000Z"); // 20:45 in Lagos
    assert.equal(nextAllowedTime(new Date("2026-10-19T12:00:00Z"), "Africa/Lagos", quiet).toISOString(), "2026-10-19T12:00:00.000Z");
  });
  test("booking times typed in local time are read in the business's zone", () => {
    assert.equal(zonedLocalToDate("2026-10-22T10:00", "Africa/Lagos")?.toISOString(), "2026-10-22T09:00:00.000Z");
    assert.equal(zonedLocalToDate("2026-07-01T10:00", "Europe/London")?.toISOString(), "2026-07-01T09:00:00.000Z");
    assert.equal(zonedLocalToDate("2026-12-01T10:00", "Europe/London")?.toISOString(), "2026-12-01T10:00:00.000Z");
    assert.equal(zonedLocalToDate("nonsense", "Africa/Lagos"), null);
  });
});

describe("whatsapp and secrets", () => {
  const sample = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "1111" },
              contacts: [{ wa_id: "2348031234567", profile: { name: "Tunde" } }],
              messages: [{ from: "2348031234567", id: "wamid.A", timestamp: "1760000000", type: "text", text: { body: "Hello" } }],
              statuses: [{ id: "wamid.B", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };
  test("parses messages and statuses", () => {
    const parsed = parseWebhook(sample);
    assert.equal(parsed.messages.length, 1);
    assert.deepEqual(
      { ...parsed.messages[0], timestamp: 0 },
      { phoneNumberId: "1111", from: "2348031234567", id: "wamid.A", text: "Hello", name: "Tunde", timestamp: 0 },
    );
    assert.equal(parsed.statuses[0].status, "delivered");
    assert.deepEqual(parseWebhook({ object: "page" }), { messages: [], statuses: [] });
  });
  test("checks Meta's signature and rejects tampering", () => {
    const raw = JSON.stringify(sample);
    const sig = "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
    assert.ok(verifySignature(raw, sig, "secret"));
    assert.ok(!verifySignature(raw + " ", sig, "secret"));
    assert.ok(!verifySignature(raw, sig, "other"));
    assert.ok(!verifySignature(raw, null, "secret"));
  });
  test("the 24 hour window", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    assert.ok(withinWindow(new Date("2026-10-19T00:00:00Z"), now));
    assert.ok(!withinWindow(new Date("2026-10-18T11:00:00Z"), now));
    assert.ok(!withinWindow(null, now));
  });
  test("secrets are encrypted and cannot be altered", () => {
    const stored = encryptSecret("EAAG-token");
    assert.ok(!stored.includes("EAAG"));
    assert.equal(decryptSecret(stored), "EAAG-token");
    const parts = stored.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    assert.throws(() => decryptSecret(parts.join(".")));
  });
});

describe("price guard reads amounts the way people write them", async () => {
  const { amountValue } = await import("../src/lib/pipeline/assistant");
  test("amounts with words and suffixes", () => {
    assert.equal(amountValue("₦85,000,000"), 85_000_000);
    assert.equal(amountValue("85m"), 85_000_000);
    assert.equal(amountValue("85 million naira"), 85_000_000);
    assert.equal(amountValue("£95"), 95);
    assert.equal(amountValue("2.5k"), 2500);
  });
  test("a paraphrased price that matches is allowed", () => {
    const facts = "Service: 3 bedroom terrace, price ₦85,000,000";
    assert.ok(pricesAreGrounded("The terrace costs 85 million naira.", facts));
    assert.ok(!pricesAreGrounded("The terrace costs 80 million naira.", facts));
  });
});
