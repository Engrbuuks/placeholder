// How the assistant reads a customer message and finds an answer.
// Pure functions, so every rule can be tested without a database or a network.
import type { BrandBrain } from "../brandBrain";
import type { NichePack } from "../config";

const stopwords = new Set(
  "a an the and or but if to of in on at for with by from about as is are was were be been am do does did can could would should will shall may might i you we they he she it me my your our their this that these those there here what which who whom how when where why please hi hello hey thanks thank ok okay yes no not just so also any some much many more most get got have has had".split(
    " ",
  ),
);

export function normalise(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

/** Light stemming so "inspections" matches "inspection" and "prices" matches "price". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function contentTokens(text: string): string[] {
  return normalise(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !stopwords.has(w))
    .map(stem);
}

function hasPhrase(text: string, phrase: string): boolean {
  const escaped = normalise(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalise(text));
}

/** Returns the first handoff phrase found in the message, or null. */
export function detectHandoff(text: string, phrases: string[]): string | null {
  return phrases.find((p) => p.trim() && hasPhrase(text, p)) ?? null;
}

const questionStarts =
  /^(what|whats|what's|how|when|where|which|who|why|do|does|did|can|could|is|are|will|would|should|have|has|any|price|cost|how much)\b/;

export function isQuestion(text: string): boolean {
  const t = normalise(text);
  return t.includes("?") || questionStarts.test(t) || /\b(how much|price|prices|cost|costs|fee|fees)\b/.test(t);
}

export function extractContact(text: string): { email?: string; phone?: string; name?: string } {
  const out: { email?: string; phone?: string; name?: string } = {};
  const email = text.match(/[A-Z0-9._%+]+@[A-Z0-9.]+\.[A-Z]{2,}/i);
  if (email) out.email = email[0].toLowerCase();
  const phone = text.match(/\+?\d[\d\s]{8,16}\d/);
  if (phone) out.phone = phone[0].replace(/\s/g, "");
  const name = text.match(/(?:^|\s)(?:[Mm]y name is|[Ii] am|[Ii]['\u2019]m|[Tt]his is)\s+([A-Z][a-z]{1,20}(?:\s[A-Z][a-z]{1,20})?)/);
  if (name) out.name = name[1];
  return out;
}

/** Everything the assistant is allowed to say, as plain text. Used for AI answers and the price guard. */
export function factsText(brain: BrandBrain, pack: NichePack): string {
  const lines = [
    `Business: ${brain.businessName}`,
    brain.summary && `About: ${brain.summary}`,
    brain.hours && `Opening hours: ${brain.hours}`,
    brain.address && `Address: ${brain.address}`,
    brain.phone && `Phone: ${brain.phone}`,
    brain.whatsapp && `WhatsApp: ${brain.whatsapp}`,
    brain.email && `Email: ${brain.email}`,
    ...brain.services.map((s) => `Service: ${s.name}${s.price ? `, price ${s.price}` : ""}`),
    ...brain.faqs.map((f) => `Q: ${f.q} A: ${f.a}`),
    ...pack.intake.filter((f) => brain.answers[f.key]).map((f) => `${f.label}: ${brain.answers[f.key]}`),
  ];
  return lines.filter(Boolean).join("\n");
}

const moneyPattern =
  /(?:₦|£|\$|€|\bngn\s?|\bgbp\s?|\busd\s?|\bn(?=\d))\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|thousand|billion)?\b|\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|thousand|billion)?\s?(?:naira|pounds?|dollars?|quid)\b/gi;
const numberPattern = /\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|thousand|billion)?\b/gi;

/** Reads "₦85,000,000", "85m" or "85 million naira" as the number 85000000. */
export function amountValue(raw: string): number | null {
  const m = raw.toLowerCase().match(/(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|thousand|billion)?/);
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const scale = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 }[m[2] as "k"] ?? 1;
  return Math.round(base * scale);
}

/** True when every amount of money in the reply is an amount the business wrote down. */
export function pricesAreGrounded(reply: string, facts: string): boolean {
  const known = new Set((facts.match(numberPattern) ?? []).map(amountValue).filter((v): v is number => v !== null));
  return (reply.match(moneyPattern) ?? []).every((m) => {
    const value = amountValue(m);
    return value !== null && known.has(value);
  });
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.filter((w) => set.has(w)).length;
}

/** Answers from the brand brain with plain rules. Returns null when it does not know. */
export function answerFromBrain(text: string, brain: BrandBrain, pack: NichePack): string | null {
  const t = normalise(text);
  const tokens = contentTokens(text);

  // Questions the business has already written the answer to come first.
  let bestFaq: { score: number; a: string } | null = null;
  for (const f of brain.faqs) {
    const q = contentTokens(f.q);
    const shared = overlap(tokens, q);
    const score = shared / Math.max(1, new Set([...q, ...tokens]).size);
    if (shared >= 1 && (score >= 0.34 || shared >= 2) && (!bestFaq || score > bestFaq.score)) bestFaq = { score, a: f.a };
  }
  if (bestFaq) return bestFaq.a;

  if (/\b(how much|price|prices|cost|costs|fee|fees|charge|rate|rates)\b/.test(t)) {
    const scored = brain.services
      .map((s) => ({ s, shared: overlap(tokens, contentTokens(s.name)) }))
      .filter((x) => x.shared > 0 && x.s.price)
      .sort((a, b) => b.shared - a.shared);
    if (scored[0]) return `${scored[0].s.name} is ${scored[0].s.price}.`;
    const priced = brain.services.filter((s) => s.price);
    if (priced.length) return `Here are our prices: ${priced.slice(0, 6).map((s) => `${s.name}, ${s.price}`).join("; ")}.`;
  }

  for (const field of pack.intake) {
    const answer = brain.answers[field.key];
    if (!answer) continue;
    if (field.keywords.some((k) => hasPhrase(t, k))) {
      // A full sentence stands on its own; a short fact needs its label to make sense.
      const sentence = /[.!?]$/.test(answer.trim()) && answer.trim().split(/\s+/).length > 3;
      return sentence ? answer : `${field.label}: ${answer.trim().replace(/[.]$/, "")}.`;
    }
  }

  if (/\b(open|opening|hours|close|closing|what time|weekend|saturday|sunday|today)\b/.test(t) && brain.hours) {
    return `We are open ${brain.hours}.`;
  }
  if (/\b(where|address|located|location|directions|find you)\b/.test(t) && brain.address) {
    return `You can find us at ${brain.address}.`;
  }
  if (/\b(phone|number|call|email|contact)\b/.test(t)) {
    const parts = [brain.phone && `call ${brain.phone}`, brain.email && `email ${brain.email}`].filter(Boolean);
    if (parts.length) return `You can ${parts.join(" or ")}.`;
  }

  const service = brain.services
    .map((s) => ({ s, shared: overlap(tokens, contentTokens(s.name)) }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared)[0];
  if (service) return `Yes, we offer ${service.s.name}${service.s.price ? ` at ${service.s.price}` : ""}.`;

  return null;
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.trimEnd()}...`;
}
