import type { CheckResult } from "@/lib/audit/score";

/** The leak bar: one segment per check, sized by how much it matters. Failed checks are the leaks. */
export function LeakBar({ results, label }: { results: CheckResult[]; label: string }) {
  const total = results.reduce((s, r) => s + r.weight, 0) || 1;
  const ordered = [...results].sort((a, b) => Number(b.passed) - Number(a.passed));
  return (
    <div>
      <div className="leak-bar flex h-5 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label={label}>
        {ordered.map((r) => (
          <span
            key={r.id}
            title={`${r.label}: ${r.passed ? "working" : "leaking"}`}
            className={r.passed ? "bg-signal" : "bg-leak"}
            style={{ width: `${(r.weight / total) * 100}%` }}
          />
        ))}
      </div>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="font-display text-7xl font-extrabold leading-none">{score}</p>
        <p className="pb-2 text-lg text-ink-soft">
          out of 100.{" "}
          {leaks === 0 ? "Nothing is leaking." : `${leaks} ${leaks === 1 ? "place is" : "places are"} leaking customers.`}
        </p>
      </div>
      <LeakBar results={results} label={`Score ${score} out of 100 with ${leaks} leaks`} />
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
    <div className="space-y-8">
      {shown.length > 0 && (
        <ol className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="rounded-2xl border-l-[6px] border-leak bg-surface px-5 py-4">
              <p className="font-bold">{r.label}</p>
              <p className="text-ink-soft">{r.message}</p>
              <p className="mt-2">
                <span className="font-bold">Fix: </span>
                {r.fix}
              </p>
            </li>
          ))}
        </ol>
      )}
      {!limit && skipped.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-line px-5 py-4">
          <p className="font-bold">
            {skipped.length} website checks are waiting
          </p>
          <p className="text-ink-soft">
            {hasWebsite
              ? "They run once your website loads, covering things like your WhatsApp link, mobile layout and speed."
              : "Add your website and we check things like your WhatsApp link, mobile layout and speed."}
          </p>
        </div>
      )}
      {!limit && working.length > 0 && (
        <div>
          <h3 className="text-lg font-bold">Already working</h3>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {working.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-signal" />
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
