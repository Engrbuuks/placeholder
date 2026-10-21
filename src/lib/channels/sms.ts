// SMS through Twilio. Each business connects its own Twilio account and number.
// Inbound texts arrive as a signed form post; replies go out through Twilio's REST API.
// Twilio answers STOP, START and HELP itself (Advanced Opt Out, on by default); we record STOP and START too,
// so nothing automatic is sent to a customer who opted out, on any channel.
import { createHmac, timingSafeEqual } from "node:crypto";

export type InboundSms = { accountSid: string; from: string; to: string; body: string; messageSid: string };

/** E.164: a plus and 8 to 15 digits. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Twilio's X-Twilio-Signature: HMAC SHA1 of the full webhook URL followed by every posted field,
 * sorted by name, each name directly followed by its value, keyed with the account's auth token.
 */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(url: string, params: Record<string, string>, header: string | null, authToken: string): boolean {
  if (!header || !authToken) return false;
  const expected = Buffer.from(twilioSignature(url, params, authToken));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function parseInboundSms(params: Record<string, string>): InboundSms | null {
  const from = params.From ?? "";
  const to = params.To ?? "";
  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  if (!isE164(from) || !isE164(to) || !messageSid) return null;
  return { accountSid: params.AccountSid ?? "", from, to, body: (params.Body ?? "").slice(0, 4000), messageSid };
}

export class SmsError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

// Twilio error codes that will never succeed on a retry.
const permanentCodes = new Set([21211, 21408, 21610, 21612, 21614, 21606, 21659, 30004, 30005, 30006, 30007]);

export async function sendSms(input: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const doFetch = input.fetchImpl ?? fetch;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/Messages.json`;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: input.to, From: input.from, Body: input.body }).toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new SmsError(`Could not reach Twilio: ${error instanceof Error ? error.message : error}`, true);
  }
  const data = (await response.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  if (response.ok && data.sid) return data.sid;
  const reason = data.code === 21610 ? "The customer has opted out of texts from this number (they replied STOP)." : data.message || `Twilio returned status ${response.status}`;
  const retryable = response.status === 429 || response.status >= 500 ? !permanentCodes.has(data.code ?? 0) : false;
  throw new SmsError(reason, retryable);
}
