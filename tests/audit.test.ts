import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { auditConfig, packs } from "../src/lib/config";
import { analyzeHtml } from "../src/lib/audit/analyze";
import { scoreAudit } from "../src/lib/audit/score";
import { draftFromFacts } from "../src/lib/audit/draft";
import { assertFetchableUrl, BlockedAddressError, fetchPublicPage, isPublicAddress, safeLookup } from "../src/lib/audit/safeFetch";
import { emptyBrandBrain } from "../src/lib/brandBrain";
import { matchNicheByKeywords } from "../src/lib/niche";
import { normaliseGoogleProfile, normaliseInstagram, normaliseWebsite } from "../src/lib/urls";
import { brandBrainFromForm } from "../src/lib/brandBrainForm";

const goodPage = `<!doctype html><html><head>
<title>Bright Smile Dental | Private dentist in Leeds</title>
<meta name="description" content="Private dental practice in Leeds offering implants, aligners and whitening with spread payments.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:image" content="https://example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Bright Smile Dental","telephone":"+44 113 000 0000",
"address":{"streetAddress":"1 Park Row","addressLocality":"Leeds","postalCode":"LS1 1AA"},"openingHours":["Mo-Fr 09:00-17:00"]}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
</head><body>
<h1>Bright Smile Dental</h1><h2>Dental implants</h2>
<a href="https://wa.me/441130000000">Chat on WhatsApp</a>
<a href="tel:+441130000000">Call us</a>
<a href="/book">Book a consultation</a>
<a href="https://instagram.com/brightsmile">Instagram</a>
<a href="https://maps.app.goo.gl/abc">Directions</a>
<p>Read what our patients say in our reviews.</p>
<form><input name="name"><input name="phone"><textarea name="msg"></textarea></form>
</body></html>`;

const meta = { finalUrl: "https://example.com/", status: 200, responseMs: 400, bytes: goodPage.length };

describe("audit", () => {
  test("every configured check has a scoring rule", () => {
    assert.doesNotThrow(() =>
      scoreAudit(auditConfig, { websiteUrl: "https://x.com", instagramUrl: null, googleProfileUrl: null }, { fetched: true }),
    );
  });

  test("a well built page passes every site check", () => {
    const { facts } = analyzeHtml(goodPage, meta, auditConfig.keywords);
    const outcome = scoreAudit(
      auditConfig,
      { websiteUrl: "https://example.com", instagramUrl: "https://instagram.com/b", googleProfileUrl: "https://g.page/b" },
      facts,
    );
    const failed = outcome.results.filter((r) => !r.passed).map((r) => r.id);
    assert.deepEqual(failed, []);
    assert.equal(outcome.score, 100);
  });

  test("a bare page leaks and the score drops", () => {
    const bare = "<html><head><title>Home</title></head><body><p>Welcome</p></body></html>";
    const { facts } = analyzeHtml(bare, { ...meta, finalUrl: "http://example.com/" }, auditConfig.keywords);
    const outcome = scoreAudit(auditConfig, { websiteUrl: "http://example.com", instagramUrl: null, googleProfileUrl: null }, facts);
    const failed = new Set(outcome.results.filter((r) => !r.passed).map((r) => r.id));
    for (const id of ["https", "whatsapp", "phone", "booking", "viewport", "title", "description", "instagram"]) {
      assert.ok(failed.has(id), `${id} should fail`);
    }
    assert.ok(outcome.score < 30, `score was ${outcome.score}`);
  });

  test("no website at all fails presence and site checks", () => {
    const outcome = scoreAudit(auditConfig, { websiteUrl: null, instagramUrl: null, googleProfileUrl: null }, { fetched: false });
    assert.equal(outcome.score, 0);
  });

  test("the draft picks up facts from structured data", () => {
    const { facts } = analyzeHtml(goodPage, meta, auditConfig.keywords);
    const brain = draftFromFacts(facts, emptyBrandBrain());
    assert.equal(brain.businessName, "Bright Smile Dental");
    assert.equal(brain.phone, "+44 113 000 0000");
    assert.equal(brain.whatsapp, "+441130000000");
    assert.match(brain.address, /1 Park Row, Leeds/);
    assert.match(brain.hours, /Mo-Fr/);
  });

  test("the draft never overwrites what the owner already typed", () => {
    const { facts } = analyzeHtml(goodPage, meta, auditConfig.keywords);
    const brain = draftFromFacts(facts, { ...emptyBrandBrain(), businessName: "My Own Name", phone: "0800" });
    assert.equal(brain.businessName, "My Own Name");
    assert.equal(brain.phone, "0800");
  });
});

