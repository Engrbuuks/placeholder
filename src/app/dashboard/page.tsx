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

  return (
    <>
      <AppHeader businessName={workspace.name} active="dashboard" />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0">
          <h1 className="text-4xl font-extrabold">
            {audit ? `Here is where ${workspace.name} is losing enquiries, ${firstName}.` : `Welcome, ${firstName}.`}
          </h1>

          {audit ? (
            <div className="mt-8 space-y-8">
              <div className="rounded-3xl bg-surface p-6 sm:p-8">
                <ScoreHeadline score={audit.score} results={audit.results} siteRead={audit.facts.fetched} />
                <p className="mt-4 text-sm text-ink-soft">
                  Checked {dateFormat.format(audit.createdAt)}
                  {audit.targetUrl ? ` on ${new URL(audit.targetUrl).hostname}` : ""}
                  {change !== null && change !== 0 ? `. ${change > 0 ? "Up" : "Down"} ${Math.abs(change)} since the last check.` : "."}
                </p>
                {audit.facts.error && <p className="mt-2 font-bold text-leak">{audit.facts.error}</p>}
                <form action={rerunAudit} className="mt-5">
                  <SubmitButton tone="quiet" pending="Checking again">
                    Check again
                  </SubmitButton>
                </form>
              </div>
              <div>
                <h2 className="text-2xl font-bold">Fix these first</h2>
                <p className="mt-1 text-ink-soft">Ordered by how many enquiries each one is likely to cost you.</p>
                <div className="mt-5">
                  <LeakList results={audit.results} siteRead={audit.facts.fetched} hasWebsite={Boolean(audit.targetUrl)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-3xl bg-surface p-6">
              <p>No check has been run yet.</p>
              <form action={rerunAudit} className="mt-4">
                <SubmitButton pending="Checking">Run my first check</SubmitButton>
              </form>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl bg-surface p-6">
            <h2 className="text-xl font-bold">Brand brain</h2>
            <p className="mt-2">
              {brain.status === "confirmed"
                ? "Confirmed. Your assistant will answer from these facts."
                : "Not confirmed yet. Your assistant cannot go live until you confirm it."}
            </p>
            {missing.length > 0 && <p className="mt-2 text-ink-soft">Still missing: {missing.join(", ")}.</p>}
            <Link href="/brain" className="mt-4 inline-block font-bold underline underline-offset-4">
              {brain.status === "confirmed" ? "Edit details" : "Finish your details"}
            </Link>
          </div>

          <div className="rounded-3xl bg-surface p-6">
            <h2 className="text-xl font-bold">Your setup</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-sm text-ink-soft">Business type</dt>
                <dd className="font-bold">{pack.name}</dd>
              </div>
              {market && (
                <div>
                  <dt className="text-sm text-ink-soft">Market</dt>
                  <dd className="font-bold">
                    {market.name}, prices in {market.currencySymbol}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-ink-soft">Goal we optimise for</dt>
                <dd className="font-bold">{pack.conversionAction}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border-2 border-dashed border-line p-6">
            <h2 className="text-xl font-bold">Coming next</h2>
            <ul className="mt-3 space-y-3">
              {appConfig.comingNext.map((item) => (
                <li key={item.id}>
                  <p className="font-bold">{item.label}</p>
                  <p className="text-sm text-ink-soft">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </>
  );
}
