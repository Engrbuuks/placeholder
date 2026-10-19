"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { automationConfig, markets } from "@/lib/config";
import { isUuid, withTenant } from "@/lib/db";
import { encryptSecret, encryptionReady, randomKey } from "@/lib/crypto";
import { zonedLocalToDate } from "@/lib/time";
import { getWorkspace } from "@/lib/workspaces";
import { approveMessage, discardMessage, markRead, ownerReply, setPaused, setStage } from "@/lib/pipeline/owner";
import { runDueJobs } from "@/lib/pipeline/worker";
import { logActivity } from "@/lib/activity";

export type ActionState = { error?: string; notice?: string };

// The workspace always comes from the session. Lead and message ids from the form are only ever
// used inside that workspace's tenant transaction, so another business's ids match nothing.

function leadId(formData: FormData): string {
  const id = String(formData.get("leadId") ?? "");
  if (!isUuid(id)) throw new Error("Conversation not found.");
  return id;
}

export async function replyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = await requireSession();
  try {
    const id = leadId(formData);
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return { error: "Write a message first." };
    const outcome = await ownerReply(workspaceId, id, text);
    revalidatePath(`/inbox/${id}`);
    if (outcome === "retrying") return { notice: "The channel did not respond, so we will keep trying to send it." };
    if (outcome === "skipped" || outcome === "failed") return { error: "The message was not sent. The reason is shown under it." };
    return { notice: "Sent." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The message was not sent." };
  }
}

export async function approveAction(formData: FormData) {
  const { workspaceId } = await requireSession();
  const id = String(formData.get("messageId") ?? "");
  if (isUuid(id)) await approveMessage(workspaceId, id);
  revalidatePath(`/inbox/${leadId(formData)}`);
}

export async function discardAction(formData: FormData) {
  const { workspaceId } = await requireSession();
  const id = String(formData.get("messageId") ?? "");
  if (isUuid(id)) await discardMessage(workspaceId, id);
  revalidatePath(`/inbox/${leadId(formData)}`);
}

const stages = ["booked", "won", "lost"] as const;

export async function stageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = await requireSession();
  try {
    const id = leadId(formData);
    const stage = String(formData.get("stage") ?? "");
    if (!stages.includes(stage as (typeof stages)[number])) return { error: "Choose what happened." };
    let bookedFor: Date | null = null;
    if (stage === "booked") {
      const workspace = await getWorkspace(workspaceId);
      const zone = workspace?.country ? markets[workspace.country].timeZone : "UTC";
      bookedFor = zonedLocalToDate(String(formData.get("bookedFor") ?? ""), zone);
      if (!bookedFor) return { error: "Choose the date and time of the booking." };
      if (bookedFor.getTime() < Date.now() - 60_000) return { error: "That time has already passed." };
    }
    const summary = await setStage(workspaceId, id, stage as (typeof stages)[number], bookedFor);
    revalidatePath(`/inbox/${id}`);
    return { notice: summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That did not save." };
  }
}

export async function pauseAction(formData: FormData) {
  const { workspaceId } = await requireSession();
  const id = leadId(formData);
  await setPaused(workspaceId, id, formData.get("paused") === "true");
  revalidatePath(`/inbox/${id}`);
}

export async function readAction(id: string) {
  const { workspaceId } = await requireSession();
  if (isUuid(id)) await markRead(workspaceId, id);
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  approvalMode: z.enum(["auto", "approve"]),
  alertEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid alert email, or leave it empty.").max(254)]),
  weeklyCheck: z.boolean(),
});

