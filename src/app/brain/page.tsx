import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack } from "@/lib/config";
import { getBrandBrain, getWorkspace, latestAudits } from "@/lib/workspaces";
import { brainFormValues } from "@/lib/brainView";
import { AppShell } from "@/components/AppShell";
import { BrainForm } from "@/components/BrainForm";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Brand brain" };

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep !== "done") redirect("/onboarding");

  const { saved } = await searchParams;
  const [brain, [audit]] = await Promise.all([getBrandBrain(session.workspaceId), latestAudits(session.workspaceId, 1)]);
  const pack = getPack(workspace.nichePack);

  return (
    <AppShell
      workspaceId={session.workspaceId}
      active="brain"
      title="Brand brain"
      subtitle="Everything your assistant is allowed to say"
      businessName={workspace.name}
      country={workspace.country}
      fullName={session.fullName}
      email={session.email}
      lastChecked={audit?.createdAt ?? null}
    >
      <div className="max-w-[760px]">
        <p className="max-w-[60ch] text-ink-soft">
          If it is not written here, your assistant hands the conversation to you instead of guessing.
        </p>
        {saved === "confirmed" && (
          <div className="mt-6">
            <Notice>Saved and confirmed.</Notice>
          </div>
        )}
        {saved === "draft" && (
          <div className="mt-6">
            <Notice>Draft saved. Confirm it when everything is right, so your assistant can use these details.</Notice>
          </div>
        )}
        <div className="mt-8">
          <BrainForm values={brainFormValues(brain.data)} intake={pack.intake} tones={appConfig.tones} confirmLabel="Save and confirm" />
        </div>
      </div>
    </AppShell>
  );
}
