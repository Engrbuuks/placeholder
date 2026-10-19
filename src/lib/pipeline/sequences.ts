// Schedules timed messages from a niche pack's sequences.
import type { PoolClient } from "pg";
import { automationConfig, type Sequence } from "../config";
import { enqueue, cancelLeadJobs } from "../queue";
import { nextAllowedTime, previousAllowedTime } from "../time";
import type { Lead, WorkspaceContext } from "./context";

export function sequenceFor(ctx: WorkspaceContext, trigger: Sequence["trigger"]): Sequence | undefined {
  return ctx.pack.sequences.find((s) => s.trigger === trigger);
}

/** Schedules one step of a chained sequence (no reply, won), measured from a base time. */
export async function scheduleChainedStep(
  c: PoolClient,
  ctx: WorkspaceContext,
  lead: Pick<Lead, "id">,
  trigger: "no_reply" | "won",
  stepIndex: number,
  base: Date,
): Promise<Date | null> {
  const seq = sequenceFor(ctx, trigger);
  const step = seq?.steps[stepIndex];
  if (!seq || !step?.delayHours) return null;
  const runAt = nextAllowedTime(new Date(base.getTime() + step.delayHours * 3600_000), ctx.timeZone, automationConfig.quietHours);
  await enqueue(c, {
    workspaceId: ctx.workspaceId,
    kind: "followup",
    leadId: lead.id,
    runAt,
    dedupeKey: `seq:${lead.id}:${trigger}:${stepIndex}`,
    payload: { trigger, sequenceId: seq.id, stepIndex, scheduledAt: new Date().toISOString() },
  });
  return runAt;
}

/** Schedules every reminder before a booking. Reminders already in the past are left out. */
export async function scheduleBookingReminders(c: PoolClient, ctx: WorkspaceContext, lead: Pick<Lead, "id">, bookedFor: Date) {
  await cancelLeadJobs(c, lead.id, "booked");
  const seq = sequenceFor(ctx, "booked");
  if (!seq) return [];
  const scheduled: Date[] = [];
  for (const [i, step] of seq.steps.entries()) {
    if (!step.beforeHours) continue;
    const runAt = previousAllowedTime(new Date(bookedFor.getTime() - step.beforeHours * 3600_000), ctx.timeZone, automationConfig.quietHours);
    if (runAt.getTime() <= Date.now()) continue;
    await enqueue(c, {
      workspaceId: ctx.workspaceId,
      kind: "followup",
      leadId: lead.id,
      runAt,
      payload: { trigger: "booked", sequenceId: seq.id, stepIndex: i, bookedFor: bookedFor.toISOString(), scheduledAt: new Date().toISOString() },
    });
    scheduled.push(runAt);
  }
  return scheduled;
}
