import type { Metadata } from "next";
import Link from "next/link";
import { loadAppPage } from "@/lib/shell";
import { formatMoney } from "@/lib/config";
import { change, formatDuration, resultsFor, type Results } from "@/lib/results";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

const ranges = [7, 30, 90] as const;

function Card({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const pct = change(now, before);
  if (pct === null) return <span className="font-mono text-xs text-ink-soft">new this period</span>;
  const tone = pct > 0 ? "text-ink" : pct < 0 ? "text-accent-deep" : "text-ink-soft";
  return (
    <span className={`font-mono text-xs ${tone}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct)}% <span className="text-ink-soft">vs previous</span>
    </span>
  );
}

/** Leads per day as bars, drawn to one scale, with the busiest day and the first and last dates labelled. */
function DailyBars({ daily }: { daily: Results["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.leads));
  const w = 640;
  const h = 150;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const bw = (w - pad.l - pad.r) / Math.max(1, daily.length);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={`Leads per day, up to ${max} in a day`}>
      {[0, max].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-[var(--color-ink-soft)] font-mono text-[10px]">
            {v}
          </text>
        </g>
      ))}
      {daily.map((d, i) => (
        <rect
          key={d.day}
          x={pad.l + i * bw + bw * 0.18}
          y={y(d.leads)}
          width={Math.max(1, bw * 0.64)}
          height={Math.max(0, h - pad.b - y(d.leads))}
          rx={Math.min(3, bw * 0.2)}
          fill={d.revenue > 0 ? "var(--color-accent)" : "var(--color-ink)"}
        >
          <title>{`${fmt(d.day)}: ${d.leads} lead${d.leads === 1 ? "" : "s"}${d.revenue > 0 ? ", with a sale" : ""}`}</title>
        </rect>
      ))}
      {daily.length > 0 && (
        <>
          <text x={pad.l} y={h - 6} className="fill-[var(--color-ink-soft)] font-mono text-[10px]">
            {fmt(daily[0].day)}
          </text>
          <text x={w - pad.r} y={h - 6} textAnchor="end" className="fill-[var(--color-ink-soft)] font-mono text-[10px]">
            {fmt(daily[daily.length - 1].day)}
          </text>
        </>
      )}
    </svg>
  );
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { session, workspace, shell } = await loadAppPage();
  const asked = Number((await searchParams).days);
  const days = (ranges as readonly number[]).includes(asked) ? asked : 30;
  const r = await resultsFor(session.workspaceId, days, workspace.timeZone);
  const money = (v: number) => formatMoney(v, workspace.country);
  const cur = r.current;
  const funnel = [
    { label: "Leads", value: cur.leads, help: "New enquiries on any channel" },
    { label: "Engaged", value: cur.engaged, help: "Replied at least once" },
    { label: "Booked", value: cur.booked, help: "Marked booked" },
    { label: "Won", value: cur.won, help: "Marked won" },
  ];
  const top = Math.max(1, ...funnel.map((f) => f.value));
  const empty = cur.leads === 0 && cur.won === 0 && r.campaigns.sent === 0;

  return (
    <AppShell {...shell} active="results" title="Results" subtitle="What your marketing brought in, and where it came from">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <nav aria-label="Period" className="flex flex-wrap items-center gap-2">
          {ranges.map((d) => (
            <Link
              key={d}
              href={`/results?days=${d}`}
              aria-current={d === days ? "true" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm ${d === days ? "bg-ink text-white" : "border border-line bg-surface hover:border-ink/30"}`}
            >
              Last {d} days
            </Link>
          ))}
        </nav>

        {empty && (
          <p className="flex gap-3 rounded-2xl bg-accent-wash px-5 py-4 text-[0.9375rem]">
            <Icon name="info" className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            No leads in this period yet. Once enquiries arrive on your web chat, WhatsApp, texts, calls or lead form, this page shows where they came from and what they turned into. Mark sales as won with their value to see revenue.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: "Leads", value: String(cur.leads), now: cur.leads, before: r.previous.leads },
            { label: "Booked", value: String(cur.booked), now: cur.booked, before: r.previous.booked },
            { label: "Won", value: String(cur.won), now: cur.won, before: r.previous.won },
            { label: "Revenue", value: money(cur.revenue), now: cur.revenue, before: r.previous.revenue },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm text-ink-soft">{s.label}</p>
              <p className="mt-1 truncate text-[1.9rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{s.value}</p>
              <p className="mt-3">
                <Delta now={s.now} before={s.before} />
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
          <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
            <p className="text-sm text-white/60">Speed to lead</p>
            <p className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.04em]">{formatDuration(r.medianFirstReplySeconds)}</p>
            <p className="mt-2 text-[0.8125rem] text-white/60">Typical time from a customer&apos;s first message to your first reply.</p>
            <p className="mt-4 font-mono text-xs text-accent">{Math.round(r.answeredWithinMinute * 100)}% answered within a minute</p>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm text-ink-soft">Answered while you were closed</p>
            <p className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.04em]">{r.afterHours}</p>
            <p className="mt-2 text-[0.8125rem] text-ink-soft">Leads whose first message came in your quiet hours, answered by the assistant at once.</p>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm text-ink-soft">Brought back by campaigns</p>
            <p className="mt-1 truncate text-[1.9rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{money(r.campaigns.revenue)}</p>
            <p className="mt-2 text-[0.8125rem] text-ink-soft">
              {r.campaigns.sent} messages sent, {r.campaigns.replied} replies, {r.campaigns.won} sales.{" "}
              <Link href="/campaigns" className="underline underline-offset-4">
                Campaigns
              </Link>
            </p>
          </section>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card title="Funnel">
            <ol className="space-y-3">
              {funnel.map((f, i) => (
                <li key={f.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">{f.label}</span> <span className="text-ink-soft">{f.help}</span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {f.value}
                      {i > 0 && funnel[i - 1].value > 0 && <span className="text-ink-soft"> / {Math.round((f.value / funnel[i - 1].value) * 100)}%</span>}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-mist">
                    <div className={`h-2.5 rounded-full ${i === funnel.length - 1 ? "bg-accent" : "bg-ink"}`} style={{ width: `${(f.value / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 font-mono text-[0.6875rem] text-ink-soft">Each percentage is of the step before. Booked and won count by the day you marked them.</p>
          </Card>
          <Card title="Leads per day" action={<span className="font-mono text-xs text-ink-soft">orange: a sale that day</span>}>
            <DailyBars daily={r.daily} />
          </Card>
        </div>

        <Card title="Where your customers come from">
          {r.sources.length === 0 ? (
            <p className="text-[0.9375rem] text-ink-soft">No leads yet in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[0.6875rem] uppercase tracking-[0.04em] text-ink-soft">
                    <th className="py-2 pr-3 font-normal">Source</th>
                    <th className="py-2 pr-3 text-right font-normal">Leads</th>
                    <th className="py-2 pr-3 text-right font-normal">Booked</th>
                    <th className="py-2 pr-3 text-right font-normal">Won</th>
                    <th className="py-2 pr-3 text-right font-normal">Revenue</th>
                    <th className="py-2 text-right font-normal">Per lead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {r.sources.map((s) => (
                    <tr key={s.label}>
                      <td className="py-2.5 pr-3 font-medium">{s.label}</td>
                      <td className="py-2.5 pr-3 text-right">{s.leads}</td>
                      <td className="py-2.5 pr-3 text-right">{s.booked}</td>
                      <td className="py-2.5 pr-3 text-right">{s.won}</td>
                      <td className="py-2.5 pr-3 text-right">{money(s.revenue)}</td>
                      <td className="py-2.5 text-right text-ink-soft">{money(s.leads ? s.revenue / s.leads : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 font-mono text-[0.6875rem] text-ink-soft">
            Sources come from the page and link a visitor arrived on. Add utm_source and utm_campaign to the links in your ads and posts to see each one here.
          </p>
        </Card>

        <Card title="Reviews" action={<Link href="/automations#reviews" className="text-sm underline underline-offset-4">Settings</Link>}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: "Asked", value: r.reviews.requested },
              { label: "Rated", value: r.reviews.rated },
              { label: "Average", value: r.reviews.average ?? "None yet" },
              { label: "Sent your link", value: r.reviews.happy },
              { label: "Opened the link", value: r.reviews.clicks },
            ].map((x) => (
              <div key={x.label}>
                <dt className="text-sm text-ink-soft">{x.label}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{x.value}</dd>
              </div>
            ))}
          </dl>
          {r.reviews.unhappy > 0 && (
            <p className="mt-4 rounded-xl bg-accent-wash px-4 py-3 text-sm">
              {r.reviews.unhappy} unhappy rating{r.reviews.unhappy === 1 ? " was" : "s were"} kept private and passed to you instead of going public.
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