export async function saveAutomationSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = await requireSession();
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    approvalMode: formData.get("approvalMode"),
    alertEmail: String(formData.get("alertEmail") ?? ""),
    weeklyCheck: formData.get("weeklyCheck") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  await withTenant(workspaceId, async (c) => {
    await c.query(
      `insert into automation_settings (workspace_id, enabled, approval_mode, alert_email, weekly_check, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (workspace_id) do update set enabled = $2, approval_mode = $3, alert_email = $4, weekly_check = $5, updated_at = now()`,
      [workspaceId, s.enabled, s.approvalMode, s.alertEmail || null, s.weeklyCheck],
    );
    await logActivity(c, workspaceId, {
      kind: "settings",
      summary: `Automations ${s.enabled ? "on" : "off"}; follow ups ${s.approvalMode === "approve" ? "wait for approval" : "send automatically"}; weekly check ${s.weeklyCheck ? "on" : "off"}`,
    });
  });
  revalidatePath("/automations");
  return { notice: "Saved." };
}

const whatsappSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{6,20}$/, "The phone number ID is the long number shown in Meta's API setup page."),
  token: z.string().trim().max(1000),
  templateName: z.union([z.literal(""), z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Template names use lowercase letters, numbers and underscores.")]),
  templateLanguage: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Use a language code such as en or en_GB.").default("en"),
});

export async function saveWhatsApp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = await requireSession();
  if (!encryptionReady()) return { error: "The server has no encryption key yet, so tokens cannot be stored safely. Set ENCRYPTION_KEY first." };
  const parsed = whatsappSchema.safeParse({
    phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
    token: String(formData.get("token") ?? ""),
    templateName: String(formData.get("templateName") ?? ""),
    templateLanguage: String(formData.get("templateLanguage") ?? "") || "en",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await withTenant(workspaceId, async (c) => {
      const existing = await c.query<{ secret_enc: string | null }>(
        "select secret_enc from channel_connections where workspace_id = $1 and channel = 'whatsapp'",
        [workspaceId],
      );
      // A blank token keeps the one already saved; the token itself is never shown again.
      const secret = d.token ? encryptSecret(d.token) : existing.rows[0]?.secret_enc ?? null;
      if (!secret) throw new Error("Paste the permanent access token from Meta.");
      await c.query(
        `insert into channel_connections (workspace_id, channel, external_account_id, secret_enc, settings, status)
         values ($1, 'whatsapp', $2, $3, $4, 'active')
         on conflict (workspace_id, channel) do update set external_account_id = $2, secret_enc = $3, settings = $4, status = 'active', last_error = null`,
        [workspaceId, d.phoneNumberId, secret, JSON.stringify({ templateName: d.templateName || undefined, templateLanguage: d.templateLanguage })],
      );
      await logActivity(c, workspaceId, { kind: "channel", summary: "WhatsApp connection saved" });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique/i.test(message)) return { error: "That phone number ID is already connected to another business." };
    return { error: message || "WhatsApp settings did not save." };
  }
  revalidatePath("/channels");
  return { notice: "WhatsApp connection saved." };
}

export async function disconnectWhatsApp() {
  const { workspaceId } = await requireSession();
  await withTenant(workspaceId, async (c) => {
    await c.query("delete from channel_connections where workspace_id = $1 and channel = 'whatsapp'", [workspaceId]);
    await logActivity(c, workspaceId, { kind: "channel", summary: "WhatsApp disconnected" });
  });
  revalidatePath("/channels");
}

export async function rotateWebchatKey() {
  const { workspaceId } = await requireSession();
  await withTenant(workspaceId, async (c) => {
    await c.query("update channel_connections set public_key = $2 where workspace_id = $1 and channel = 'webchat'", [workspaceId, randomKey(15)]);
    await logActivity(c, workspaceId, { kind: "channel", summary: "Web chat key changed; update the code on your website" });
  });
  revalidatePath("/channels");
}

export async function markAllNotificationsRead() {
  const { workspaceId } = await requireSession();
  await withTenant(workspaceId, (c) => c.query("update notifications set read_at = now() where read_at is null"));
  revalidatePath("/", "layout");
}

/** Runs due steps now, for owners who do not want to wait for the next scheduled tick. */
export async function runNowAction() {
  await requireSession();
  after(() => runDueJobs({ budgetMs: automationConfig.worker.inlineBudgetMs * 2 }));
  redirect("/automations?ran=1");
}
