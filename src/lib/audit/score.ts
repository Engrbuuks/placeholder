// Turns page facts into scored, plain language results using the checks in config/audit.json.
import type { AuditConfig } from "../config";
import type { PageFacts } from "./analyze";

export type CheckResult = {
  id: string;
  group: "presence" | "site";
  label: string;
  weight: number;
  passed: boolean;
  message: string;
  fix: string;
};

export type AuditOutcome = { score: number; results: CheckResult[]; facts: PageFacts };

export type PresenceInput = { websiteUrl: string | null; instagramUrl: string | null; googleProfileUrl: string | null };

function evaluate(id: string, facts: PageFacts, t: AuditConfig["thresholds"]): boolean {
  switch (id) {
    case "https":
      return facts.https === true;
    case "whatsapp":
      return (facts.whatsappNumbers?.length ?? 0) > 0;
    case "phone":
      return (facts.phoneNumbers?.length ?? 0) > 0;
    case "booking":
      return facts.bookingCta === true;
    case "viewport":
      return facts.viewport === true;
    case "speed":
      return (facts.responseMs ?? Infinity) <= t.responseMs;
    case "title": {
      const n = facts.title?.length ?? 0;
      return n >= t.titleMin && n <= t.titleMax;
    }
    case "description": {
      const n = facts.description?.length ?? 0;
      return n >= t.descriptionMin && n <= t.descriptionMax;
    }
    case "contact_form":
      return facts.hasForm === true;
    case "schema":
      return Boolean(facts.schemaBusiness?.name || facts.schemaBusiness?.telephone || facts.schemaBusiness?.address);
    case "social":
      return (facts.socialLinks?.length ?? 0) > 0;
    case "maps":
      return Boolean(facts.mapsLink);
    case "reviews":
      return facts.hasReviews === true;
    case "analytics":
      return facts.analytics === true;
    case "og_image":
      return facts.ogImage === true;
    case "page_weight":
      return (facts.bytes ?? Infinity) <= t.pageKb * 1024;
    default:
      throw new Error(`No rule exists for audit check "${id}". Add one in score.ts or remove it from config/audit.json.`);
  }
}

export function scoreAudit(config: AuditConfig, presence: PresenceInput, facts: PageFacts): AuditOutcome {
  const results: CheckResult[] = [];

  for (const check of config.checks) {
    let passed: boolean;
    let message: string;

    if (check.group === "presence") {
      if (check.id === "website") {
        passed = Boolean(presence.websiteUrl) && facts.fetched;
        message = passed ? check.pass : presence.websiteUrl ? (check.unreachable ?? check.fail) : check.fail;
      } else if (check.id === "instagram") {
        passed = Boolean(presence.instagramUrl);
        message = passed ? check.pass : check.fail;
      } else if (check.id === "google_profile") {
        passed = Boolean(presence.googleProfileUrl);
        message = passed ? check.pass : check.fail;
      } else {
        throw new Error(`No rule exists for presence check "${check.id}".`);
      }
    } else {
      // A site that could not be read fails its site checks: visitors cannot use it either.
      passed = facts.fetched ? evaluate(check.id, facts, config.thresholds) : false;
      message = passed ? check.pass : check.fail;
    }

    results.push({
      id: check.id,
      group: check.group,
      label: check.label,
      weight: check.weight,
      passed,
      message,
      fix: check.fix,
    });
  }

  const total = results.reduce((sum, r) => sum + r.weight, 0);
  const earned = results.reduce((sum, r) => sum + (r.passed ? r.weight : 0), 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { score, results, facts };
}