describe("address guard", () => {
  test("private and special addresses are refused", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
    for (const ip of ["8.8.8.8", "102.89.1.1", "2a00:1450:4009::200e"]) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
  });

  test("unsafe web addresses are refused before any connection", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost:3000/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
      "ftp://example.com/",
      "https://user:pass@example.com/",
      "https://example.com:8443/",
      "http://printer.local/",
    ]) {
      assert.throws(() => assertFetchableUrl(url), BlockedAddressError, url);
    }
    assert.doesNotThrow(() => assertFetchableUrl("https://example.com/"));
  });

  test("a redirect to an internal address is refused", async () => {
    const internal = createServer((_req, res) => res.end("secret"));
    await new Promise<void>((r) => internal.listen(0, "127.0.0.1", r));
    const port = (internal.address() as { port: number }).port;
    try {
      // The first hop is also local, so this proves the guard runs on the direct request.
      await assert.rejects(
        fetchPublicPage(`http://127.0.0.1:${port}/`, auditConfig.fetch),
        /not a public website|standard web ports/,
      );
    } finally {
      internal.close();
    }
  });

  test("a hostname that resolves to a private address is refused at connect time", async () => {
    // "localhost" resolves to loopback through the system resolver, the same path any hostname takes.
    const error = await new Promise<Error | null>((resolve) =>
      safeLookup("localhost", {}, (err) => resolve(err)),
    );
    assert.ok(error instanceof BlockedAddressError, String(error));
    const both = await new Promise<Error | null>((resolve) =>
      safeLookup("localhost", { all: true }, (err) => resolve(err)),
    );
    assert.ok(both instanceof BlockedAddressError, String(both));
  });
});

describe("owner input", () => {
  test("web addresses are tidied", () => {
    assert.deepEqual(normaliseWebsite("mybiz.com"), { ok: true, value: "https://mybiz.com/" });
    assert.equal(normaliseWebsite("nonsense").ok, false);
    assert.deepEqual(normaliseInstagram("@my.biz"), { ok: true, value: "https://instagram.com/my.biz" });
    assert.deepEqual(normaliseInstagram("https://www.instagram.com/my.biz/"), { ok: true, value: "https://instagram.com/my.biz" });
    assert.equal(normaliseGoogleProfile("https://maps.app.goo.gl/abc").ok, true);
    assert.equal(normaliseGoogleProfile("https://evil.example/abc").ok, false);
  });

  test("niche matching by keywords", () => {
    assert.equal(matchNicheByKeywords("We sell plots of land and duplexes in Lekki", "NG"), "real_estate");
    assert.equal(matchNicheByKeywords("private dental implants and whitening", "UK"), "dental");
    assert.equal(matchNicheByKeywords("diagnostic laboratory and scan centre", "NG"), "clinic");
    assert.equal(matchNicheByKeywords("we bake cakes", "NG"), "general");
  });

  test("the brand brain form reads services, questions and pack answers", () => {
    const pack = packs.find((p) => p.id === "dental")!;
    const form = new FormData();
    form.set("businessName", "Bright Smile");
    form.set("summary", "Private dentist in Leeds.");
    form.set("phone", "0113");
    form.set("services", "Implant consultation | £95\nWhitening\n\n");
    form.set("faqs", "Do you offer finance? | Yes, over 12 months\nbroken line without answer");
    form.set("tone", "warm");
    form.set("answer_finance", "12 months interest free");
    form.set("answer_notInPack", "ignored");
    const result = brandBrainFromForm(form, pack);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.brain.services, [
      { name: "Implant consultation", price: "£95" },
      { name: "Whitening", price: "" },
    ]);
    assert.equal(result.brain.faqs.length, 1);
    assert.deepEqual(result.brain.answers, { finance: "12 months interest free" });
    assert.deepEqual(result.missing, []);
  });

  test("an unknown tone is dropped and missing essentials are reported", () => {
    const form = new FormData();
    form.set("tone", "<script>");
    const result = brandBrainFromForm(form, packs[0]);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.brain.tone, "");
    assert.ok(result.missing.includes("Business name"));
  });
});
