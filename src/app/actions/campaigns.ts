"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { cancelCampaign, previewCampaign, startCampaign, type Preview } from "@/lib/pipeline/campaigns";

export type CampaignState = { error?: string; notice?: string; preview?: Preview; fingerprint?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Give the campaign a short name, so you can find its results later.").max(80),
  segment: z.enum(["lost", "quiet", "customers", "booked_no_show"], { message: "Choose who should get it." }),
  quietDays: z.coerce.number().int().min(1, "Quiet for at least 1 day.").max(3650),
  message: z
    .string()
    .trim()
    .min(10, "Write the message you want to send.")
    .max(600, "Keep it under 600 characters. Short messages get more replies."),
});

function read(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    segment: formData.get("segment"),
    quietDays: formData.get("quietDays") || 30,
    message: formData.get("message"),
  });
}

/** The same inputs always give the same fingerprint, so "Send" only works for the audience the owner just checked. */
const fingerprintOf = (d: z.infer<typeof schema>) => JSON.stringify([d.segment, d.quietDays, d.message]);

export async function campaignAction(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const { workspaceId, role } = await requireSession();
  const parsed = read(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const intent = formData.get("intent");
  const preview = await previewCampaign(workspaceId, d);
  if (intent !== "send") return { preview, fingerprint: fingerprintOf(d) };

  if (role === "agent") return { error: "Only the owner or a manager can send a campaign.", preview };
  if (formData.get("fingerprint") !== fingerprintOf(d)) {
    return { error: "You changed the campaign after checking it. Check who gets it again before sending.", preview, fingerprint: fingerprintOf(d) };
  }
  if (preview.reachable === 0) return { error: "Nobody in this group can be messaged right now. The reasons are listed below.", preview };
  const started = await startCampaign(workspaceId, d);
  revalidatePath("/campaigns");
  return { notice: `Sending to ${started.queued} ${started.queued === 1 ? "person" : "people"}. ${started.skipped} skipped. Results appear below as replies come in.` };
}

export async function stopCampaignAction(formData: FormData) {
  const { workspaceId } = await requireSession();
  await cancelCampaign(workspaceId, String(formData.get("campaignId") ?? ""));
  revalidatePath("/campaigns");
}
