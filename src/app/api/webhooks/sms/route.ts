// Twilio calls this for every text a customer sends to a business's number.
// It finds the business by the number texted, checks Twilio's signature with that business's auth token,
// answers Twilio at once with an empty reply, then handles the message. Retries are ignored by message id.
import { after } from "next/server";
import { globalQuery, withTenant } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { automationConfig } from "@/lib/config";
import { parseInboundSms, verifyTwilioSignature } from "@/lib/channels/sms";
import { handleInbound } from "@/lib/pipeline/engine";
import { runDueJobs } from "@/lib/pipeline/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const emptyReply = () => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "content-type": "text/xml" } });
const refuse = (status: number, message: string) => new Response(message, { status });

/** The address Twilio signed: the public one when the app runs behind a proxy. */
function publicUrl(request: Request): string {
  const url = new URL(request.url);
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return base ? `${base}${url.pathname}${url.search}` : url.toString();
}

export async function POST(request: Request) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const sms = parseInboundSms(params);
  if (!sms) return refuse(400, "Not a Twilio message");

  const { rows } = await globalQuery<{ id: string | null }>("select workspace_for_sms($1) as id", [sms.to]);
  const workspaceId = rows[0]?.id;
  if (!workspaceId) return refuse(404, "Number not connected");

  const connection = await withTenant(workspaceId, async (c) => {
    const r = await c.query<{ secret_enc: string | null; settings: { accountSid?: string } }>(
      "select secret_enc, settings from channel_connections where workspace_id = $1 and channel = 'sms'",
      [workspaceId],
    );
    return r.rows[0] ?? null;
  });
  let authToken = "";
  try {
    authToken = connection?.secret_enc ? decryptSecret(connection.secret_enc) : "";
  } catch {
    authToken = "";
  }
  if (!verifyTwilioSignature(publicUrl(request), params, request.headers.get("x-twilio-signature"), authToken)) {
    return refuse(401, "Invalid signature");
  }
  if (connection?.settings?.accountSid && sms.accountSid !== connection.settings.accountSid) return refuse(401, "Wrong account");

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
  return emptyReply();
}
