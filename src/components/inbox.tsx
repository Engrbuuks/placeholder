import Link from "next/link";
import { automationConfig } from "@/lib/config";
import { relativeTime } from "@/lib/health";
import { leadLabel } from "@/lib/pipeline/context";
import type { InboxFilter, InboxRow } from "@/lib/inbox";
import { Icon } from "./Icon";

export const stageLabel = Object.fromEntries(automationConfig.stages.map((s) => [s.id, s.label])) as Record<string, string>;

const stageStyle: Record<string, string> = {
  handoff: "bg-accent text-white",
  qualified: "bg-ink text-white",
  booked: "bg-accent-wash text-ink",
  won: "bg-mist text-ink",
  lost: "border border-line text-ink-soft",
};

export function StagePill({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.04em] ${stageStyle[stage] ?? "border border-line text-ink"}`}>
      {stageLabel[stage] ?? stage}
    </span>
  );
}

export function ChannelChip({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem] uppercase tracking-[0.04em] text-ink-soft">
      <Icon name={channel === "whatsapp" ? "chat" : channel === "sms" ? "phone" : channel === "form" ? "file" : "globe"} className="h-3.5 w-3.5" />
      {channel === "whatsapp" ? "WhatsApp" : channel === "sms" ? "SMS" : channel === "form" ? "Lead form" : "Web chat"}
    </span>
  );
}

const filters: { id: InboxFilter; label: string }[] = [
  { id: "needs_you", label: "Needs you" },
  { id: "open", label: "Open" },
  { id: "booked", label: "Booked" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

export function InboxList({
  rows,
  filter,
  counts,
  selected,
}: {
  rows: InboxRow[];
  filter: InboxFilter;
  counts: Record<InboxFilter, number>;
  selected?: string;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <nav aria-label="Filter conversations" className="flex gap-1 overflow-x-auto border-b border-line p-2">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={`/inbox?filter=${f.id}`}
            aria-current={f.id === filter ? "true" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${f.id === filter ? "bg-ink text-white" : "text-ink hover:bg-mist"}`}
          >
            {f.label}
            <span className={`font-mono text-[0.6875rem] ${f.id === filter ? "text-white/70" : "text-ink-soft"}`}>{counts[f.id]}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <div className="p-6 text-[0.9375rem] text-ink-soft">
          {filter === "needs_you" ? "Nothing needs you right now. The assistant is handling every conversation." : "No conversations here yet."}
          <p className="mt-2">
            New conversations arrive from your <Link href="/channels" className="underline underline-offset-4">web chat and WhatsApp</Link>.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/inbox/${r.id}?filter=${filter}`}
                aria-current={r.id === selected ? "page" : undefined}
                className={`block px-4 py-3.5 ${r.id === selected ? "bg-accent-wash" : "hover:bg-paper"}`}
              >
                <div className="flex items-center gap-2">
                  {r.unread > 0 && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  <p className={`min-w-0 flex-1 truncate text-sm ${r.unread > 0 ? "font-semibold" : "font-medium"}`}>{leadLabel(r)}</p>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-ink-soft">{r.last_at ? relativeTime(r.last_at) : ""}</span>
                </div>
                <p className="mt-0.5 truncate text-[0.8125rem] text-ink-soft">
                  {r.last_author === "owner" ? "You: " : r.last_author === "assistant" ? "Assistant: " : r.last_author === "automation" ? "Follow up: " : ""}
                  {r.last_body ?? "No messages yet"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StagePill stage={r.stage} />
                  <ChannelChip channel={r.channel} />
                  {r.pending > 0 && <span className="font-mono text-[0.6875rem] text-accent-deep">{r.pending} to approve</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function parseFilter(value: string | undefined): InboxFilter {
  return (["all", "needs_you", "open", "booked", "closed"] as const).find((f) => f === value) ?? "needs_you";
}
