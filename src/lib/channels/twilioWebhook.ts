// Shared by every Twilio webhook: find the business by the number that was texted or called,
// then check Twilio's signature with that business's own auth token before trusting anything in the request.
import { globalQuery, withTenant } from "../db";
import { decryptSecret } from "../crypto";
import { verifyTwilioSignature } from "./sms";

/** The address Twilio signed: the public one when the app runs behind a proxy. */
export function publicWebhookUrl(request: Request): string {
  const url = new URL(request.url);
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return base ? `${base}${url.pathname}${url.search}` : url.toString();
}

export type TwilioAuth = { ok: true; workspaceId: string; params: Record<string, string> } | { ok: false; status: number; message: string };

export async function authenticateTwilio(request: Request, raw: string): Promise<TwilioAuth> {
  const params = Object.fromEntries(new URLSearchParams(raw));
  const to = params.To ?? params.Called ?? "";
  if (!/^\+[1-9]\d{7,14}$/.test(to)) return { ok: false, status: 400, message: "Not a Twilio request" };
  const { rows } = await globalQuery<{ id: string | null }>("select workspace_for_sms($1) as id", [to]);
  const workspaceId = rows[0]?.id;
  if (!workspaceId) return { ok: false, status: 404, message: "Number not connected" };
  const connection = await withTenant(workspaceId, async (c) => {
    const r = await c.query<{ secret_enc: string | null; settings: { accountSid?: string } }>(
      "select secret_enc, settings from channel_connections where workspace_id = $1 and channel = 'sms'",
      [workspaceId],
    );
    return r.rows[0] ?? null;
  });
  let token = "";
  try {
    token = connection?.secret_enc ? decryptSecret(connection.secret_enc) : "";
  } catch {
    token = "";
  }
  if (!verifyTwilioSignature(publicWebhookUrl(request), params, request.headers.get("x-twilio-signature"), token)) {
    return { ok: false, status: 401, message: "Invalid signature" };
  }
  if (connection?.settings?.accountSid && params.AccountSid !== connection.settings.accountSid) return { ok: false, status: 401, message: "Wrong account" };
  return { ok: true, workspaceId, params };
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch]!);

export function twiml(inner = ""): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "content-type": "text/xml" } });
}
export const say = (text: string, language: string) => `<Say language="${escapeXml(language)}">${escapeXml(text)}</Say>`;
export const dial = (number: string, action: string) =>
  `<Dial timeout="20" answerOnBridge="true" action="${escapeXml(action)}" method="POST">${escapeXml(number)}</Dial>`;
