// Loads and validates every editable configuration file once, so a bad edit fails loudly at startup.
import { z } from "zod";
import appJson from "@config/app.json";
import marketsJson from "@config/markets.json";
import auditJson from "@config/audit.json";
import { packFiles, fallbackPackId } from "@packs/index";

const appSchema = z.object({
  name: z.string().min(1),
  tagline: z.string(),
  supportEmail: z.string().email(),
  sessionDays: z.number().int().positive(),
  passwordMinLength: z.number().int().min(8),
  rateLimit: z.object({
    windowMinutes: z.number().int().positive(),
    maxLoginAttempts: z.number().int().positive(),
    maxSignupsPerIp: z.number().int().positive(),
  }),
  tones: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  comingNext: z.array(z.object({ id: z.string(), label: z.string(), detail: z.string() })),
  landing: z.object({
    headline: z.string(),
    intro: z.string(),
    cta: z.string(),
    audience: z.string(),
    sampleCaption: z.string(),
    packsHeading: z.string(),
    packGoalPrefix: z.string(),
  }),
});

const marketSchema = z.object({
  name: z.string(),
  currency: z.string(),
  currencySymbol: z.string(),
  phonePrefix: z.string(),
  paymentProvider: z.string(),
  dataLaw: z.string(),
});
const marketsSchema = z.record(z.enum(["NG", "UK"]), marketSchema);

const checkSchema = z.object({
  id: z.string(),
  group: z.enum(["presence", "site"]),
  weight: z.number().int().positive(),
  label: z.string(),
  pass: z.string(),
  fail: z.string(),
  unreachable: z.string().optional(),
  fix: z.string(),
});

const auditSchema = z.object({
  fetch: z.object({
    timeoutMs: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
    maxRedirects: z.number().int().min(0),
    userAgent: z.string(),
  }),
  thresholds: z.object({
    responseMs: z.number(),
    pageKb: z.number(),
    titleMin: z.number(),
    titleMax: z.number(),
    descriptionMin: z.number(),
    descriptionMax: z.number(),
  }),
  keywords: z.object({
    booking: z.array(z.string()),
    reviews: z.array(z.string()),
    social: z.array(z.string()),
    maps: z.array(z.string()),
    analytics: z.array(z.string()),
  }),
  checks: z.array(checkSchema).min(1),
});

const intakeSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
  label: z.string(),
  help: z.string().default(""),
  type: z.enum(["text", "textarea"]),
});

const packSchema = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  shortName: z.string(),
  description: z.string(),
  markets: z.array(z.enum(["NG", "UK"])).min(1),
  phase: z.number().int(),
  keywords: z.array(z.string()),
  conversionAction: z.string(),
  intake: z.array(intakeSchema),
  qualifiers: z.array(z.string()),
  sequences: z.array(z.object({ name: z.string(), steps: z.array(z.string()) })),
  contentThemes: z.array(z.string()),
  adTemplates: z.array(z.object({ objective: z.string(), audience: z.string(), angle: z.string() })),
  compliance: z.array(z.string()),
  kpis: z.array(z.string()),
});

export type AppConfig = z.infer<typeof appSchema>;
export type MarketCode = "NG" | "UK";
export type Market = z.infer<typeof marketSchema>;
export type AuditConfig = z.infer<typeof auditSchema>;
export type AuditCheck = z.infer<typeof checkSchema>;
export type NichePack = z.infer<typeof packSchema>;
export type IntakeField = z.infer<typeof intakeSchema>;

export const appConfig: AppConfig = appSchema.parse(appJson);
export const markets = marketsSchema.parse(marketsJson) as Record<MarketCode, Market>;
export const auditConfig: AuditConfig = auditSchema.parse(auditJson);

export const packs: NichePack[] = packFiles.map((p) => packSchema.parse(p));

const packIds = new Set(packs.map((p) => p.id));
if (packIds.size !== packs.length) throw new Error("Two niche packs share the same id.");
if (!packIds.has(fallbackPackId)) throw new Error(`Fallback pack "${fallbackPackId}" is missing.`);

export function getPack(id: string | null | undefined): NichePack {
  return packs.find((p) => p.id === id) ?? packs.find((p) => p.id === fallbackPackId)!;
}

export function packsForMarket(code: MarketCode | null | undefined): NichePack[] {
  return code ? packs.filter((p) => p.markets.includes(code)) : packs;
}

export function isMarketCode(value: unknown): value is MarketCode {
  return value === "NG" || value === "UK";
}

export { fallbackPackId };
