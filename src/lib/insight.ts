// Reading a conversation: what the customer wants, how soon, their budget, their concerns and buying signals,
// and a heat score from 0 to 100 so the owner calls the right people first.
//
// The rules below always run, cost nothing and work in every language file. When an AI key is set, the AI reads
// the same conversation more deeply, and its reading is checked against what the customer actually wrote before
// it is kept: a budget the customer never typed, or a concern they never voiced, is thrown away.
// Pure functions, so every rule can be tested without a database or a network.
import { automationConfig, concernTypes, everyLanguage, everySignal, type ConcernType } from "./config";
import type { BrandBrain } from "./brandBrain";
import { amountValue, clip, contentTokens, findAmounts, findMoney, hasPhrase, normalise } from "./pipeline/assistant";

export type Urgency = "now" | "soon" | "later" | "unknown";
export type Intent = "ready_to_book" | "comparing" | "just_asking" | "unknown";
export type Concern = { type: ConcernType; quote: string };

export type Insight = {
  /** What they want, in a few words. */
  wants: string | null;
  urgency: Urgency;
  /** Their budget exactly as they wrote it. */
  budget: string | null;
  concerns: Concern[];
  /** Their own words that show they are ready to buy. */
  signals: string[];
  intent: Intent;
  /** One or two sentences for the owner: what they want, what they were told, where it stands. */
  summary: string;
  /** What the owner should do next. */
  nextStep: string;
};

export type Turn = { from: "customer" | "business"; text: string };

export const concernLabel: Record<ConcernType, string> = {
  price: "the price",
  trust: "whether they can trust you",
  timing: "the timing",
  competitor: "another provider",
};

export const urgencyLabel: Record<Urgency, string> = {
  now: "Wants it today or tomorrow",
  soon: "Wants it within the week",
  later: "No rush",
  unknown: "Timing not said",
};

/** Splits customer text into sentences, so a concern or signal is quoted in the customer's own words. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?¿¡])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstMatch(sentencesList: string[], phrases: string[]): string | null {
  for (const s of sentencesList) if (phrases.some((p) => p.trim() && hasPhrase(s, p))) return s;
  return null;
}

/** A budget as the customer wrote it: money with a currency, or a number next to a word like "budget". */
export function findBudget(customerText: string): string | null {
  const money = findMoney(customerText);
  if (money.length) return money[money.length - 1].trim();
  const budgetWords = everySignal("budgetWords");
  for (const s of sentences(customerText)) {
    if (!budgetWords.some((w) => hasPhrase(s, w))) continue;
    // A bare number only counts as a budget when it is big or has a scale ("3m", "2 lakh"), never "2 rooms".
    const amount = findAmounts(s).find((a) => /[a-z]/i.test(a) || (amountValue(a) ?? 0) >= 1000);
    if (amount) return amount.trim();
  }
  return null;
}

/** The first concern in one message, by the rules, or null. Used while replying, so it costs nothing. */
export function concernIn(text: string): ConcernType | null {
  return concernTypes.find((type) => everySignal(type).some((p) => p.trim() && hasPhrase(text, p))) ?? null;
}

/** True when the message asks to book, buy or pay, in any language. */
export function wantsToBook(text: string): boolean {
  return everySignal("buying").some((p) => p.trim() && hasPhrase(text, p));
}

export function readWithRules(input: {
  turns: Turn[];
  qualifierAnswers: { q: string; a: string }[];
  services: string[];
  stage: string;
}): Insight {
  const customer = input.turns.filter((t) => t.from === "customer").map((t) => t.text);
  const all = customer.join("\n");
  const said = sentences(all);

  // Urgency: the most recent statement wins, because people firm up as they talk.
  let urgency: Urgency = "unknown";
  for (const s of said) {
    if (everySignal("urgentNow").some((p) => hasPhrase(s, p))) urgency = "now";
    else if (everySignal("urgentSoon").some((p) => hasPhrase(s, p))) urgency = "soon";
    else if (everySignal("notUrgent").some((p) => hasPhrase(s, p))) urgency = "later";
  }

  const concerns: Concern[] = [];
  for (const type of concernTypes) {
    const quote = firstMatch(said, everySignal(type));
    if (quote) concerns.push({ type, quote: clip(quote, 160) });
  }

  const buying = everySignal("buying");
  const signals = [...new Set(said.filter((s) => buying.some((p) => hasPhrase(s, p))).map((s) => clip(s, 160)))].slice(0, 4);

  const tokens = new Set(contentTokens(all));
  const service = input.services.find((name) => contentTokens(name).some((t) => tokens.has(t))) ?? null;
  const wants = service ?? (input.qualifierAnswers[0]?.a ? clip(input.qualifierAnswers[0].a, 80) : customer[0] ? clip(customer[0], 80) : null);

  const budget = findBudget(all);
  const intent: Intent =
    signals.length > 0 && urgency !== "later"
      ? "ready_to_book"
      : concerns.some((c) => c.type === "price" || c.type === "competitor")
        ? "comparing"
        : customer.length > 0
          ? "just_asking"
          : "unknown";

  const parts = [
    wants ? `Wants ${wants.replace(/[.!?]+$/, "")}` : "Has not said what they want yet",
    budget ? `budget ${budget}` : null,
    urgency !== "unknown" ? urgencyLabel[urgency].toLowerCase() : null,
  ].filter(Boolean);
  const summary = `${parts.join(", ")}.${concerns.length ? ` Raised ${concerns.map((c) => concernLabel[c.type]).join(" and ")}.` : ""}`;

  return { wants, urgency, budget, concerns, signals, intent, summary, nextStep: "" };
}

