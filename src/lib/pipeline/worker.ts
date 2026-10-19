// Runs due jobs until the time budget is spent. Called by the scheduled tick and, briefly, after
// customer messages, so active businesses keep moving even between ticks.
import { automationConfig } from "../config";
import { globalQuery } from "../db";
import { claimJobs, failJob, finishJob } from "../queue";
import { handlers, onGiveUp } from "./jobs";

export type WorkerSummary = { ran: number; done: number; retried: number; failed: number; weeklyQueued: number; ms: number };

export async function runDueJobs(opts: { budgetMs?: number; batchSize?: number; scheduleWeekly?: boolean } = {}): Promise<WorkerSummary> {
  const started = Date.now();
  const budget = opts.budgetMs ?? automationConfig.worker.budgetMs;
  const batch = opts.batchSize ?? automationConfig.worker.batchSize;
  const summary: WorkerSummary = { ran: 0, done: 0, retried: 0, failed: 0, weeklyQueued: 0, ms: 0 };

  if (opts.scheduleWeekly) {
    const { rows } = await globalQuery<{ n: number }>("select enqueue_weekly_checks() as n");
    summary.weeklyQueued = Number(rows[0]?.n ?? 0);
  }

  while (Date.now() - started < budget) {
    const jobs = await claimJobs(batch);
    if (jobs.length === 0) break;
    for (const job of jobs) {
      summary.ran++;
      try {
        const handler = handlers[job.kind];
        if (!handler) throw new Error(`No handler for job kind "${job.kind}"`);
        await handler(job);
        await finishJob(job);
        summary.done++;
      } catch (error) {
        const outcome = await failJob(job, error);
        if (outcome === "retry") summary.retried++;
        else {
          summary.failed++;
          await onGiveUp(job, error).catch((e) => console.error("Could not record a failed job", e));
        }
        console.error(`Job ${job.id} (${job.kind}) ${outcome}:`, error instanceof Error ? error.message : error);
      }
    }
  }
  summary.ms = Date.now() - started;
  return summary;
}
