// Round 4 rules that need no database: markets, money in any currency, languages, opt out words, Twilio.
import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { currencySymbol, everyLanguage, formatMoney, getPack, localeFor, markets, packsForMarket, workspaceTimeZone } from "../src/lib/config";
import { amountValue, detectHandoff, isKeywordMessage, isQuestion, pricesAreGrounded } from "../src/lib/pipeline/assistant";
import { isE164, parseInboundSms, sendSms, SmsError, twilioSignature, verifyTwilioSignature } from "../src/lib/channels/sms";
import { timeZoneLabel } from "../src/lib/marketOptions";

describe("markets", () => {
  test("every market has a real currency, real time zones and languages that exist", () => {
    assert.ok(Object.keys(markets).length >= 10);
    for (const [code, m] of Object.entries(markets)) {
      assert.match(code, /^[A-Z]{2}$/);
      assert.ok(currencySymbol(code), `${code} has a currency symbol`);
      for (const zone of m.timeZones) assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: zone }));
      for (const lang of m.languages) assert.equal(localeFor(lang), localeFor(lang), `${code} offers ${lang}`);
    }
  });
  test("money is written the local way", () => {
    assert.equal(formatMoney(150000, "IN"), "₹1,50,000");
    assert.equal(formatMoney(150000, "US"), "$150,000");
    assert.equal(currencySymbol("NG"), "₦");
    assert.equal(currencySymbol("BR"), "R$");
  });
  test("a business's time zone must belong to its market", () => {
    assert.equal(workspaceTimeZone("US", "America/Chicago"), "America/Chicago");
    assert.equal(workspaceTimeZone("US", "Europe/London"), "America/New_York", "falls back to the market's first zone");
    assert.equal(workspaceTimeZone("NG", null), "Africa/Lagos");
    assert.equal(workspaceTimeZone(null, null), "UTC");
    assert.match(timeZoneLabel("America/Los_Angeles", new Date("2026-01-15T12:00:00Z")), /^Los Angeles \(GMT-8\)$/);
  });
  test("packs show only the questions for the business's market, in its currency", () => {
    assert.ok(getPack("dental", "UK").intake.some((f) => f.key === "nhs"), "NHS question in the UK");
    assert.ok(!getPack("dental", "US").intake.some((f) => f.key === "nhs"), "no NHS question in the US");
    assert.ok(getPack("dental", "US").intake.some((f) => f.help.includes("$95")));
    assert.ok(getPack("dental", "IN").intake.some((f) => f.help.includes("₹95")));
    assert.equal(packsForMarket("IN").length, 4);
    assert.ok(getPack("real_estate", "NG").adTemplates.some((t) => /Nigerians/.test(t.audience)));
    assert.ok(!getPack("real_estate", "US").adTemplates.some((t) => /Nigerians/.test(t.audience)));
  });
});

describe("money in any currency", () => {
  test("reads lakh, crore, symbols, codes and words", () => {
    const cases: [string, number][] = [
      ["₹1,50,000", 150000],
      ["2.5 crore", 25000000],
      ["3 lakh rupees", 300000],
      ["Rs. 45,000", 45000],
      ["₦85,000,000", 85000000],
      ["85m", 85000000],
      ["$1,200", 1200],
      ["R$ 350", 350],
      ["50 mil pesos", 50000],
      ["KSh 2,500", 2500],
      ["2 millones", 2000000],
    ];
    for (const [text, value] of cases) assert.equal(amountValue(text), value, text);
  });
  test("the price guard works the same in every currency", () => {
    const facts = "Service: Root canal, price ₹1,50,000\nService: Consultation, price 1500\nQ: Deposit? A: We take a $500 deposit\nService: Plot 500sqm";
    assert.ok(pricesAreGrounded("A root canal is 1.5 lakh rupees.", facts));
    assert.ok(pricesAreGrounded("Consultation is ₹1,500.", facts), "a bare number in a price field counts");
    assert.ok(pricesAreGrounded("The deposit is $500.", facts));
    assert.ok(!pricesAreGrounded("A root canal is ₹1,20,000.", facts));
    assert.ok(!pricesAreGrounded("Whitening is 300 dollars.", facts));
    assert.ok(!pricesAreGrounded("It is R$ 500.", facts.replace("$500 deposit", "deposit")), "500 in 500sqm is a size, not a price");
  });
});

