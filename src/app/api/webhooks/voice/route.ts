// Twilio calls this when someone rings a business's Twilio number. The call is forwarded to the business's own
// phone; when that is not answered, the status webhook texts the caller back.
import { withTenant } from "@/lib/db";
import { authenticateTwilio, dial, publicWebhookUrl, twiml } from "@/lib/channels/twilioWebhook";
import { loadContext } from "@/lib/pipeline/context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const auth = await authenticateTwilio(request, raw);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  const ctx = await withTenant(auth.workspaceId, (c) => loadContext(c, auth.workspaceId));
  const forward = ctx?.settings.forwardTo;
  if (!forward) return twiml('<Reject reason="busy"/>');
  const statusUrl = publicWebhookUrl(request).replace(/\/api\/webhooks\/voice.*$/, "/api/webhooks/voice/status");
  return twiml(dial(forward, statusUrl));
}
