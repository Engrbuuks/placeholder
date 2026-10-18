"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { runAudit } from "@/lib/audit/run";
import { getWorkspace, saveAudit } from "@/lib/workspaces";

export async function rerunAudit() {
  const { workspaceId } = await requireSession();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return;
  const presence = {
    websiteUrl: workspace.websiteUrl,
    instagramUrl: workspace.instagramUrl,
    googleProfileUrl: workspace.googleProfileUrl,
  };
  const { outcome } = await runAudit(presence);
  await saveAudit(workspaceId, outcome, workspace.websiteUrl);
  revalidatePath("/dashboard");
}
