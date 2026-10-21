import type { Metadata } from "next";
import { loadAppPage } from "@/lib/shell";
import { automationConfig, formatMoney, localeFor } from "@/lib/config";
import { campaignSkips, campaignStats, segments } from "@/lib/pipeline/campaigns";
import { stopCampaignAction } from "@/app/actions/campaigns";
import { AppShell } from "@/components/AppShell";
import { CampaignForm } from "@/components/CampaignForm";
import { SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = { sending: "Sending", sent: "Sent", cancelled: "Stopped", draft: "Draft" };

export default async function CampaignsPage() {
  const { session, workspace, shell } = await loadAppPage();
  const list = await campaignStats(session.workspaceId);
  const skips = await Promise.all(list.map((c) => campaignSkips(session.workspaceId, c.id)));
  const money = (v: number) => formatMoney(v, workspace.country);
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: workspace.timeZone, day: "numeric", month: "short", year: "numeric" });
  const segmentLabel = Object.fromEntries(segments.map((s) => [s.id, s.label]));

  return (
    <AppShell {...shell} active="campaigns" title="Campaigns" subtitle="Bring past leads and customers back, and see what each message earned">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">New campaign</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            One short message to a group of people who already know you. It goes out by WhatsApp or text on the channel they used.
          </p>
          <div className="mt-5">
            <CampaignForm segments={segments} ideas={localeFor(workspace.language).campaignIdeas} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">What your campaigns brought back</h2>
          <p className="mt-1 text-sm text-ink-soft">Bookings and sales count when they happen within {automationConfig.campaigns.attributionDays} days of the message.</p>
          {list.length === 0 ? (
            <p className="mt-6 text-[0.9375rem] text-ink-soft">No campaigns yet. Start with the people who went quiet: they already asked about you once.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {list.map((c, i) => (
                <li key={c.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.04em] text-ink-soft">
                        {segmentLabel[c.segment]} / {when.format(c.created_at)} / {statusLabel[c.status] ?? c.status}
                      </p>
                    </div>
                    {c.status === "sending" && (
                      <form action={stopCampaignAction}>
                        <input type="hidden" name="campaignId" value={c.id} />
                        <SubmitButton tone="quiet" pending="Stopping">
                          Stop
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {[
                      { label: "Sent", value: c.sent + (c.queued ? ` (+${c.queued})` : "") },
                      { label: "Skipped", value: c.skipped + c.failed },
                      { label: "Replied", value: c.replied },
                      { label: "Booked", value: c.booked },
                      { label: "Won", value: c.won },
                      { label: "Revenue", value: money(c.revenue) },
                    ].map((x) => (
                      <div key={x.label}>
                        <dt className="text-[0.75rem] text-ink-soft">{x.label}</dt>
                        <dd className="text-[1.0625rem] font-semibold tabular-nums">{x.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.sent > 0 && (
                    <p className="mt-2 font-mono text-[0.6875rem] text-ink-soft">
                      Reply rate {Math.round((c.replied / c.sent) * 100)}%
                    </p>
                  )}
                  {skips[i].length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-ink-soft">Why some were not sent</summary>
                      <ul className="mt-2 space-y-1 text-ink-soft">
                        {skips[i].map((s) => (
                          <li key={s.reason}>
                            {s.count}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-[0.8125rem] text-ink-soft">{c.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
