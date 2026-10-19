import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack, markets } from "@/lib/config";
import { missingEssentials } from "@/lib/brandBrain";
import { getBrandBrain, getWorkspace, latestAudits } from "@/lib/workspaces";
import { rerunAudit } from "@/app/actions/dashboard";
import { AppHeader } from "@/components/AppHeader";
import { LeakList, ScoreHeadline } from "@/components/AuditReport";
import { SubmitButton } from "@/components/ui";
import { Arrow } from "@/components/Wordmark";

export const metadata: Metadata = { title: "Overview" };
export const maxDuration = 60;

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export default async function DashboardPage() {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep !== "done") redirect("/onboarding");

  const [audits, brain] = await Promise.all([latestAudits(session.workspaceId, 2), getBrandBrain(session.workspaceId)]);
  const [audit, previous] = audits;
  const pack = getPack(workspace.nichePack);
  const market = workspace.country ? markets[workspace.country] : null;
  const missing = missingEssentials(brain.data);
  const firstName = session.fullName.split(" ")[0];
  const change = audit && previous ? audit.score - previous.score : null;
  const confirmed = brain.status === "confirmed";

  return (
    <>
      <AppHeader businessName={workspace.name} active="dashboard" />
      <main className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0">
          <p className="label">Overview</p>
          <h1 className="mt-3 max-w-[20ch] text-[clamp(2.1rem,3.8vw,3rem)]">
            {audit ? `Here is where ${workspace.name} is losing enquiries, ${firstName}.` : `Welcome, ${firstName}.`}
          </h1>

          {audit ? (
            <div className="mt-10 space-y-12">
              <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
                <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="label">Latest check</p>
                    <p className="mt-1 font-mono text-xs text-ink-soft">
                      {dateFormat.format(audit.createdAt)}
                      {audit.targetUrl ? ` / ${new URL(audit.targetUrl).hostname}` : ""}
                      {change !== null && change !== 0 ? ` / ${change > 0 ? "up" : "down"} ${Math.abs(change)} since last check` : ""}
                    </p>
                  </div>
                  <form action={rerunAudit}>
                    <SubmitButton tone="quiet" pending="Checking again">
                      Check again
                    </SubmitButton>
                  </form>
                </div>
                <ScoreHeadline score={audit.score} results={audit.results} siteRead={audit.facts.fetched} />
                {audit.facts.error && (
                  <p className="mt-6 flex gap-3 rounded-xl bg-accent-wash px-4 py-3 text-[0.9375rem]">
                    <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                    {audit.facts.error}
                  </p>
                )}
              </div>
              <div>
                <p className="label">Fix these first</p>
                <h2 className="mt-2 text-[1.75rem] tracking-[-0.03em]">Ordered by how many enquiries each one costs you.</h2>
                <div className="mt-6">
                  <LeakList results={audit.results} siteRead={audit.facts.fetched} hasWebsite={Boolean(audit.targetUrl)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-10 rounded-3xl border border-line bg-surface p-8">
              <p>No check has been run yet.</p>
              <form action={rerunAudit} className="mt-5">
                <SubmitButton pending="Checking">Run my first check</SubmitButton>
              </form>
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:pt-[7.5rem]">
          <div className="rounded-2xl bg-ink p-6 text-white">
            <div className="flex items-start justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-white/60">Brand brain</p>
              <span aria-hidden className={`h-2 w-2 rounded-full ${confirmed ? "bg-white" : "bg-accent"}`} />
            </div>
            <p className="mt-6 text-[1.6rem] font-semibold leading-tight tracking-[-0.03em]">{confirmed ? "Confirmed" : "Not confirmed"}</p>
            <p className="mt-2 text-[0.9375rem] text-white/70">
              {confirmed ? "Your assistant will answer from these facts." : "Your assistant cannot go live until you confirm it."}
            </p>
            {missing.length > 0 && <p className="mt-2 text-[0.9375rem] text-white/70">Still missing: {missing.join(", ")}.</p>}
            <Link
              href="/brain"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-white/85"
            >
              {confirmed ? "Edit details" : "Finish your details"}
              <Arrow />
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="label">Your setup</p>
            <dl className="mt-4 divide-y divide-line">
              <div className="pb-3">
                <dt className="font-mono text-xs text-ink-soft">Business type</dt>
                <dd className="mt-0.5 font-medium">{pack.name}</dd>
              </div>
              {market && (
                <div className="py-3">
                  <dt className="font-mono text-xs text-ink-soft">Market</dt>
                  <dd className="mt-0.5 font-medium">
                    {market.name}, prices in {market.currencySymbol}
                  </dd>
                </div>
              )}
              <div className="pt-3">
                <dt className="font-mono text-xs text-ink-soft">Goal we work towards</dt>
                <dd className="mt-0.5 font-medium">{pack.conversionAction}</dd>
              </div>
            </dl>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-accent p-6">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/25 blur-2xl" />
            <p className="label relative text-ink/75">Coming next</p>
            <ul className="relative mt-4 space-y-4">
              {appConfig.comingNext.map((item) => (
                <li key={item.id}>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-ink/75">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </>
  );
}
