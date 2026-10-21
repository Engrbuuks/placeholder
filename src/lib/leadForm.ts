// The lead form: a few fields a business can put on any page, link from Instagram, or print as a QR code.
// When the business has SMS, the person gets an instant text and the assistant takes it from there.
import { z } from "zod";
import { markets } from "./config";
import { withTenant } from "./db";
import type { Attribution } from "./attribution";
import { handleInbound, type InboundResult } from "./pipeline/engine";

export const leadFormSchema = z
  .object({
    name: z.string().trim().min(1, "Add your name.").max(80),
    phone: z.string().trim().max(30).default(""),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Check the email address.").max(200)]).default(""),
    message: z.string().trim().max(1000).default(""),
    consent: z.boolean().default(false),
    website: z.string().max(0, "Spam").default(""), // a hidden field only bots fill in
  })
  .refine((d) => d.phone || d.email, { message: "Add a phone number or an email so we can reply." });

/**
 * Turns what people type ("0803 123 4567", "(312) 555-0100", "+44 7700 900123") into international form,
 * using the business's own country code. Returns null when it cannot be a real number.
 */
export function normalisePhone(raw: string, country: string | null): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  const prefix = country ? markets[country]?.phonePrefix : undefined;
  if (!digits.startsWith("+")) {
    if (!prefix) return null;
    const national = digits.replace(/^0+/, "");
    // In North America the national number already starts after the 1.
    digits = prefix === "+1" && national.length === 11 && national.startsWith("1") ? `+${national}` : `${prefix}${national}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export async function submitLeadForm(
  workspaceId: string,
  input: z.infer<typeof leadFormSchema>,
  attribution: Attribution,
): Promise<{ result: InboundResult; channel: "sms" | "form" }> {
  const { country, smsReady } = await withTenant(workspaceId, async (c) => {
    const w = (await c.query<{ country: string | null }>("select country from workspaces where id = $1", [workspaceId])).rows[0];
    const sms = (await c.query("select 1 from channel_connections where channel = 'sms' and secret_enc is not null")).rowCount;
    return { country: w?.country ?? null, smsReady: Boolean(sms) };
  });
  const phone = input.phone ? normalisePhone(input.phone, country) : null;
  const channel = phone && smsReady ? "sms" : "form";
  const text = [input.message || "(Sent the lead form without a message)"].join("\n");
  const result = await handleInbound({
    workspaceId,
    channel,
    externalId: channel === "sms" ? phone! : input.email || `${input.name.toLowerCase()}:${phone ?? "no phone"}`,
    text,
    name: input.name,
    email: input.email || null,
    phone,
    consent: input.consent,
    attribution: { ...attribution, source: "form" },
  });
  return { result, channel };
}
