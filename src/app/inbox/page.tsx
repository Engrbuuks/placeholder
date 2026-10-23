import type { Metadata } from "next";
import { loadAppPage } from "@/lib/shell";
import { inboxCounts, listLeads } from "@/lib/inbox";
import { AppShell } from "@/components/AppShell";
import { InboxList, parseFilter } from "@/components/inbox";
import { EmptyInboxArt } from "@/components/illustrations";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string; deleted?: string }> }) {
  const { session, shell } = await loadAppPage();
  const params = await searchParams;
  const filter = parseFilter(params.filter);
  const [rows, counts] = await Promise.all([listLeads(session.workspaceId, filter), inboxCounts(session.workspaceId)]);

  return (
    <AppShell {...shell} active="inbox" title="Inbox" subtitle="Every conversation, with the assistant's replies and what happens next">
      {params.deleted && (
        <div className="mb-4">
          <Notice>The customer&apos;s data was deleted. A note that it was done, without their details, is in your activity log.</Notice>
        </div>
      )}
      <div className="grid gap-4 lg:h-[calc(100vh-9.5rem)] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <InboxList rows={rows} filter={filter} counts={counts} />
        <div className="hidden place-items-center rounded-2xl border border-dashed border-line lg:grid">
          <div className="max-w-xs text-center">
            <EmptyInboxArt className="mx-auto h-auto w-44" />
            <p className="mt-4 font-medium">Choose a conversation</p>
            <p className="mt-1 text-sm text-ink-soft">See the full thread, approve follow ups, reply, or mark a booking.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
