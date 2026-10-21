// How the assistant reads a customer message and finds an answer.
// Pure functions, so every rule can be tested without a database or a network.
import type { BrandBrain } from "../brandBrain";
import { everyLanguage, markets, type NichePack } from "../config";

const stopwords = new Set(
  "a an the and or but if to of in on at for with by from about as is are was were be been am do does did can could would should will shall may might i you we they he she it me my your our their this that these those there here what which who whom how when where why please hi hello hey thanks thank ok okay yes no not just so also any some much many more most get got have has had".split(
    " ",
  ),
);

/** Lower case, accents folded (où and ou match), hyphens read as spaces, spacing tidied. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .replace(/[-‐‑]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseAlternation = (phrases: string[]) =>
  [...new Set(phrases.map(normalise))].sort((a, b) => b.length - a.length).map(escapeRe).join("|");

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

export function hasPhrase(text: string, phrase: string): boolean {
  const escaped = normalise(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalise(text));
}

/** True when the whole message is one of the keywords, such as "STOP" or "Stop." but not "don't stop". */
export function isKeywordMessage(text: string, keywords: string[]): boolean {
  const t = normalise(text).replace(/[^\p{L}\p{N} ]/gu, "").trim();
  return t.length > 0 && keywords.some((k) => normalise(k) === t);
}

/** Returns the first handoff phrase found in the message, or null. */
export function detectHandoff(text: string, phrases: string[]): string | null {
  return phrases.find((p) => p.trim() && hasPhrase(text, p)) ?? null;
}

// Built from every language file, so "how much", "combien", "cuánto" and "quanto" all count.
const priceWords = new RegExp(`(^|[^\\p{L}\\p{N}])(${phraseAlternation(everyLanguage("priceWords"))})($|[^\\p{L}\\p{N}])`, "u");
const questionStarts = new RegExp(`^(${phraseAlternation(everyLanguage("questionStarts"))})($|[^\\p{L}\\p{N}])`, "u");

export function isQuestion(text: string): boolean {
  const t = normalise(text);
  return t.includes("?") || t.includes("¿") || questionStarts.test(t) || priceWords.test(t);
}

export function asksPrice(text: string): boolean {
  return priceWords.test(normalise(text));
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

// Money in any market: symbols and codes for every currency in config/markets.json plus the common ones,
// the words people use for them, and scale words including the Indian lakh and crore.
const scales: Record<string, number> = {
  k: 1e3, thousand: 1e3, mil: 1e3, m: 1e6, mn: 1e6, million: 1e6, millions: 1e6, millon: 1e6, "millón": 1e6, millones: 1e6, milhao: 1e6, "milhão": 1e6, milhoes: 1e6, "milhões": 1e6,
  bn: 1e9, billion: 1e9, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7,
};
const scaleAlt = Object.keys(scales).sort((a, b) => b.length - a.length).join("|");
const marketCurrencies = Object.values(markets).map((m) => m.currency);
const codes = [...new Set([...marketCurrencies, "USD", "EUR", "GBP"])];
function symbolsFor(code: string): string[] {
  const out = new Set<string>();
  for (const display of ["narrowSymbol", "symbol"] as const) {
    try {
      const part = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: display })
        .formatToParts(1)
        .find((p) => p.type === "currency")?.value;
      if (part && part !== code) out.add(part);
    } catch {
      // Unknown to this runtime; the code itself still matches.
    }
  }
  return [...out];
}
const symbols = [...new Set([...codes.flatMap(symbolsFor), "₦", "£", "$", "€", "₹", "Rs.", "Rs", "KSh", "GH₵", "₵", "R$", "MX$", "CA$", "US$", "AED"])];
const currencyWords = "naira|pounds?|quid|dollars?|bucks|euros?|rupees?|cedis?|shillings?|rand|dirhams?|pesos?|reais|reals?";
// A number glued to letters ("500sqm", "3bed") is a measurement, not money, so it never counts.
const amount = `\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:${scaleAlt})\\b)?(?![a-z\\d])`;
const before = `(?:${symbols.map(escapeRe).sort((a, b) => b.length - a.length).join("|")}|\\b(?:${codes.join("|")})\\b|\\bn(?=\\d))`;
const moneyPattern = new RegExp(`${before}\\s?${amount}|${amount}\\s?(?:\\b(?:${codes.join("|")})\\b|\\b(?:${currencyWords})\\b)`, "gi");
const numberPattern = new RegExp(amount, "gi");

/** Every amount of money written in the text, as written: "₦3m", "85 million naira", "£95". */
export function findMoney(text: string): string[] {
  return text.match(moneyPattern) ?? [];
}

/** Every plain number in the text, with any scale word: "3m", "2.5 crore", "500". */
export function findAmounts(text: string): string[] {
  return text.match(numberPattern) ?? [];
}

/** Reads "₦85,000,000", "85m", "85 million naira", "₹1,50,000" or "2.5 crore" as a plain number. */
export function amountValue(raw: string): number | null {
  const m = raw.toLowerCase().match(new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s?(${scaleAlt})?\\b`));
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  return Math.round(base * (m[2] ? scales[m[2]] : 1));
}

/** True when every amount of money in the reply is an amount the business wrote down. */
export function pricesAreGrounded(reply: string, facts: string): boolean {
  // Known prices: money written anywhere in the facts, and any number in a service's price field.
  const priceFields = facts.split("\n").flatMap((line) => line.match(/, price (.+)$/)?.[1] ?? []);
  const known = new Set(
    [...(facts.match(moneyPattern) ?? []), ...priceFields.flatMap((p) => p.match(numberPattern) ?? [])]
      .map(amountValue)
      .filter((v): v is number => v !== null),
  );
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

  if (asksPrice(text)) {
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
