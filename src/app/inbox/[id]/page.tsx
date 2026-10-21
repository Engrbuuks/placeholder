import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/db";
import { loadAppPage } from "@/lib/shell";
import { getPack, markets } from "@/lib/config";
import { inboxCounts, leadDetail, listLeads } from "@/lib/inbox";
import { leadLabel } from "@/lib/pipeline/context";
import { markRead } from "@/lib/pipeline/owner";
import { approveAction, discardAction, pauseAction } from "@/app/actions/pipeline";
import { AppShell } from "@/components/AppShell";
import { ChannelChip, InboxList, StagePill, parseFilter } from "@/components/inbox";
import { DeleteCustomerForm, ReplyBox, ScrollToEnd, StageForm } from "@/components/InboxForms";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

const authorLabel = { customer: "", assistant: "Assistant", automation: "Follow up", owner: "You" } as const;

const statusText: Record<string, string> = {
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not sent",
  skipped: "Not sent",
  pending_approval: "Waiting for your approval",
  discarded: "Discarded",
};

function localInput(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { session, workspace, shell } = await loadAppPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const filter = parseFilter((await searchParams).filter);
  await markRead(session.workspaceId, id);
  const [detail, rows, counts] = await Promise.all([
    leadDetail(session.workspaceId, id),
    listLeads(session.workspaceId, filter),
    inboxCounts(session.workspaceId),
  ]);
  if (!detail) notFound();
  const { lead, messages, upcoming, activity } = detail;
  const pack = getPack(workspace.nichePack, workspace.country);
  const timeZone = workspace.timeZone;
  const when = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const channelLabel = lead.channel === "whatsapp" ? "WhatsApp" : lead.channel === "sms" ? "SMS" : "web chat";
  const defaultBooking = localInput(lead.booked_for ?? new Date(Date.now() + 24 * 3600_000), timeZone);
  const seqName = (sid: string) => pack.sequences.find((s) => s.id === sid)?.name ?? "Follow up";

  return (
    <AppShell {...shell} active="inbox" title="Inbox" subtitle="Every conversation, with the assistant's replies and what happens next">
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_300px]">
        <div className="hidden lg:block lg:h-[calc(100vh-9.5rem)]">
          <InboxList rows={rows} filter={filter} counts={counts} selected={lead.id} />
        </div>

        {/* Conversation */}
        <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface lg:h-[calc(100vh-9.5rem)]">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
            <div className="min-w-0">
              <Link href={`/inbox?filter=${filter}`} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft lg:hidden">
                <Icon name="chevron" className="h-4 w-4 rotate-180" /> All conversations
              </Link>
              <h2 className="truncate text-[1.25rem] tracking-[-0.02em]">{leadLabel(lead)}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <StagePill stage={lead.stage} />
                <ChannelChip channel={lead.channel} />
                {lead.phone && <span className="font-mono text-xs text-ink-soft">{lead.phone}</span>}
                {lead.email && <span className="font-mono text-xs text-ink-soft">{lead.email}</span>}
              </div>
            </div>
            <form action={pauseAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="paused" value={String(!(lead.automation_paused || lead.stage === "handoff"))} />
              {lead.automation_paused || lead.stage === "handoff" ? (
                <SubmitButton tone="quiet" pending="Handing back">
                  <Icon name="play" className="h-4 w-4" /> Hand back to assistant
                </SubmitButton>
              ) : (
                <SubmitButton tone="quiet" pending="Pausing">
                  <Icon name="pause" className="h-4 w-4" /> Pause assistant
                </SubmitButton>
              )}
            </form>
          </header>

          {lead.stage === "handoff" && lead.handoff_reason && (
            <p className="flex gap-3 border-b border-line bg-accent-wash px-5 py-3 text-[0.9375rem]">
              <Icon name="alert" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent-deep" />
              <span>
                <span className="font-medium">This conversation needs you.</span> {lead.handoff_reason}.
              </span>
            </p>
          )}

          <ol id="thread" className="flex-1 space-y-4 overflow-y-auto bg-paper px-4 py-5 sm:px-6">
            {messages.map((m) => {
              const mine = m.direction === "out";
              const problem = m.status === "failed" || m.status === "skipped";
              return (
                <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <p
                    className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-snug ${
                      !mine
                        ? "rounded-bl-md border border-line bg-surface"
                        : m.status === "pending_approval"
                          ? "rounded-br-md border-2 border-dashed border-accent bg-surface"
                          : m.status === "discarded"
                            ? "rounded-br-md bg-mist text-ink-soft line-through"
                            : m.author === "owner"
                              ? "rounded-br-md bg-accent text-white"
                              : "rounded-br-md bg-ink text-white"
                    }`}
                  >
                    {m.body}
                  </p>
                  <p className={`mt-1 font-mono text-[0.6875rem] ${problem ? "text-accent-deep" : "text-ink-soft"}`}>
                    {[authorLabel[m.author], when.format(m.created_at), mine ? statusText[m.status] : null].filter(Boolean).join(" / ")}
                  </p>
                  {problem && m.status_detail && <p className="mt-0.5 max-w-[85%] text-right text-[0.8125rem] text-accent-deep">{m.status_detail}</p>}
                  {m.status === "pending_approval" && (
                    <div className="mt-2 flex gap-2">
                      <form action={approveAction}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="messageId" value={m.id} />
                        <SubmitButton tone="primary" pending="Sending">
                          Approve and send
                        </SubmitButton>
                      </form>
                      <form action={discardAction}>
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="messageId" value={m.id} />
                        <SubmitButton tone="quiet" pending="Discarding">
                          Discard
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <ScrollToEnd targetId="thread" signal={messages.length} />
          <div className="border-t border-line p-4">
            <ReplyBox leadId={lead.id} channelLabel={channelLabel} />
          </div>
        </section>

        {/* Lead details and what happens next */}
        <aside className="space-y-4 xl:h-[calc(100vh-9.5rem)] xl:overflow-y-auto">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-[1.0625rem] tracking-[-0.02em]">What happened</h3>
            <div className="mt-4">
              <StageForm leadId={lead.id} defaultBookedFor={defaultBooking} />
            </div>
            {lead.booked_for && (
              <p className="mt-3 font-mono text-xs text-ink-soft">Booked for {when.format(lead.booked_for)}</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-[1.0625rem] tracking-[-0.02em]">Answers so far</h3>
            {lead.qualifier_answers.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">The assistant has not asked any qualifying questions yet.</p>
            ) : (
              <dl className="mt-3 space-y-3">
                {lead.qualifier_answers.map((x, i) => (
                  <div key={i}>
                    <dt className="text-[0.8125rem] text-ink-soft">{x.q}</dt>
                    <dd className="text-sm font-medium">{x.a}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 font-mono text-[0.6875rem] text-ink-soft">
              {lead.qualifier_answers.length} of {pack.qualifiers.length} answered
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-[1.0625rem] tracking-[-0.02em]">Coming up</h3>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">Nothing scheduled for this conversation.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((j) => (
                  <li key={j.id} className="flex gap-3">
                    <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                    <span>
                      <span className="block text-sm">
                        {seqName(j.payload.sequenceId)}, step {j.payload.stepIndex + 1}
                      </span>
                      <span className="block font-mono text-[0.6875rem] text-ink-soft">{when.format(j.run_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-[1.0625rem] tracking-[-0.02em]">Privacy</h3>
            {lead.opted_out_at && (
              <p className="mt-2 rounded-lg bg-accent-wash px-3 py-2 text-[0.8125rem]">
                Opted out on {when.format(lead.opted_out_at)}. Nothing automatic is sent to them until they reply START.
              </p>
            )}
            <p className="mt-2 text-[0.8125rem] text-ink-soft">If this customer asks what you hold about them, or asks you to delete it.</p>
            <a
              href={`/api/customers/${lead.id}/export`}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm hover:border-ink/30"
            >
              <Icon name="download" className="h-4 w-4" /> Download their data
            </a>
            <div className="mt-4 border-t border-line pt-4">
              <DeleteCustomerForm leadId={lead.id} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-[1.0625rem] tracking-[-0.02em]">Activity</h3>
            <ol className="mt-3 space-y-2.5">
              {activity.map((a) => (
                <li key={a.id} className="text-[0.8125rem]">
                  <span className="block">{a.summary}</span>
                  <span className="font-mono text-[0.6875rem] text-ink-soft">{when.format(a.created_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
