import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack, markets } from "@/lib/config";
import { areaScores, bandFor, brainCompleteness, checkRows, counts, type CheckRow } from "@/lib/health";
import { auditHistory, getBrandBrain, getWorkspace, latestAudits } from "@/lib/workspaces";
import { rerunAudit } from "@/app/actions/dashboard";
import { AppShell } from "@/components/AppShell";
import { ScoreChart } from "@/components/ScoreChart";
import { Donut, Gauge, HistoryStrip, Sparkline, statusColour, statusLabel } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };
export const maxDuration = 60;

const copy = appConfig.dashboard;

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

function CardTitle({ children, hint, action }: { children: React.ReactNode; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
        {children}
        {hint && (
          <span title={hint} className="text-ink-soft">
            <Icon name="info" className="h-4 w-4" />
            <span className="sr-only">{hint}</span>
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="rounded-full border border-line px-3.5 py-1.5 text-sm hover:border-ink/40">
      {label}
    </Link>
  );
}

function Delta({ value, unit, better }: { value: number | null; unit: string; better: "up" | "down" }) {
  if (value === null) return <p className="font-mono text-xs text-ink-soft">First check</p>;
  if (value === 0) return <p className="font-mono text-xs text-ink-soft">No change</p>;
  const good = better === "up" ? value > 0 : value < 0;
  return (
    <p className="inline-flex items-center gap-1.5 font-mono text-xs text-ink">
      <svg aria-hidden viewBox="0 0 10 10" className={`h-2.5 w-2.5 ${value < 0 ? "rotate-180" : ""}`} fill={good ? "#111" : "#ff5a14"}>
        <path d="M5 1l4 7H1z" />
      </svg>
      {Math.abs(value)} {unit}
      <span className="sr-only">{good ? ", an improvement" : ", worse than before"}</span>
    </p>
  );
}

function Stat({
  label,
  value,
  icon,
  iconStyle,
  delta,
  chart,
}: {
  label: string;
  value: string;
  icon: string;
  iconStyle: string;
  delta: React.ReactNode;
  chart: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-soft">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconStyle}`}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.04em]">{value}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        {delta}
        {chart}
      </div>
    </div>
  );
}

const impactStyle: Record<string, string> = {
  High: "bg-ink text-white",
  Medium: "bg-mist text-ink",
  Low: "border border-line text-ink-soft",
};

function ImpactPill({ impact }: { impact: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.04em] ${impactStyle[impact] ?? impactStyle.Low}`}>
      {impact}
    </span>
  );
}

function StatusPill({ status }: { status: CheckRow["status"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-[0.8125rem]">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: statusColour[status] }} />
      {statusLabel[status]}
    </span>
  );
}

const changeText: Record<CheckRow["change"], string> = {
  fixed: "Fixed",
  new: "New leak",
  same: "No change",
  first: "First check",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep !== "done") redirect("/onboarding");

  const { range: rangeParam } = await searchParams;
  const range = copy.ranges.find((r) => r.id === rangeParam) ?? copy.ranges.find((r) => r.id === copy.defaultRange) ?? copy.ranges[0];

  const [inRange, recentDesc, brain] = await Promise.all([
    auditHistory(session.workspaceId, range.days),
    latestAudits(session.workspaceId, copy.historyLength),
    getBrandBrain(session.workspaceId),
  ]);
  const recent = [...recentDesc].reverse();
  const latest = recent[recent.length - 1];
  const previous = recent.length > 1 ? recent[recent.length - 2] : null;
  const pack = getPack(workspace.nichePack, workspace.country);
  const timeZone = workspace.timeZone;
  const shell = {
    businessName: workspace.name,
    country: workspace.country,
    fullName: session.fullName,
    email: session.email,
    lastChecked: latest?.createdAt ?? null,
  };

  if (!latest) {
    return (
      <AppShell workspaceId={session.workspaceId} active="dashboard" title={copy.title} subtitle={copy.subtitle} {...shell}>
        <Card className="max-w-xl">
          <p className="font-medium">No check has been run yet.</p>
          <p className="mt-1 text-ink-soft">Run one now to see where your business is losing enquiries.</p>
          <form action={rerunAudit} className="mt-5">
            <SubmitButton pending="Checking">Run my first check</SubmitButton>
          </form>
        </Card>
      </AppShell>
    );
  }

  const now = counts(latest);
  const before = previous ? counts(previous) : null;
  const judged = now.working + now.leaking;
  const areas = areaScores(latest);
  const rows = checkRows(recent);
  const fixes = rows.filter((r) => r.status === "leaking").slice(0, 3);
  const brainFill = brainCompleteness(brain.data, pack);
  const band = bandFor(latest.score);
  const firstInRange = inRange[0];
  const rangeChange = firstInRange && inRange.length > 1 ? latest.score - firstInRange.score : null;
  const pct = (n: number) => (now.total ? Math.round((n / now.total) * 100) : 0);

  return (
    <AppShell workspaceId={session.workspaceId} active="dashboard" title={copy.title} subtitle={copy.subtitle} {...shell}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {/* Score over time */}
        <Card>
          <CardTitle
            hint="Your overall score from every check, weighted by how many enquiries each problem is likely to cost you."
            action={
              <nav aria-label="Time range" className="flex rounded-full border border-line p-1">
                {copy.ranges.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard?range=${r.id}`}
                    scroll={false}
                    aria-current={r.id === range.id ? "true" : undefined}
                    className={`rounded-full px-3 py-1 font-mono text-xs ${r.id === range.id ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
                  >
                    {r.label}
                  </Link>
                ))}
              </nav>
            }
          >
            {copy.chartTitle}
          </CardTitle>

          <div className="mt-5 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 lg:block">
              <div>
                <p className="text-sm text-ink-soft">{copy.chartLabel}</p>
                <p className="mt-1 text-[2.75rem] font-semibold leading-none tracking-[-0.05em]">{band}</p>
              </div>
              <div className="lg:mt-5">
                <p className="text-[1.6rem] font-semibold leading-none tracking-[-0.04em]">
                  {latest.score}
                  <span className="text-base font-normal text-ink-soft">/100</span>
                </p>
                <div className="mt-2">
                  <Delta value={rangeChange} unit={`in ${range.label === "All" ? "all checks" : `the last ${range.label}`}`} better="up" />
                </div>
              </div>
              {latest.facts.fetched === false && (
                <p className="max-w-[24ch] text-[0.8125rem] text-ink-soft lg:mt-6">
                  <span className="font-medium text-ink">Website not read.</span> {String((latest.facts as { error?: string }).error ?? "")}
                </p>
              )}
            </div>
            <div className="min-w-0">
              {inRange.length > 0 ? (
                <ScoreChart
                  points={inRange.map((a) => ({ t: a.createdAt.getTime(), score: a.score }))}
                  bands={copy.bands}
                  label={`${copy.chartTitle} over ${range.label}`}
                  timeZone={timeZone}
                />
              ) : (
                <p className="grid h-48 place-items-center rounded-xl border border-dashed border-line text-sm text-ink-soft">
                  No checks in this range. Choose a longer range or check again.
                </p>
              )}
              {inRange.length === 1 && (
                <p className="mt-2 font-mono text-xs text-ink-soft">One check so far. Check again after making a fix to see your trend.</p>
              )}
            </div>
          </div>
        </Card>

        {/* Headline numbers */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Readiness score"
            value={String(latest.score)}
            icon="gauge"
            iconStyle="bg-ink text-white"
            delta={<Delta value={previous ? latest.score - previous.score : null} unit="since last" better="up" />}
            chart={<Sparkline values={recent.map((a) => a.score)} label="Readiness score" />}
          />
          <Stat
            label="Leaks open"
            value={String(now.leaking)}
            icon="alert"
            iconStyle="bg-accent text-white"
            delta={<Delta value={before ? now.leaking - before.leaking : null} unit="since last" better="down" />}
            chart={<Sparkline values={recent.map((a) => counts(a).leaking)} label="Leaks open" />}
          />
          <Stat
            label="Checks passing"
            value={`${now.working}/${judged || now.total}`}
            icon="check"
            iconStyle="bg-accent-wash text-accent-deep"
            delta={<Delta value={before ? now.working - before.working : null} unit="since last" better="up" />}
            chart={<Sparkline values={recent.map((a) => counts(a).working)} tone="ink" label="Checks passing" />}
          />
          <Stat
            label="Brand brain"
            value={`${brainFill.percent}%`}
            icon="brain"
            iconStyle="bg-mist text-ink"
            delta={
              <p className="font-mono text-xs text-ink-soft">
                {brain.status === "confirmed" ? "Confirmed" : "Not confirmed"}, {brainFill.filled} of {brainFill.total}
              </p>
            }
            chart={
              <span className="block h-2 w-24 overflow-hidden rounded-full bg-mist" role="img" aria-label={`${brainFill.percent}% complete`}>
                <span className="block h-full rounded-full bg-ink" style={{ width: `${brainFill.percent}%` }} />
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Readiness by area */}
          <Card>
            <CardTitle hint="How much of each area is working, weighted by how much each check matters.">Readiness overview</CardTitle>
            <div className="mt-4 flex flex-col items-center">
              <Gauge score={latest.score} label={`Readiness ${latest.score} out of 100, ${band}`} />
              <p className="-mt-2 text-[2rem] font-semibold leading-none tracking-[-0.04em]">
                {latest.score}
                <span className="text-base font-normal text-ink-soft">/100</span>
              </p>
              <p className="mt-1 font-medium text-accent-deep">{band}</p>
            </div>
            <ul className="mt-6 space-y-4">
              {areas.map((a) => (
                <li key={a.id} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="row-span-2 grid h-9 w-9 place-items-center rounded-xl bg-mist text-ink">
                    <Icon name={{ Reach: "globe", Response: "chat", Trust: "check", Technical: "layers" }[a.id] ?? "layers"} className="h-[18px] w-[18px]" />
                  </span>
                  <p className="text-sm">
                    {a.label}
                    <span className="ml-2 text-ink-soft">{a.detail}</span>
                  </p>
                  <p className="font-mono text-xs text-ink">{a.score === null ? "Waiting" : `${a.score}/100`}</p>
                  <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-mist">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${a.score ?? 0}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
            {/* Breakdown */}
            <Card>
              <CardTitle hint="Every check from your latest audit. Website checks wait until your site can be read.">Check breakdown</CardTitle>
              <div className="mt-4 flex flex-wrap items-center gap-8">
                <Donut
                  segments={(["working", "leaking", "waiting"] as const).map((s) => ({ status: s, value: now[s] }))}
                  label={`${now.working} working, ${now.leaking} leaking, ${now.waiting} waiting`}
                  centre={String(now.total)}
                />
                <ul className="min-w-[12rem] flex-1 space-y-3">
                  {(["working", "leaking", "waiting"] as const).map((s) => (
                    <li key={s} className="flex items-center gap-3">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: statusColour[s] }} />
                      <span className="flex-1 text-[0.9375rem]">{statusLabel[s]}</span>
                      <span className="font-mono text-sm">{now[s]}</span>
                      <span className="w-12 text-right font-mono text-sm text-ink-soft">{pct(now[s])}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            {/* What to fix next */}
            <Card>
              <CardTitle hint="Your biggest leaks, ordered by how many enquiries each one is likely to cost you." action={<ViewAll href="/audit" />}>
                Fix next
              </CardTitle>
              {fixes.length === 0 ? (
                <p className="mt-4 text-[0.9375rem] text-ink-soft">Nothing is leaking. Check again after any change to your website.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {fixes.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-wash text-accent-deep">
                        <Icon name="alert" className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="truncate text-[0.8125rem] text-ink-soft">{f.fix}</p>
                      </div>
                      <ImpactPill impact={f.impact} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {/* Every check */}
        <Card className="px-0 sm:px-0">
          <div className="px-5 sm:px-6">
            <CardTitle action={<ViewAll href="/audit" label="See fixes" />}>All checks</CardTitle>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-y border-line font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-soft">
                  <th scope="col" className="py-3 pl-5 pr-2 font-normal sm:pl-6">#</th>
                  <th scope="col" className="px-3 py-3 font-normal">Check</th>
                  <th scope="col" className="px-3 py-3 font-normal">Impact</th>
                  <th scope="col" className="px-3 py-3 font-normal">Status</th>
                  <th scope="col" className="px-3 py-3 font-normal">Since last check</th>
                  <th scope="col" className="py-3 pl-3 pr-5 font-normal sm:pr-6">{recent.length > 1 ? `Last ${Math.min(recent.length, copy.historyLength)} checks` : "History"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={r.id} className="hover:bg-paper">
                    <td className="py-3 pl-5 pr-2 font-mono text-sm text-ink-soft sm:pl-6">{i + 1}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm font-medium">{r.label}</p>
                      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.04em] text-ink-soft">{r.area}</p>
                    </td>
                    <td className="px-3 py-3">
                      <ImpactPill impact={r.impact} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-sm ${r.change === "fixed" || r.change === "new" ? "text-ink" : "text-ink-soft"}`}>
                        {r.change === "fixed" && <Icon name="check" className="h-4 w-4" />}
                        {r.change === "new" && <Icon name="alert" className="h-4 w-4 text-accent" />}
                        {changeText[r.change]}
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-5 sm:pr-6">
                      <HistoryStrip history={r.history} name={r.label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
