// WhatsApp Cloud API: webhook verification, signature checks, parsing and sending.
// Free text can only be sent within 24 hours of the customer's last message; after that,
// only a template Meta has approved can be sent.
import { createHmac, timingSafeEqual } from "node:crypto";
import { automationConfig } from "../config";

export type InboundWhatsApp = {
  phoneNumberId: string;
  from: string;
  id: string;
  text: string;
  name: string | null;
  timestamp: number;
};

export type StatusWhatsApp = { phoneNumberId: string; id: string; status: string; error: string | null };

/** Checks Meta's X-Hub-Signature-256 header against the raw body. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Payload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }[];
        statuses?: { id?: string; status?: string; errors?: { title?: string; message?: string }[] }[];
      };
    }[];
  }[];
};

export function parseWebhook(body: unknown): { messages: InboundWhatsApp[]; statuses: StatusWhatsApp[] } {
  const payload = body as Payload;
  const messages: InboundWhatsApp[] = [];
  const statuses: StatusWhatsApp[] = [];
  if (payload?.object !== "whatsapp_business_account") return { messages, statuses };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (change.field !== "messages" || !value || !phoneNumberId) continue;
      for (const m of value.messages ?? []) {
        if (!m.from || !m.id) continue;
        const contact = value.contacts?.find((c) => c.wa_id === m.from) ?? value.contacts?.[0];
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          `(${m.type ?? "unsupported"} message)`;
        messages.push({
          phoneNumberId,
          from: m.from,
          id: m.id,
          text: text.slice(0, 4000),
          name: contact?.profile?.name ?? null,
          timestamp: Number(m.timestamp ?? 0) * 1000 || Date.now(),
        });
      }
      for (const s of value.statuses ?? []) {
        if (!s.id || !s.status) continue;
        statuses.push({ phoneNumberId, id: s.id, status: s.status, error: s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? null });
      }
    }
  }
  return { messages, statuses };
}

export function withinWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < automationConfig.whatsapp.windowHours * 3600 * 1000;
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

type SendArgs = { phoneNumberId: string; token: string; to: string; fetchImpl?: typeof fetch };

async function post(args: SendArgs, body: Record<string, unknown>): Promise<string> {
  const version = process.env.WHATSAPP_GRAPH_VERSION || automationConfig.whatsapp.graphVersion;
  let res: Response;
  try {
    res = await (args.fetchImpl ?? fetch)(`https://graph.facebook.com/${version}/${encodeURIComponent(args.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${args.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: args.to, ...body }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new WhatsAppError(`Could not reach WhatsApp: ${error instanceof Error ? error.message : String(error)}`, true);
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok) {
    const code = data.error?.code;
    // Window and auth errors will not fix themselves; rate limits and server errors will.
    const retryable = res.status >= 500 || res.status === 429 || code === 130429;
    throw new WhatsAppError(data.error?.message ?? `WhatsApp returned ${res.status}`, retryable, code);
  }
  const id = data.messages?.[0]?.id;
  if (!id) throw new WhatsAppError("WhatsApp accepted the message but returned no id.", false);
  return id;
}

export function sendText(args: SendArgs & { body: string }): Promise<string> {
  return post(args, { type: "text", text: { preview_url: false, body: args.body.slice(0, 4096) } });
}

/** Sends an approved template whose first body variable is the customer's first name. */
export function sendTemplate(args: SendArgs & { name: string; language: string; firstName: string }): Promise<string> {
  return post(args, {
    type: "template",
    template: {
      name: args.name,
      language: { code: args.language },
      components: [{ type: "body", parameters: [{ type: "text", text: args.firstName }] }],
    },
  });
}