/** What the owner should do next, from the reading and the stage. Never an AI guess. */
export function nextStepFor(insight: Insight, ctx: { stage: string; heat: number; brain: Pick<BrandBrain, "objections"> }): string {
  const unanswered = insight.concerns.find((c) => !ctx.brain.objections[c.type]);
  if (["won", "lost"].includes(ctx.stage)) return "Nothing to do. This one is closed.";
  if (ctx.stage === "booked") return "Nothing to do until the appointment. Reminders are scheduled.";
  if (unanswered) return `Answer their concern about ${concernLabel[unanswered.type]} yourself. Then add your answer under Concerns in the brand brain, so the assistant can answer it next time.`;
  if (ctx.heat >= automationConfig.scoring.hot) return "Call them now. Hot leads go cold within hours.";
  if (ctx.stage === "handoff") return "Reply to them. The assistant has handed this conversation to you.";
  if (ctx.stage === "qualified") return "Offer them a time. They have answered every question.";
  if (insight.urgency === "later") return "No action needed. The follow ups will keep in touch.";
  return "Let the assistant keep going. You will be alerted if they get hot.";
}

export type ScoreFacts = {
  stage: string;
  answered: number;
  totalQualifiers: number;
  paidSource: boolean;
  customerMessages: number;
};

/** A heat score from 0 to 100 with the reasons, so the owner can see why. Weights live in config/automation.json. */
export function scoreLead(insight: Insight, facts: ScoreFacts): { heat: number; reasons: string[] } {
  const w = automationConfig.scoring.weights;
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    if (!points) return;
    score += points;
    reasons.push(`${points > 0 ? "+" : ""}${Math.round(points)} ${reason}`);
  };
  if (insight.urgency === "now") add(w.urgencyNow, "wants it today or tomorrow");
  else if (insight.urgency === "soon") add(w.urgencySoon, "wants it this week");
  else if (insight.urgency === "later") add(w.urgencyLater, "said there is no rush");
  if (insight.intent === "ready_to_book") add(w.readyToBook, "sounds ready to book");
  else if (insight.intent === "comparing") add(w.comparing, "is comparing options");
  else if (insight.intent === "just_asking") add(w.justAsking, "is only asking so far");
  if (insight.signals.length) add(Math.min(w.buyingSignalMax, insight.signals.length * w.buyingSignal), `buying signal${insight.signals.length === 1 ? "" : "s"} in their words`);
  if (insight.budget) add(w.budgetStated, "gave a budget");
  if (facts.totalQualifiers > 0 && facts.answered > 0) add((w.qualifiersAnswered * Math.min(facts.answered, facts.totalQualifiers)) / facts.totalQualifiers, `answered ${facts.answered} of ${facts.totalQualifiers} questions`);
  if (["qualified", "booked"].includes(facts.stage)) add(w.qualifiedStage, facts.stage === "booked" ? "has booked" : "is fully qualified");
  if (facts.paidSource) add(w.paidSource, "came from a paid ad");
  if (insight.concerns.length) add(w.concern * insight.concerns.length, `raised ${insight.concerns.length === 1 ? "a concern" : `${insight.concerns.length} concerns`}`);
  if (facts.customerMessages >= automationConfig.scoring.engagedMessages) add(w.engaged, "is engaged in the conversation");
  return { heat: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function heatBand(heat: number): "hot" | "warm" | "cold" {
  return heat >= automationConfig.scoring.hot ? "hot" : heat >= automationConfig.scoring.warm ? "warm" : "cold";
}

/** True when the words appear in what the customer wrote, ignoring case, accents and spacing. */
function customerSaid(customerText: string, quote: string): boolean {
  const q = normalise(quote).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  if (q.length < 3) return false;
  const t = normalise(customerText).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ");
  return t.includes(q);
}

/** Every number in the budget must be a number the customer typed, so the AI cannot invent one. */
export function budgetIsGrounded(budget: string, customerText: string): boolean {
  const said = new Set(findAmounts(customerText).map(amountValue).filter((v): v is number => v !== null));
  const nums = findAmounts(budget);
  return nums.length > 0 && nums.every((n) => {
    const v = amountValue(n);
    return v !== null && said.has(v);
  });
}

export type AiReading = Omit<Insight, "nextStep">;

/**
 * Keeps the AI's reading only where the customer's own words back it up. Anything unsupported falls back
 * to the rules reading. Concerns the rules found are always kept, so the AI can add but never hide one.
 */
export function mergeReadings(ai: AiReading, rules: Insight, customerText: string): Insight {
  const budget = ai.budget && budgetIsGrounded(ai.budget, customerText) ? ai.budget.trim() : rules.budget;
  const aiConcerns = ai.concerns
    .filter((c) => concernTypes.includes(c.type))
    .map((c) => ({ type: c.type, quote: customerSaid(customerText, c.quote) ? clip(c.quote, 160) : (rules.concerns.find((r) => r.type === c.type)?.quote ?? "") }))
    .filter((c) => c.quote);
  const concerns = [...aiConcerns, ...rules.concerns.filter((r) => !aiConcerns.some((a) => a.type === r.type))];
  const signals = [...new Set([...ai.signals.filter((s) => customerSaid(customerText, s)).map((s) => clip(s, 160)), ...rules.signals])].slice(0, 4);
  return {
    wants: ai.wants ? clip(ai.wants, 120) : rules.wants,
    urgency: ai.urgency,
    budget,
    concerns,
    signals,
    intent: ai.intent,
    summary: clip(ai.summary || rules.summary, 400),
    nextStep: "",
  };
}

/** True when a message is worth sending to the AI: not a one word "ok" or a STOP. */
export function worthReading(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < automationConfig.insight.minCustomerWords) return false;
  const t = normalise(text).replace(/[^\p{L}\p{N} ]/gu, "").trim();
  return !everyLanguage("optOutKeywords").some((k) => normalise(k) === t);
}
