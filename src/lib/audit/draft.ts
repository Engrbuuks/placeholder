// Builds a first draft of the brand brain from page facts, then lets AI fill gaps when it is available.
import { brandBrainSchema, type BrandBrain, type DraftSource } from "../brandBrain";
import { draftBrandBrainWithAi, aiEnabled } from "../ai";
import type { NichePack } from "../config";
import type { PageFacts } from "./analyze";

function nameFromTitle(title: string | undefined): string {
  if (!title) return "";
  // Titles often read "Brand | Tagline" or "Brand: Tagline"; keep the first part.
  return title.split(/\s[|:\u2022\u00b7]\s|\s\u2013\s|\s\u2014\s/)[0].trim().slice(0, 120);
}

export function draftFromFacts(facts: PageFacts, existing: BrandBrain): BrandBrain {
  const biz = facts.schemaBusiness ?? {};
  return brandBrainSchema.parse({
    ...existing,
    businessName: existing.businessName || biz.name || facts.siteName || nameFromTitle(facts.title),
    summary: existing.summary || biz.description || facts.description || "",
    phone: existing.phone || biz.telephone || facts.phoneNumbers?.[0] || "",
    whatsapp: existing.whatsapp || (facts.whatsappNumbers?.[0] && facts.whatsappNumbers[0] !== "linked" ? `+${facts.whatsappNumbers[0]}` : ""),
    email: existing.email || biz.email || facts.emails?.[0] || "",
    address: existing.address || biz.address || "",
    hours: existing.hours || biz.openingHours || "",
  });
}

export async function draftBrandBrain(input: {
  facts: PageFacts;
  pageText: string;
  existing: BrandBrain;
  pack: NichePack;
}): Promise<{ brain: BrandBrain; source: DraftSource }> {
  if (!input.facts.fetched) return { brain: input.existing, source: "manual" };
  const fromRules = draftFromFacts(input.facts, input.existing);
  if (!aiEnabled() || !input.pageText) return { brain: fromRules, source: "rules" };

  const ai = await draftBrandBrainWithAi({
    pageText: input.pageText,
    packName: input.pack.name,
    intake: input.pack.intake,
    knownFacts: {
      businessName: fromRules.businessName,
      phone: fromRules.phone,
      whatsapp: fromRules.whatsapp,
      email: fromRules.email,
    },
  });
  if (!ai) return { brain: fromRules, source: "rules" };

  // Owner entered values and facts read directly from the page win over AI wording.
  const allowedKeys = new Set(input.pack.intake.map((f) => f.key));
  const aiAnswers = Object.fromEntries(Object.entries(ai.answers ?? {}).filter(([k, v]) => allowedKeys.has(k) && v.trim()));
  const merged = brandBrainSchema.parse({
    ...fromRules,
    businessName: fromRules.businessName || ai.businessName || "",
    summary: fromRules.summary || ai.summary || "",
    hours: fromRules.hours || ai.hours || "",
    address: fromRules.address || ai.address || "",
    services: fromRules.services.length ? fromRules.services : (ai.services ?? []).map((s) => ({ name: s.name, price: s.price ?? "" })),
    faqs: fromRules.faqs.length ? fromRules.faqs : (ai.faqs ?? []),
    answers: { ...aiAnswers, ...fromRules.answers },
  });
  return { brain: merged, source: "ai" };
}