describe("languages", () => {
  test("questions are recognised in every language", () => {
    for (const q of ["combien coûte un détartrage", "¿cuánto cuesta?", "quanto custa a consulta", "Où êtes vous", "how much is it"]) assert.ok(isQuestion(q), q);
    assert.ok(!isQuestion("Thanks, see you then"));
  });
  test("asking for a person works in any language, with or without accents and hyphens", () => {
    const all = everyLanguage("handoffKeywords");
    assert.equal(detectHandoff("Je veux parler à quelqu'un svp", all), "parler à quelqu'un");
    assert.equal(detectHandoff("Appelez-moi demain", all), "appelez moi");
    assert.equal(detectHandoff("quiero un REEMBOLSO", all), "reembolso");
    assert.equal(detectHandoff("quero falar com alguem", all), "falar com alguém");
  });
  test("STOP must be the whole message", () => {
    const stop = everyLanguage("optOutKeywords");
    for (const t of ["STOP", "stop.", " Stop ", "ARRÊT", "parar", "Unsubscribe"]) assert.ok(isKeywordMessage(t, stop), t);
    for (const t of ["don't stop now", "where do I stop to park?", "stopping by tomorrow"]) assert.ok(!isKeywordMessage(t, stop), t);
  });
  test("every language has every text, and greetings fill in the names", () => {
    for (const lang of ["en", "fr", "es", "pt"]) {
      const l = localeFor(lang);
      assert.match(l.assistant.greeting, /\{businessName\}/);
      assert.ok(l.webchat.launcherLabel);
    }
    assert.equal(localeFor("de"), localeFor("en"), "an unknown language falls back to English");
  });
});

describe("Twilio", () => {
  const token = "0123456789abcdef0123456789abcdef";
  const url = "https://app.example.com/api/webhooks/sms";
  const params = { AccountSid: "AC" + "a".repeat(32), From: "+14155550100", To: "+14155550199", Body: "Hi", MessageSid: "SM" + "b".repeat(32) };

  test("a signed request is accepted; anything changed is refused", () => {
    const sig = twilioSignature(url, params, token);
    assert.ok(verifyTwilioSignature(url, params, sig, token));
    assert.ok(!verifyTwilioSignature(url, { ...params, Body: "Hi!" }, sig, token), "tampered body");
    assert.ok(!verifyTwilioSignature(url, params, sig, "f".repeat(32)), "wrong token");
    assert.ok(!verifyTwilioSignature("http://app.example.com/api/webhooks/sms", params, sig, token), "different address");
    assert.ok(!verifyTwilioSignature(url, params, null, token), "no signature");
    assert.ok(!verifyTwilioSignature(url, params, sig, ""), "no token saved");
  });
  test("matches Twilio's documented signing method", () => {
    // Twilio's own worked example from its webhook security documentation.
    // Given in a shuffled order on purpose: the fields must be sorted before signing.
    const docParams = { To: "+18005551212", Digits: "1234", CallSid: "CA1234567890ABCDE", From: "+14158675310", Caller: "+14158675310" };
    assert.equal(twilioSignature("https://example.com/myapp.php?foo=1&bar=2", docParams, "12345"), "L/OH5YylLD5NRKLltdqwSvS0BnU=");
  });
  test("only real phone numbers are accepted", () => {
    assert.ok(isE164("+2348031234567"));
    assert.ok(!isE164("08031234567"));
    assert.equal(parseInboundSms({ ...params, From: "not a number" }), null);
    assert.equal(parseInboundSms(params)?.from, "+14155550100");
  });
  test("sending: success, a STOPped number, and a Twilio outage", async () => {
    let sent: { url: string; auth: string; body: string } | null = null;
    const ok = (async (u: string, init: RequestInit) => {
      sent = { url: String(u), auth: String((init.headers as Record<string, string>).authorization), body: String(init.body) };
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
    }) as typeof fetch;
    const sid = await sendSms({ accountSid: params.AccountSid, authToken: token, from: params.To, to: params.From, body: "Hello", fetchImpl: ok });
    assert.equal(sid, "SM123");
    assert.ok(sent!.url.endsWith(`/Accounts/${params.AccountSid}/Messages.json`));
    assert.equal(sent!.auth, `Basic ${Buffer.from(`${params.AccountSid}:${token}`).toString("base64")}`);
    assert.equal(new URLSearchParams(sent!.body).get("To"), params.From);

    const stopped = (async () => new Response(JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }), { status: 400 })) as typeof fetch;
    await assert.rejects(sendSms({ accountSid: params.AccountSid, authToken: token, from: params.To, to: params.From, body: "x", fetchImpl: stopped }), (e: unknown) => e instanceof SmsError && !e.retryable && /opted out/.test(e.message));

    const outage = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    await assert.rejects(sendSms({ accountSid: params.AccountSid, authToken: token, from: params.To, to: params.From, body: "x", fetchImpl: outage }), (e: unknown) => e instanceof SmsError && e.retryable);
  });
});
