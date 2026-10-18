import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { appConfig, getPack } from "@/lib/config";
import { getBrandBrain, getWorkspace } from "@/lib/workspaces";
import { brainFormValues } from "@/lib/brainView";
import { AppHeader } from "@/components/AppHeader";
import { BrainForm } from "@/components/BrainForm";

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
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-4xl font-extrabold">Brand brain</h1>
        <p className="mt-3 text-lg text-ink-soft">
          Everything your assistant is allowed to say about {workspace.name}. If it is not written here, the assistant hands the
          conversation to you.
        </p>
        {saved === "confirmed" && (
          <p role="status" className="mt-6 rounded-xl border-l-4 border-signal bg-signal-wash px-4 py-3">
            Saved and confirmed.
          </p>
        )}
        {saved === "draft" && (
          <p role="status" className="mt-6 rounded-xl border-l-4 border-sun bg-surface px-4 py-3">
            Draft saved. Confirm it when everything is right, so your assistant can use these details.
          </p>
        )}
        <div className="mt-8">
          <BrainForm values={brainFormValues(brain.data)} intake={pack.intake} tones={appConfig.tones} confirmLabel="Save and confirm" />
        </div>
      </main>
    </>
  );
}
