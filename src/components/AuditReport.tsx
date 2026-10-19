import type { CheckResult } from "@/lib/audit/score";

/** One segment per check, sized by how much it matters. Black is working, orange is leaking. */
export function LeakBar({ results, label }: { results: CheckResult[]; label: string }) {
  const total = results.reduce((s, r) => s + r.weight, 0) || 1;
  const ordered = [...results].sort((a, b) => Number(b.passed) - Number(a.passed));
  return (
    <div className="leak-bar flex h-3 w-full gap-[3px]" role="img" aria-label={label}>
      {ordered.map((r) => (
        <span
          key={r.id}
          title={`${r.label}: ${r.passed ? "working" : "leaking"}`}
          className={`rounded-full ${r.passed ? "bg-ink" : "bg-accent"}`}
          style={{ width: `${(r.weight / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function ScoreHeadline({
  score,
  results,
  siteRead = true,
}: {
  score: number;
  results: CheckResult[];
  siteRead?: boolean;
}) {
  const leaks = results.filter((r) => !r.passed && (siteRead || r.group !== "site")).length;
  return (
    <div className="space-y-5">
      <div className="flex items-end gap-6">
        <p className="text-[5.5rem] font-semibold leading-[0.8] tracking-[-0.06em]">{score}</p>
        <div className="pb-1">
          <p className="label">Score out of 100</p>
          <p className="mt-1 text-[0.9375rem]">
            {leaks === 0 ? "Nothing is leaking." : `${leaks} ${leaks === 1 ? "place is" : "places are"} leaking customers.`}
          </p>
        </div>
      </div>
      <LeakBar results={results} label={`Score ${score} out of 100 with ${leaks} leaks`} />
      <div className="flex gap-5">
        <span className="label inline-flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-ink" />
          Working
        </span>
        <span className="label inline-flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
          Leaking
        </span>
      </div>
    </div>
  );
}

export function LeakList({
  results,
  limit,
  siteRead = true,
  hasWebsite = true,
}: {
  results: CheckResult[];
  limit?: number;
  siteRead?: boolean;
  hasWebsite?: boolean;
}) {
  // When the site could not be read, its checks are summarised in one line instead of listed one by one.
  const skipped = siteRead ? [] : results.filter((r) => r.group === "site");
  const leaks = results
    .filter((r) => !r.passed && (siteRead || r.group !== "site"))
    .sort((a, b) => b.weight - a.weight);
  const working = results.filter((r) => r.passed);
  const shown = limit ? leaks.slice(0, limit) : leaks;
  return (
    <div className="space-y-10">
      {shown.length > 0 && (
        <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((r) => (
            <li key={r.id} className="grid gap-x-6 gap-y-2 px-5 py-5 sm:grid-cols-[1fr_1.15fr] sm:px-6">
              <div className="flex gap-3">
                <span aria-hidden className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="font-medium">{r.label}</p>
                  <p className="mt-0.5 text-[0.9375rem] text-ink-soft">{r.message}</p>
                </div>
              </div>
              <div className="pl-5 sm:pl-0">
                <p className="label">Fix</p>
                <p className="mt-0.5 text-[0.9375rem]">{r.fix}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!limit && skipped.length > 0 && (
        <div className="rounded-2xl border border-dashed border-ink/25 px-6 py-5">
          <p className="font-medium">{skipped.length} website checks are waiting</p>
          <p className="mt-0.5 text-[0.9375rem] text-ink-soft">
            {hasWebsite
              ? "They run once your website loads, covering things like your WhatsApp link, mobile layout and speed."
              : "Add your website and we check things like your WhatsApp link, mobile layout and speed."}
          </p>
        </div>
      )}
      {!limit && working.length > 0 && (
        <div>
          <p className="label">Already working</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {working.map((r) => (
              <li key={r.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink" />
                {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
