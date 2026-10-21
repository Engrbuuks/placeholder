// Twilio calls this for every text a customer sends to a business's number.
// It finds the business by the number texted, checks Twilio's signature with that business's auth token,
// answers Twilio at once with an empty reply, then handles the message. Retries are ignored by message id.
import { after } from "next/server";
import { withTenant } from "@/lib/db";
import { automationConfig } from "@/lib/config";
import { parseInboundSms } from "@/lib/channels/sms";
import { authenticateTwilio, twiml } from "@/lib/channels/twilioWebhook";
import { handleInbound } from "@/lib/pipeline/engine";
import { runDueJobs } from "@/lib/pipeline/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  const auth = await authenticateTwilio(request, raw);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  const sms = parseInboundSms(auth.params);
  if (!sms) return new Response("Not a Twilio message", { status: 400 });
  const { workspaceId } = auth;

  after(async () => {
    try {
      await withTenant(workspaceId, (c) =>
        c.query("update channel_connections set last_event_at = now(), last_error = null where workspace_id = $1 and channel = 'sms'", [workspaceId]),
      );
      await handleInbound({ workspaceId, channel: "sms", externalId: sms.from, text: sms.body, externalMessageId: sms.messageSid });
    } catch (error) {
      console.error("Text message could not be handled", error instanceof Error ? error.message : error);
    }
    await runDueJobs({ budgetMs: automationConfig.worker.inlineBudgetMs });
  });
  return twiml();
}
