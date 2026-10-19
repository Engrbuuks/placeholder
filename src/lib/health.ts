// Turns stored checks and the brand brain into the numbers the dashboard shows.
// Pure functions: everything shown is derived from real stored data, nothing is estimated.
import { appConfig, auditConfig, type NichePack } from "./config";
import type { BrandBrain } from "./brandBrain";
import type { CheckResult } from "./audit/score";

type AuditLike = { score: number; results: CheckResult[]; facts: { fetched: boolean }; createdAt: Date };

export type CheckStatus = "working" | "leaking" | "waiting";

export function bandFor(score: number): string {
  const bands = [...appConfig.dashboard.bands].sort((a, b) => b.min - a.min);
  return (bands.find((b) => score >= b.min) ?? bands[bands.length - 1]).label;
}

export function impactFor(weight: number): string {
  const levels = [...auditConfig.impact].sort((a, b) => b.min - a.min);
  return (levels.find((l) => weight >= l.min) ?? levels[levels.length - 1]).label;
}

const groupOf = new Map(auditConfig.checks.map((c) => [c.id, c.group]));
const areaOf = new Map(auditConfig.checks.map((c) => [c.id, c.area]));

/** A site check is only judged when the site could actually be read. */
export function statusOf(result: CheckResult, siteRead: boolean): CheckStatus {
  if (!siteRead && (groupOf.get(result.id) ?? result.group) === "site") return "waiting";
  return result.passed ? "working" : "leaking";
}

export function counts(audit: AuditLike) {
  const tally = { working: 0, leaking: 0, waiting: 0 };
  for (const r of audit.results) tally[statusOf(r, audit.facts.fetched)]++;
  return { ...tally, total: audit.results.length };
}

/** Weighted share of each area that is working, 0 to 100. Areas with nothing judged yet return null. */
export function areaScores(audit: AuditLike) {
  return auditConfig.areas.map((area) => {
    const judged = audit.results.filter((r) => areaOf.get(r.id) === area.id && statusOf(r, audit.facts.fetched) !== "waiting");
    const total = judged.reduce((s, r) => s + r.weight, 0);
    const earned = judged.reduce((s, r) => s + (r.passed ? r.weight : 0), 0);
    return { ...area, score: total === 0 ? null : Math.round((earned / total) * 100), judged: judged.length };
  });
}

export type CheckRow = {
  id: string;
  label: string;
  area: string;
  weight: number;
  impact: string;
  status: CheckStatus;
  change: "fixed" | "new" | "same" | "first";
  message: string;
  fix: string;
  history: CheckStatus[];
};

/** One row per configured check, leaks first, then by how much each matters. */
export function checkRows(history: AuditLike[], historyLength = appConfig.dashboard.historyLength): CheckRow[] {
  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;
  if (!latest) return [];
  const recent = history.slice(-historyLength);
  const order: Record<CheckStatus, number> = { leaking: 0, waiting: 1, working: 2 };

  return latest.results
    .map((r) => {
      const status = statusOf(r, latest.facts.fetched);
      const before = previous?.results.find((p) => p.id === r.id);
      const beforeStatus = before && previous ? statusOf(before, previous.facts.fetched) : null;
      let change: CheckRow["change"] = "first";
      if (beforeStatus) {
        if (beforeStatus === "leaking" && status === "working") change = "fixed";
        else if (beforeStatus === "working" && status === "leaking") change = "new";
        else change = "same";
      }
      return {
        id: r.id,
        label: r.label,
        area: areaOf.get(r.id) ?? "",
        weight: r.weight,
        impact: impactFor(r.weight),
        status,
        change,
        message: r.message,
        fix: r.fix,
        history: recent.map((a) => {
          const match = a.results.find((x) => x.id === r.id);
          return match ? statusOf(match, a.facts.fetched) : "waiting";
        }),
      };
    })
    .sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);
}

/** How much of the brand brain is filled in, from the essentials plus this niche's own questions. */
export function brainCompleteness(brain: BrandBrain, pack: NichePack) {
  const fields: boolean[] = [
    Boolean(brain.businessName),
    Boolean(brain.summary),
    Boolean(brain.phone || brain.whatsapp),
    Boolean(brain.email),
    Boolean(brain.address),
    Boolean(brain.hours),
    brain.services.length > 0,
    brain.faqs.length > 0,
    Boolean(brain.tone),
    ...pack.intake.map((f) => Boolean(brain.answers[f.key])),
  ];
  const filled = fields.filter(Boolean).length;
  return { filled, total: fields.length, percent: Math.round((filled / fields.length) * 100) };
}

export function relativeTime(from: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
