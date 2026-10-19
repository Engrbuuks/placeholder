"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getPack, isMarketCode, packs } from "@/lib/config";
import { matchNiche } from "@/lib/niche";
import { normaliseGoogleProfile, normaliseInstagram, normaliseWebsite } from "@/lib/urls";
import { runAudit } from "@/lib/audit/run";
import { draftBrandBrain } from "@/lib/audit/draft";
import {
  getBrandBrain,
  getWorkspace,
  recordUsage,
  saveAudit,
  saveDraftBrandBrain,
  saveOwnerBrandBrain,
  updateWorkspace,
} from "@/lib/workspaces";
import { brandBrainFromForm } from "@/lib/brandBrainForm";
import { aiEnabled } from "@/lib/ai";
import { ensureWebchat } from "@/lib/webchat";

export type StepState = { error?: string; notice?: string; fields?: Record<string, string> };

// The workspace always comes from the session, never from the form.

export async function chooseMarket(_prev: StepState, formData: FormData): Promise<StepState> {
  const { workspaceId } = await requireSession();
  const country = formData.get("country");
  if (!isMarketCode(country)) return { error: "Choose where your business trades." };
  await updateWorkspace(workspaceId, { country, onboardingStep: "niche" });
  redirect("/onboarding");
}

export async function chooseNiche(_prev: StepState, formData: FormData): Promise<StepState> {
  const { workspaceId } = await requireSession();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) redirect("/login");

  const picked = String(formData.get("pack") ?? "");
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  let packId: string;
  if (picked && packs.some((p) => p.id === picked)) {
    packId = picked;
  } else if (description.length >= 3) {
    packId = await matchNiche(description, workspace.country);
    if (aiEnabled()) await recordUsage(workspaceId, "ai_classify", 1);
  } else {
    return { error: "Choose the closest match, or describe your business in a few words.", fields: { description } };
  }
  await updateWorkspace(workspaceId, { nichePack: packId, onboardingStep: "presence" });
  redirect("/onboarding");
}

export async function savePresence(_prev: StepState, formData: FormData): Promise<StepState> {
  const { workspaceId } = await requireSession();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) redirect("/login");

  const fields = {
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    instagram: String(formData.get("instagram") ?? ""),
    googleProfileUrl: String(formData.get("googleProfileUrl") ?? ""),
  };
  const website = normaliseWebsite(fields.websiteUrl);
  if (!website.ok) return { error: website.error, fields };
  const instagram = normaliseInstagram(fields.instagram);
  if (!instagram.ok) return { error: instagram.error, fields };
  const google = normaliseGoogleProfile(fields.googleProfileUrl);
  if (!google.ok) return { error: google.error, fields };

  const presence = { websiteUrl: website.value, instagramUrl: instagram.value, googleProfileUrl: google.value };
  await updateWorkspace(workspaceId, presence);

  const { outcome, pageText } = await runAudit(presence);
  await saveAudit(workspaceId, outcome, website.value);

  const pack = getPack(workspace.nichePack);
  const current = await getBrandBrain(workspaceId);
  const draft = await draftBrandBrain({ facts: outcome.facts, pageText, existing: current.data, pack });
  if (draft.source === "ai") await recordUsage(workspaceId, "ai_draft", 1);
  await saveDraftBrandBrain(workspaceId, draft.brain, draft.source);

  await updateWorkspace(workspaceId, { onboardingStep: "brain" });
  redirect("/onboarding");
}

export async function goBack(formData: FormData) {
  const { workspaceId } = await requireSession();
  const to = String(formData.get("to") ?? "");
  if (to === "market" || to === "niche" || to === "presence") {
    await updateWorkspace(workspaceId, { onboardingStep: to });
  }
  redirect("/onboarding");
}

export async function saveBrain(_prev: StepState, formData: FormData): Promise<StepState> {
  const { workspaceId } = await requireSession();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) redirect("/login");

  const pack = getPack(workspace.nichePack);
  const intent = String(formData.get("intent") ?? "save");
  const result = brandBrainFromForm(formData, pack);
  if (!result.ok) return { error: result.error };

  if (intent === "confirm" && result.missing.length > 0) {
    await saveOwnerBrandBrain(workspaceId, result.brain, false);
    return { error: `Add these before confirming: ${result.missing.join(", ")}.` };
  }

  await saveOwnerBrandBrain(workspaceId, result.brain, intent === "confirm");
  revalidatePath("/dashboard");

  if (workspace.onboardingStep !== "done" && intent === "confirm") {
    await updateWorkspace(workspaceId, { onboardingStep: "done" });
    await ensureWebchat(workspaceId);
    redirect("/dashboard");
  }
  if (workspace.onboardingStep === "done") redirect(`/brain?saved=${intent === "confirm" ? "confirmed" : "draft"}`);
  return { notice: "Draft saved. Confirm when everything is right." };
}
