// Twilio calls this when the forwarded call ends. Answered: nothing to do. Not answered: text the caller back.
import { withTenant } from "@/lib/db";
import { authenticateTwilio, say, twiml } from "@/lib/channels/twilioWebhook";
import { loadContext } from "@/lib/pipeline/context";
import { handleMissedCall } from "@/lib/pipeline/missedCalls";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const missed = new Set(["no-answer", "busy", "failed", "canceled"]);

export async function POST(request: Request) {
  const raw = await request.text();
  const auth = await authenticateTwilio(request, raw);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  const status = auth.params.DialCallStatus ?? "";
  if (!missed.has(status)) return twiml();
  const ctx = await withTenant(auth.workspaceId, (c) => loadContext(c, auth.workspaceId));
  if (!ctx?.settings.missedCallEnabled) return twiml();
  const result = await handleMissedCall(auth.workspaceId, auth.params.From ?? "", auth.params.CallSid ?? "");
  // The caller may still be on the line when the forward goes unanswered.
  return twiml(result.texted ? say(ctx.locale.assistant.missedCallVoice, ctx.locale.voiceLanguage) : "");
}
