// Loads and validates every editable configuration file once, so a bad edit fails loudly at startup.
import { z } from "zod";
import appJson from "@config/app.json";
import marketsJson from "@config/markets.json";
import auditJson from "@config/audit.json";
import automationJson from "@config/automation.json";
import enLocale from "@config/locales/en.json";
import frLocale from "@config/locales/fr.json";
import esLocale from "@config/locales/es.json";
import ptLocale from "@config/locales/pt.json";
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
  dashboard: z.object({
    title: z.string(),
    subtitle: z.string(),
    chartTitle: z.string(),
    chartLabel: z.string(),
    ranges: z.array(z.object({ id: z.string(), label: z.string(), days: z.number().int().min(0) })).min(1),
    defaultRange: z.string(),
    bands: z.array(z.object({ min: z.number(), label: z.string() })).min(1),
    nav: z.array(z.object({ id: z.string(), label: z.string(), href: z.string(), icon: z.string() })),
    soon: z.array(z.object({ label: z.string(), icon: z.string() })),
    soonLabel: z.string(),
    historyLength: z.number().int().min(2),
  }),
  auth: z.object({
    signupTitle: z.string(),
    signupIntro: z.string(),
    loginTitle: z.string(),
    loginIntro: z.string(),
    panelHeading: z.string(),
    panelList: z.array(z.string()),
  }),
  landing: z.object({
    nav: z.array(z.object({ label: z.string(), href: z.string() })),
    navCta: z.string(),
    navCtaShort: z.string(),
    eyebrow: z.array(z.string()),
    headline: z.string(),
    intro: z.string(),
    cta: z.string(),
    secondaryCta: z.object({ label: z.string(), href: z.string() }),
    heroArtTitle: z.string(),
    heroLabels: z.tuple([z.string(), z.string(), z.string()]),
    heroSideList: z.array(z.string()),
    heroFooterLeft: z.string(),
    heroFooterRight: z.array(z.string()),
    niches: z.object({
      kicker: z.string(),
      heading: z.string(),
      intro: z.string(),
      statPacks: z.string(),
      statChecks: z.string(),
      goalPrefix: z.string(),
    }),
    check: z.object({ kicker: z.string(), heading: z.string(), intro: z.string(), caption: z.string() }),
    services: z.object({
      kicker: z.string(),
      heading: z.string(),
      intro: z.string(),
      items: z.array(z.object({ title: z.string(), body: z.string(), tag: z.string() })).length(3),
    }),
    band: z.object({
      kicker: z.string(),
      heading: z.string(),
      body: z.string(),
      cta: z.string(),
      note: z.string(),
      side: z.array(z.string()),
    }),
    footer: z.object({
      tagline: z.array(z.string()),
      links: z.array(z.object({ label: z.string(), href: z.string() })),
      location: z.string(),
      side: z.array(z.string()),
    }),
  }),
});

function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function validCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return /^[A-Z]{3}$/.test(code);
  } catch {
    return false;
  }
}

const marketSchema = z.object({
  name: z.string().min(1),
  currency: z.string().refine(validCurrency, "Use a three letter ISO currency code, such as USD."),
  locale: z.string().min(2),
  phonePrefix: z.string().regex(/^\+\d{1,4}$/),
  paymentProvider: z.string(),
  dataLaw: z.string(),
  timeZones: z.array(z.string().refine(validTimeZone, "Unknown time zone.")).min(1),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
  smsFollowUps: z.boolean(),
  smsNote: z.string(),
});
const marketsSchema = z.record(z.string().regex(/^[A-Z]{2}$/, "Market codes are two capital letters."), marketSchema);

const localeSchema = z.object({
  name: z.string(),
  assistant: z.object({
    greeting: z.string(),
    /** Used when the customer has not given a name, so no language gets an English "there". */
    greetingNoName: z.string(),
    handoffReply: z.string(),
    unknownReply: z.string(),
    qualifiedReply: z.string(),
    afterHandoffReply: z.string(),
    bookingRequestReply: z.string(),
    optOutReply: z.string(),
    optInReply: z.string(),
    reviewAsk: z.string(),
    /** By email the customer's reply goes to the owner, so the link is offered at once and a complaint arrives privately. */
    reviewAskEmail: z.string(),
    reviewHappy: z.string(),
    reviewUnhappy: z.string(),
    missedCallText: z.string(),
    missedCallVoice: z.string(),
    formThanks: z.string(),
    formConsent: z.string(),
    formIntro: z.string(),
    bookingInvite: z.string(),
    bookingConfirmed: z.string(),
    bookingRescheduled: z.string(),
    bookingCancelledCustomer: z.string(),
    emailSubject: z.string(),
    emailFooter: z.string(),
    unsubscribed: z.string(),
  }),
  /** Starting messages for each campaign group, which the owner edits before sending. */
  campaignIdeas: z.object({ quiet: z.string(), lost: z.string(), customers: z.string(), booked_no_show: z.string() }),
  /** Language code Twilio uses to speak, for example en-US. */
  voiceLanguage: z.string(),
  handoffKeywords: z.array(z.string()).min(1),
  optOutKeywords: z.array(z.string()).min(1),
  optInKeywords: z.array(z.string()).min(1),
  priceWords: z.array(z.string()).min(1),
  questionStarts: z.array(z.string()),
  webchat: z.object({ title: z.string(), subtitle: z.string(), placeholder: z.string(), launcherLabel: z.string() }),
});

