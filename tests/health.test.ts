import "./helpers";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { appConfig, auditConfig, packs } from "../src/lib/config";
import { scoreAudit } from "../src/lib/audit/score";
import { areaScores, bandFor, brainCompleteness, checkRows, counts, impactFor, relativeTime } from "../src/lib/health";
import { emptyBrandBrain } from "../src/lib/brandBrain";

const presence = { websiteUrl: "https://example.com", instagramUrl: null, googleProfileUrl: null };

function audit(facts: Parameters<typeof scoreAudit>[2], at: string) {
  return { ...scoreAudit(auditConfig, presence, facts), createdAt: new Date(at) };
}

const bare = audit({ fetched: true, https: false }, "2026-10-01T10:00:00Z");
const better = audit({ fetched: true, https: true, whatsappNumbers: ["2348000000000"], viewport: true }, "2026-10-08T10:00:00Z");
const unreadable = audit({ fetched: false, error: "Your website could not be reached." }, "2026-10-09T10:00:00Z");

describe("dashboard numbers", () => {
  test("every check belongs to a configured area", () => {
    const ids = new Set(auditConfig.areas.map((a) => a.id));
    for (const c of auditConfig.checks) assert.ok(ids.has(c.area), c.id);
  });

  test("bands and impact follow the configured thresholds", () => {
    const sorted = [...appConfig.dashboard.bands].sort((a, b) => b.min - a.min);
    assert.equal(bandFor(100), sorted[0].label);
    assert.equal(bandFor(0), sorted[sorted.length - 1].label);
    assert.equal(impactFor(10), "High");
    assert.equal(impactFor(5), "Medium");
    assert.equal(impactFor(3), "Low");
  });

  test("counts add up to every check", () => {
    const c = counts(better);
    assert.equal(c.working + c.leaking + c.waiting, auditConfig.checks.length);
    assert.equal(c.waiting, 0);
  });

  test("website checks wait, rather than leak, when the site could not be read", () => {
    const c = counts(unreadable);
    const siteChecks = auditConfig.checks.filter((x) => x.group === "site").length;
    assert.equal(c.waiting, siteChecks);
    const technical = areaScores(unreadable).find((a) => a.id === "Technical")!;
    assert.equal(technical.score, null);
  });

  test("rows show what was fixed since the last check, leaks first", () => {
    const rows = checkRows([bare, better]);
    const https = rows.find((r) => r.id === "https")!;
    assert.equal(https.change, "fixed");
    assert.deepEqual(https.history, ["leaking", "working"]);
    const firstWorking = rows.findIndex((r) => r.status === "working");
    assert.ok(rows.slice(0, firstWorking).every((r) => r.status !== "working"));
  });

  test("area scores stay between 0 and 100", () => {
    for (const a of areaScores(better)) {
      if (a.score !== null) assert.ok(a.score >= 0 && a.score <= 100, a.id);
    }
  });

  test("brand brain completeness counts the niche questions too", () => {
    const pack = packs.find((p) => p.id === "real_estate")!;
    const empty = brainCompleteness(emptyBrandBrain(), pack);
    assert.equal(empty.filled, 0);
    assert.equal(empty.total, 9 + pack.intake.length);
    const some = brainCompleteness({ ...emptyBrandBrain(), businessName: "X", answers: { titleDocuments: "C of O" } }, pack);
    assert.equal(some.filled, 2);
  });

  test("relative time reads naturally", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    assert.equal(relativeTime(new Date("2026-10-19T11:59:30Z"), now), "just now");
    assert.equal(relativeTime(new Date("2026-10-19T11:58:00Z"), now), "2 min ago");
    assert.equal(relativeTime(new Date("2026-10-19T09:00:00Z"), now), "3 hours ago");
    assert.equal(relativeTime(new Date("2026-10-17T12:00:00Z"), now), "2 days ago");
  });
});
