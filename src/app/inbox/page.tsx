import type { Metadata } from "next";
import { loadAppPage } from "@/lib/shell";
import { inboxCounts, listLeads } from "@/lib/inbox";
import { AppShell } from "@/components/AppShell";
import { InboxList, parseFilter } from "@/components/inbox";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { session, shell } = await loadAppPage();
  const filter = parseFilter((await searchParams).filter);
  const [rows, counts] = await Promise.all([listLeads(session.workspaceId, filter), inboxCounts(session.workspaceId)]);

  return (
    <AppShell {...shell} active="inbox" title="Inbox" subtitle="Every conversation, with the assistant's replies and what happens next">
      <div className="grid gap-4 lg:h-[calc(100vh-9.5rem)] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <InboxList rows={rows} filter={filter} counts={counts} />
        <div className="hidden place-items-center rounded-2xl border border-dashed border-line lg:grid">
          <div className="max-w-xs text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-mist">
              <Icon name="inbox" />
            </span>
            <p className="mt-4 font-medium">Choose a conversation</p>
            <p className="mt-1 text-sm text-ink-soft">See the full thread, approve follow ups, reply, or mark a booking.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