const checkSchema = z.object({
  id: z.string(),
  group: z.enum(["presence", "site"]),
  area: z.string(),
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
  areas: z.array(z.object({ id: z.string(), label: z.string(), detail: z.string() })).min(1),
  impact: z.array(z.object({ min: z.number(), label: z.string() })).min(1),
});

const intakeSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
  label: z.string(),
  help: z.string().default(""),
  type: z.enum(["text", "textarea"]),
  keywords: z.array(z.string()).default([]),
  // Optional: only ask this in these markets (for example NHS status only in the UK).
  markets: z.array(z.string()).optional(),
});

const stepSchema = z
  .object({
    delayHours: z.number().positive().optional(),
    beforeHours: z.number().positive().optional(),
    message: z.string().min(1).max(1000),
  })
  .refine((s) => (s.delayHours === undefined) !== (s.beforeHours === undefined), {
    message: "Each step needs exactly one of delayHours or beforeHours.",
  });

const sequenceSchema = z
  .object({
    id: z.string().regex(/^[a-z_]+$/),
    name: z.string(),
    trigger: z.enum(["no_reply", "booked", "won"]),
    steps: z.array(stepSchema).min(1),
  })
  .refine((s) => s.steps.every((st) => (s.trigger === "booked" ? st.beforeHours !== undefined : st.delayHours !== undefined)), {
    message: "Booked sequences use beforeHours; other sequences use delayHours.",
  });

const automationSchema = z.object({
  quietHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }),
  retry: z.object({ maxAttempts: z.number().int().min(1).max(20), baseMinutes: z.number().positive() }),
  worker: z.object({ batchSize: z.number().int().min(1).max(100), budgetMs: z.number().int().positive(), inlineBudgetMs: z.number().int().positive() }),
  assistant: z.object({ maxReplyLength: z.number().int().positive() }),
  campaigns: z.object({
    frequencyCapDays: z.number().int().min(0),
    batchSize: z.number().int().min(1).max(200),
    maxAudience: z.number().int().min(1),
    attributionDays: z.number().int().min(1),
  }),
  ai: z.object({ monthlyCallsPerWorkspace: z.number().int().min(0), replyModel: z.string().min(1) }),
  whatsapp: z.object({ windowHours: z.number().positive(), graphVersion: z.string().regex(/^v\d+\.\d+$/) }),
  weekly: z.object({ scoreDropAlert: z.number().int().min(1) }),
  webchat: z.object({
    maxMessageLength: z.number().int().positive(),
    maxMessagesPerMinute: z.number().int().positive(),
    pollSeconds: z.number().int().min(2),
  }),
  stages: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
});

export type AutomationConfig = z.infer<typeof automationSchema>;
export const automationConfig: AutomationConfig = automationSchema.parse(automationJson);
export type Sequence = z.infer<typeof sequenceSchema>;

const packSchema = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  shortName: z.string(),
  description: z.string(),
  // Market codes this pack is offered in, or ["*"] for every market.
  markets: z.array(z.string()).min(1),
  phase: z.number().int(),
  keywords: z.array(z.string()),
  conversionAction: z.string(),
  intake: z.array(intakeSchema),
  qualifiers: z.array(z.string()),
  sequences: z.array(sequenceSchema).min(1),
  conversionPrompt: z.string().min(1),
  handoffKeywords: z.array(z.string()),
  contentThemes: z.array(z.string()),
  adTemplates: z.array(z.object({ objective: z.string(), audience: z.string(), angle: z.string(), markets: z.array(z.string()).optional() })),
  compliance: z.array(z.string()),
  kpis: z.array(z.string()),
});

export type AppConfig = z.infer<typeof appSchema>;
export type MarketCode = string;
export type Market = z.infer<typeof marketSchema>;
export type Locale = z.infer<typeof localeSchema>;
export type AuditConfig = z.infer<typeof auditSchema>;
export type AuditCheck = z.infer<typeof checkSchema>;
export type NichePack = z.infer<typeof packSchema>;
export type IntakeField = z.infer<typeof intakeSchema>;

