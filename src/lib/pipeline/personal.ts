// Personal follow ups. When a customer goes quiet, the AI rewrites the planned follow up so it speaks to what
// they actually asked about, and can offer real free times from the booking calendar.
// Every draft is checked before it is used: money, clock times, weekdays and links must all come from the
// business's own facts or calendar. If any check fails, or AI is off or used up, the plain template is sent.
import type { PoolClient } from "pg";
import { automationConfig } from "../config";
import { aiEnabled, writeFollowUpWithAi } from "../ai";
import { recordAiUse, reserveAiCall } from "../aiUsage";
import { bookingLinkFor, nextFreeTimes } from "../booking";
import { concernLabel, type Insight } from "../insight";
import { factsText, normalise, pricesAreGrounded } from "./assistant";
import type { Lead, WorkspaceContext } from "./context";

// Weekday names and short forms in every language we ship, mapped to 0 (Sunday) to 6.
const weekdayWords: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
  segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5,
};
function weekdaysIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const word of normalise(text).split(/[^\p{L}]+/u)) if (word in weekdayWords) out.add(weekdayWords[word]);
  return out;
}

/** Clock times as minutes after midnight: "10:30", "10.30 am", "3pm", "15h30" and "15h". */
export function clockTimesIn(text: string): Set<number> {
  const out = new Set<number>();
  const re = /\b(\d{1,2})(?:([:.h])(\d{2})?)?\s?(am|pm|a\.m\.|p\.m\.)?(?![\p{L}\d])/giu;
  for (const m of text.matchAll(re)) {
    const [, h, sep, mins, ampm] = m;
    if (!sep && !ampm) continue; // a bare number is not a time
    if ((sep === ":" || sep === ".") && !mins) continue;
    let hour = Number(h);
    const minute = Number(mins ?? 0);
    if (hour > 24 || minute > 59) continue;
    const suffix = ampm?.toLowerCase().replace(/\./g, "");
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    out.add(hour * 60 + minute);
  }
  return out;
}

export type DraftCheck = { ok: true } | { ok: false; reason: string };

/** Checks an AI written message against what the business has actually said and what the calendar holds. */
export function checkWrittenMessage(message: string, allowed: { facts: string; freeTimes: string[]; links: string[]; maxLength: number }): DraftCheck {
  const text = message.trim();
  if (!text) return { ok: false, reason: "it was empty" };
  if (text.length > allowed.maxLength) return { ok: false, reason: "it was too long" };
  if (/[{}]/.test(text)) return { ok: false, reason: "it left a template gap unfilled" };
  if (!pricesAreGrounded(text, allowed.facts)) return { ok: false, reason: "it mentioned a price you never wrote down" };
  const knownText = `${allowed.facts}\n${allowed.freeTimes.join("\n")}`;
  const knownTimes = clockTimesIn(knownText);
  for (const t of clockTimesIn(text)) if (!knownTimes.has(t)) return { ok: false, reason: "it offered a time that is not free in your calendar" };
  const knownDays = weekdaysIn(knownText);
  for (const d of weekdaysIn(text)) if (!knownDays.has(d)) return { ok: false, reason: "it named a day that is not free in your calendar" };
  const links = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  for (const raw of links) {
    const link = raw.replace(/[.,;:!?]+$/, "");
    if (!allowed.links.includes(link) && !allowed.facts.includes(link)) return { ok: false, reason: "it included a link that is not yours" };
  }
  return { ok: true };
}

export type PersonalResult = { body: string; aiWritten: boolean; note: string | null };

/**
 * Returns the follow up to send: the AI's personal version when it passes every check, or the template.
 * The note says why the template was used, for the activity log.
 */
export async function personalFollowUp(
  c: PoolClient,
  ctx: WorkspaceContext,
  lead: Pick<Lead, "id" | "stage"> & { insight?: Insight | null },
  trigger: "no_reply" | "booked" | "won",
  template: string,
): Promise<PersonalResult> {
  const plain = (note: string | null): PersonalResult => ({ body: template, aiWritten: false, note });
  if (!aiEnabled() || !(automationConfig.ai.personaliseTriggers as string[]).includes(trigger)) return plain(null);

  const { rows } = await c.query<{ direction: "in" | "out"; body: string }>(
    `select direction, body from messages where lead_id = $1 and status not in ('discarded', 'pending_approval', 'failed', 'skipped')
     order by created_at desc, id desc limit $2`,
    [lead.id, automationConfig.insight.recentMessages],
  );
  const conversation = rows.reverse().map((r) => ({ from: r.direction === "in" ? ("customer" as const) : ("business" as const), text: r.body }));
  if (!conversation.some((t) => t.from === "customer")) return plain(null); // nothing to make it personal with

  if (!(await reserveAiCall(c, ctx.workspaceId, lead.id))) return plain("AI allowance used for this month, so the standard follow up was sent");

  const link = await bookingLinkFor(c, ctx, lead.id);
  const freeTimes = link ? await nextFreeTimes(c, ctx, automationConfig.ai.freeTimesOffered) : [];
  const facts = factsText(ctx.brain, ctx.pack);
  const maxLength = automationConfig.assistant.maxReplyLength;
  const draft = await writeFollowUpWithAi({
    businessName: ctx.businessName,
    tone: ctx.brain.tone,
    compliance: ctx.pack.compliance,
    template,
    facts,
    conversation,
    wants: lead.insight?.wants ?? null,
    concerns: (lead.insight?.concerns ?? []).map((x) => concernLabel[x.type]),
    bookingLink: link,
    freeTimes,
    maxLength,
  });
  if (!draft) return plain("The AI did not answer, so the standard follow up was sent");
  const check = checkWrittenMessage(draft, { facts, freeTimes, links: link ? [link] : [], maxLength });
  if (!check.ok) return plain(`The AI draft was not used because ${check.reason}. The standard follow up was sent`);
  await recordAiUse(c, ctx.workspaceId, "ai_followup");
  return { body: draft, aiWritten: true, note: null };
}
