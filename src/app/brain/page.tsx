import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack } from "@/lib/config";
import { getBrandBrain, getWorkspace } from "@/lib/workspaces";
import { brainFormValues } from "@/lib/brainView";
import { AppHeader } from "@/components/AppHeader";
import { BrainForm } from "@/components/BrainForm";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Brand brain" };

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep !== "done") redirect("/onboarding");

  const { saved } = await searchParams;
  const brain = await getBrandBrain(session.workspaceId);
  const pack = getPack(workspace.nichePack);

  return (
    <>
      <AppHeader businessName={workspace.name} active="brain" />
      <main className="mx-auto max-w-[760px] px-4 pb-20 pt-12 sm:px-6">
        <p className="label">Brand brain</p>
        <h1 className="mt-3 text-[clamp(2.1rem,3.8vw,3rem)]">What your assistant knows.</h1>
        <p className="mt-4 max-w-[60ch] text-ink-soft">
          Everything your assistant is allowed to say about {workspace.name}. If it is not written here, the assistant hands the
          conversation to you.
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
        <div className="mt-10">
          <BrainForm values={brainFormValues(brain.data)} intake={pack.intake} tones={appConfig.tones} confirmLabel="Save and confirm" />
        </div>
      </main>
    </>
  );
}