export const appConfig: AppConfig = appSchema.parse(appJson);
export const markets: Record<MarketCode, Market> = marketsSchema.parse(marketsJson);
export const auditConfig: AuditConfig = auditSchema.parse(auditJson);

// Languages. English is complete by definition; any other language falls back to English for a missing text.
const localeFiles: Record<string, unknown> = { en: enLocale, fr: frLocale, es: esLocale, pt: ptLocale };
export const locales: Record<string, Locale> = Object.fromEntries(
  Object.entries(localeFiles).map(([code, data]) => {
    const parsed = localeSchema.safeParse(data);
    if (!parsed.success) throw new Error(`Language file config/locales/${code}.json is invalid: ${parsed.error.issues[0]?.message}`);
    return [code, parsed.data];
  }),
);
export const languageCodes = Object.keys(locales);

for (const [code, market] of Object.entries(markets)) {
  for (const lang of market.languages) {
    if (!locales[lang]) throw new Error(`Market ${code} offers language "${lang}", but config/locales/${lang}.json does not exist.`);
  }
}

export function localeFor(language: string | null | undefined): Locale {
  return locales[language ?? "en"] ?? locales.en;
}

/** Phrases from every language, so a customer is understood whichever language they write in. */
export function everyLanguage<K extends "handoffKeywords" | "optOutKeywords" | "optInKeywords" | "priceWords" | "questionStarts">(key: K): string[] {
  return [...new Set(Object.values(locales).flatMap((l) => l[key]))];
}

const areaIds = new Set(auditConfig.areas.map((a) => a.id));
for (const check of auditConfig.checks) {
  if (!areaIds.has(check.area)) throw new Error(`Audit check "${check.id}" names an unknown area "${check.area}".`);
}

export const packs: NichePack[] = packFiles.map((p) => packSchema.parse(p));

const packIds = new Set(packs.map((p) => p.id));
if (packIds.size !== packs.length) throw new Error("Two niche packs share the same id.");
if (!packIds.has(fallbackPackId)) throw new Error(`Fallback pack "${fallbackPackId}" is missing.`);
for (const pack of packs) {
  const named = [...pack.markets, ...pack.intake.flatMap((f) => f.markets ?? []), ...pack.adTemplates.flatMap((t) => t.markets ?? [])];
  for (const code of named) {
    if (code !== "*" && !markets[code]) throw new Error(`Pack "${pack.id}" names market "${code}", which is not in config/markets.json.`);
  }
}

export function isMarketCode(value: unknown): value is MarketCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(markets, value);
}

function offeredIn(list: string[] | undefined, code: MarketCode | null | undefined): boolean {
  return !list || list.includes("*") || (code ? list.includes(code) : true);
}

/** The currency symbol as people in that market write it, for example $ for USD in the US and ₹ for INR. */
export function currencySymbol(code: MarketCode | null | undefined): string {
  const m = code ? markets[code] : null;
  if (!m) return "";
  const part = new Intl.NumberFormat(m.locale, { style: "currency", currency: m.currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? m.currency;
}

/** Formats an amount in the market's own way, for example ₹1,50,000 in India and $150,000 in the US. */
export function formatMoney(amount: number, code: MarketCode | null | undefined): string {
  const m = code ? markets[code] : null;
  if (!m) return String(amount);
  return new Intl.NumberFormat(m.locale, { style: "currency", currency: m.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(amount);
}

/** A business's own time zone if it chose one that belongs to its market, otherwise the market's first. */
export function workspaceTimeZone(code: MarketCode | null | undefined, chosen?: string | null): string {
  const m = code ? markets[code] : null;
  if (!m) return "UTC";
  return chosen && m.timeZones.includes(chosen) ? chosen : m.timeZones[0];
}

/** The pack as a business in this market sees it: questions for other markets left out, prices shown in its currency. */
export function getPack(id: string | null | undefined, code?: MarketCode | null): NichePack {
  const pack = packs.find((p) => p.id === id) ?? packs.find((p) => p.id === fallbackPackId)!;
  if (!code) return pack;
  const symbol = currencySymbol(code);
  return {
    ...pack,
    intake: pack.intake.filter((f) => offeredIn(f.markets, code)).map((f) => ({ ...f, help: f.help.replaceAll("{currency}", symbol) })),
    adTemplates: pack.adTemplates.filter((t) => offeredIn(t.markets, code)),
  };
}

export function packsForMarket(code: MarketCode | null | undefined): NichePack[] {
  return packs.filter((p) => offeredIn(p.markets, code)).map((p) => getPack(p.id, code));
}

export { fallbackPackId };
