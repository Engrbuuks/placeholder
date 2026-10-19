import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { markets } from "@/lib/config";
import { getWorkspace, latestAudits } from "@/lib/workspaces";
import { AppShell } from "@/components/AppShell";
import { LeakList, ScoreHeadline } from "@/components/AuditReport";

export const metadata: Metadata = { title: "Audit" };
export const maxDuration = 60;

const dateFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function AuditPage() {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep !== "done") redirect("/onboarding");

  const [audit] = await latestAudits(session.workspaceId, 1);
  const timeZone = workspace.country ? markets[workspace.country].timeZone : "UTC";

  return (
    <AppShell
      workspaceId={session.workspaceId}
      active="audit"
      title="Audit"
      subtitle="Every place an enquiry can slip away, with the fix for each"
      businessName={workspace.name}
      country={workspace.country}
      fullName={session.fullName}
      email={session.email}
      lastChecked={audit?.createdAt ?? null}
    >
      {audit ? (
        <div className="grid max-w-[980px] gap-6">
          <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <p className="label">Latest check</p>
            <p className="mt-1 font-mono text-xs text-ink-soft">
              {dateFormat(timeZone).format(audit.createdAt)}
              {audit.targetUrl ? ` / ${new URL(audit.targetUrl).hostname}` : ""}
            </p>
            <div className="mt-6">
              <ScoreHeadline score={audit.score} results={audit.results} siteRead={audit.facts.fetched} />
            </div>
            {audit.facts.error && (
              <p className="mt-6 flex gap-3 rounded-xl bg-accent-wash px-4 py-3 text-[0.9375rem]">
                <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                {audit.facts.error}
              </p>
            )}
          </section>
          <section>
            <h2 className="text-[1.4rem] tracking-[-0.03em]">Fix these first</h2>
            <p className="mt-1 text-[0.9375rem] text-ink-soft">Ordered by how many enquiries each one is likely to cost you.</p>
            <div className="mt-5">
              <LeakList results={audit.results} siteRead={audit.facts.fetched} hasWebsite={Boolean(audit.targetUrl)} />
            </div>
          </section>
        </div>
      ) : (
        <p className="text-ink-soft">No check has been run yet. Use the refresh button at the top to run one.</p>
      )}
    </AppShell>
  );
}
