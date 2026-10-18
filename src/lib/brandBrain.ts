// The brand brain: the confirmed facts the assistant is allowed to say about a business.
import { z } from "zod";

const shortText = z.string().trim().max(300).default("");
const longText = z.string().trim().max(4000).default("");

export const serviceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.string().trim().max(100).default(""),
});

export const faqSchema = z.object({
  q: z.string().trim().min(1).max(500),
  a: z.string().trim().min(1).max(2000),
});

export const brandBrainSchema = z.object({
  businessName: shortText,
  summary: longText,
  phone: shortText,
  whatsapp: shortText,
  email: shortText,
  address: shortText,
  hours: shortText,
  services: z.array(serviceSchema).max(100).default([]),
  faqs: z.array(faqSchema).max(100).default([]),
  tone: z.string().trim().max(40).default(""),
  answers: z.record(z.string(), z.string().trim().max(4000)).default({}),
});

export type BrandBrain = z.infer<typeof brandBrainSchema>;
export type DraftSource = "manual" | "rules" | "ai";

export function emptyBrandBrain(): BrandBrain {
  return brandBrainSchema.parse({});
}

/** Reads stored JSON safely; anything unexpected becomes an empty field rather than an error. */
export function parseStoredBrandBrain(value: unknown): BrandBrain {
  const result = brandBrainSchema.safeParse(value ?? {});
  return result.success ? result.data : emptyBrandBrain();
}

/** Lines like "Implant consultation | £95" become services. */
export function parseServiceLines(text: string): BrandBrain["services"] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const [name, ...rest] = line.split("|");
      return { name: name.trim().slice(0, 200), price: rest.join("|").trim().slice(0, 100) };
    })
    .filter((s) => s.name.length > 0);
}

export function serviceLines(services: BrandBrain["services"]): string {
  return services.map((s) => (s.price ? `${s.name} | ${s.price}` : s.name)).join("\n");
}

/** Lines like "Do you take HMOs? | Yes, we accept Hygeia and AXA" become FAQs. */
export function parseFaqLines(text: string): BrandBrain["faqs"] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const [q, ...rest] = line.split("|");
      return { q: q.trim().slice(0, 500), a: rest.join("|").trim().slice(0, 2000) };
    })
    .filter((f) => f.q.length > 0 && f.a.length > 0);
}

export function faqLines(faqs: BrandBrain["faqs"]): string {
  return faqs.map((f) => `${f.q} | ${f.a}`).join("\n");
}

/** Fields that must be filled before the assistant can go live. */
export function missingEssentials(brain: BrandBrain): string[] {
  const missing: string[] = [];
  if (!brain.businessName) missing.push("Business name");
  if (!brain.summary) missing.push("What you do");
  if (!brain.phone && !brain.whatsapp) missing.push("Phone or WhatsApp number");
  if (brain.services.length === 0) missing.push("At least one service");
  return missing;
}
