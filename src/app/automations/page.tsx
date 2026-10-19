import type { Metadata } from "next";
import Link from "next/link";
import { loadAppPage } from "@/lib/shell";
import { automationConfig, getPack, markets } from "@/lib/config";
import { relativeTime } from "@/lib/health";
import { render } from "@/lib/templates";
import { automationOverview } from "@/lib/inbox";
import { runNowAction } from "@/app/actions/pipeline";
import { AppShell } from "@/components/AppShell";
import { AutomationSettingsForm } from "@/components/AutomationForms";
import { Icon } from "@/components/Icon";
import { Notice, SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

function hours(h: number) {
  if (h % 24 === 0) return `${h / 24} day${h === 24 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ ran?: string }> }) {
  const { session, workspace, shell } = await loadAppPage();
  const { ran } = await searchParams;
  const o = await automationOverview(session.workspaceId);
  const pack = getPack(workspace.nichePack);
  const timeZone = workspace.country ? markets[workspace.country].timeZone : "UTC";
  const when = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const q = automationConfig.quietHours;
  const stale = o.stats.due > 0 && (!o.lastTick || Date.now() - o.lastTick.getTime() > 15 * 60_000);

  const flow = [
    { icon: "chat", title: "Message arrives", body: "Web chat or WhatsApp" },
    { icon: "send", title: "Instant reply", body: "Answers only from your brand brain" },
    { icon: "check", title: `${pack.qualifiers.length} qualifying questions`, body: "Saved to the lead as they answer" },
    { icon: "bell", title: "You are alerted", body: `When they are ready: ${pack.conversionAction.toLowerCase()}` },
    { icon: "clock", title: "Follow ups and reminders", body: `Never between ${q.start}:00 and ${q.end}:00 local time` },
  ];

  return (
    <AppShell {...shell} active="automations" title="Automations" subtitle="What runs on its own, when, and everything it has done">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {ran && <Notice>Running any steps that are due now. Refresh in a moment to see them in the log.</Notice>}

        {!o.settings.enabled && (
          <p className="flex gap-3 rounded-2xl bg-accent-wash px-5 py-4">
            <Icon name="pause" className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            Automations are off. Customers still reach your inbox, but nothing replies or follows up on its own.
          </p>
        )}

        {/* How it runs */}
        <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">How your pipeline runs</h2>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs ${o.settings.enabled ? "bg-accent text-white" : "bg-white/10 text-white/70"}`}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${o.settings.enabled ? "bg-white" : "bg-white/50"}`} />
              {o.settings.enabled ? "Running" : "Off"}
            </span>
          </div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {flow.map((f, i) => (
              <li key={f.title} className="relative rounded-xl bg-white/5 p-4">
                <span className="font-mono text-[0.6875rem] text-white/50">{String(i + 1).padStart(2, "0")}</span>
                <Icon name={f.icon} className="mt-3 h-5 w-5 text-accent" />
                <p className="mt-2 text-sm font-medium">{f.title}</p>
                <p className="mt-0.5 text-[0.8125rem] text-white/60">{f.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[0.8125rem] text-white/60">
            Anyone who asks for a person, complains, or mentions an emergency is handed to you straight away, and the assistant goes quiet in that conversation.
          </p>
        </section>

        {/* Last 7 days */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: "Instant replies", value: o.stats.replies_7d, note: "last 7 days" },
            { label: "Follow ups sent", value: o.stats.followups_7d, note: "last 7 days" },
            { label: "Handed to you", value: o.stats.handoffs_7d, note: "last 7 days" },
            { label: "Steps scheduled", value: o.stats.scheduled, note: o.stats.failed_7d ? `${o.stats.failed_7d} failed this week` : "none failed this week" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm text-ink-soft">{s.label}</p>
              <p className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.04em]">{s.value}</p>
              <p className={`mt-3 font-mono text-xs ${s.note.includes("failed this week") && !s.note.startsWith("none") ? "text-accent-deep" : "text-ink-soft"}`}>{s.note}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title="Settings">
            <AutomationSettingsForm settings={o.settings} ownerEmail={session.email} />
            <p className="mt-4 font-mono text-xs text-ink-soft">
              {o.emailReady ? "Alert emails are sent through Resend." : "Email sending is not set up on the server yet, so alerts appear here and in the bell only."}
            </p>
          </Card>

          <Card
            title="Scheduler"
            action={
              <form action={runNowAction}>
                <SubmitButton tone="quiet" pending="Starting">
                  Run due steps now
                </SubmitButton>
              </form>
            }
          >
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-ink-soft">Last step ran</dt>
                <dd className="mt-0.5 font-medium">{o.lastTick ? relativeTime(o.lastTick) : "Not yet"}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-soft">Due right now</dt>
                <dd className="mt-0.5 font-medium">{o.stats.due}</dd>
              </div>
            </dl>
            {stale ? (
              <p className="mt-4 flex gap-3 rounded-xl bg-accent-wash px-4 py-3 text-[0.9375rem]">
                <Icon name="alert" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent-deep" />
                <span>
                  Steps are waiting but the minute trigger has not run recently. Check that the scheduler is set up as described in the README, or use Run due steps now.
                </span>
              </p>
            ) : (
              <p className="mt-4 text-[0.9375rem] text-ink-soft">
                Replies go out instantly. Timed steps run within a minute of being due once the minute trigger is set up, and at least daily without it.
              </p>
            )}
          </Card>
        </div>

        {/* Sequences */}
        <Card title={`Follow up sequences for ${pack.shortName.toLowerCase()}`}>
          <p className="-mt-2 mb-4 text-sm text-ink-soft">Shown for an example customer called Ada. Each message uses the customer&apos;s own first name.</p>
          <div className="grid gap-4 lg:grid-cols-3">
            {pack.sequences.map((seq) => (
              <div key={seq.id} className="rounded-xl border border-line p-4">
                <p className="font-medium">{seq.name}</p>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.04em] text-ink-soft">
                  {seq.trigger === "no_reply" ? "When a customer goes quiet" : seq.trigger === "booked" ? "When you mark a booking" : "When you mark a sale won"}
                </p>
                <ol className="mt-3 space-y-3 border-l border-line pl-4">
                  {seq.steps.map((step, i) => (
                    <li key={i} className="relative">
                      <span aria-hidden className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
                      <p className="font-mono text-xs text-ink">
                        {step.beforeHours ? `${hours(step.beforeHours)} before` : i === 0 ? `After ${hours(step.delayHours!)}` : `${hours(step.delayHours!)} later`}
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
                        {render(step.message, { firstName: "Ada", businessName: workspace.name, bookingTime: "Thursday 22 October at 11:00 am" })}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Card>

        {o.failed.length > 0 && (
          <Card title="Steps that failed">
            <ul className="divide-y divide-line">
              {o.failed.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <span>
                    <span className="block text-sm font-medium">
                      {f.kind === "deliver" ? "Message delivery" : f.kind === "email" ? "Alert email" : f.kind === "weekly_check" ? "Weekly check" : "Follow up"} after{" "}
                      {f.attempts} attempts
                    </span>
                    <span className="block text-[0.8125rem] text-accent-deep">{f.last_error}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-ink-soft">{when.format(f.finished_at)}</span>
                    {f.lead_id && (
                      <Link href={`/inbox/${f.lead_id}`} className="text-sm underline underline-offset-4">
                        Open conversation
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card title="Activity log">
            {o.activity.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-soft">Nothing has run yet. Send a message to your web chat from the Channels page to see the pipeline work.</p>
            ) : (
              <ol className="divide-y divide-line">
                {o.activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 py-2.5">
                    <span className="text-sm">
                      {a.lead_id ? (
                        <Link href={`/inbox/${a.lead_id}`} className="hover:underline hover:underline-offset-4">
                          {a.summary}
                        </Link>
                      ) : (
                        a.summary
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[0.6875rem] text-ink-soft">{when.format(a.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Alert emails">
            {o.emails.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-soft">No alerts sent yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {o.emails.map((e) => (
                  <li key={e.id} className="py-2.5">
                    <p className="text-sm">{e.subject}</p>
                    <p className="font-mono text-[0.6875rem] text-ink-soft">
                      {e.to_address} / {e.status === "logged" ? "logged, email not set up" : e.status}
                      {e.error ? ` / ${e.error}` : ""} / {when.format(e.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
