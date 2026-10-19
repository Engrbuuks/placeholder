// A job queue in Postgres. Jobs are written inside tenant transactions; the worker claims due jobs
// across all workspaces through one narrow database function, then runs each inside its own tenant.
import type { PoolClient } from "pg";
import { automationConfig } from "./config";
import { globalQuery, withTenant } from "./db";

export type JobKind = "followup" | "deliver" | "email" | "weekly_check";

export type ClaimedJob = {
  id: number;
  workspace_id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  lead_id: string | null;
  attempts: number;
  max_attempts: number;
};

export async function enqueue(
  c: PoolClient,
  job: {
    workspaceId: string;
    kind: JobKind;
    payload?: Record<string, unknown>;
    runAt?: Date;
    leadId?: string | null;
    dedupeKey?: string;
    maxAttempts?: number;
  },
): Promise<number | null> {
  const { rows } = await c.query<{ id: number }>(
    `insert into jobs (workspace_id, kind, payload, run_at, lead_id, dedupe_key, max_attempts)
     values ($1, $2, $3, coalesce($4, now()), $5, $6, $7)
     on conflict (workspace_id, dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
     returning id`,
    [
      job.workspaceId,
      job.kind,
      JSON.stringify(job.payload ?? {}),
      job.runAt ?? null,
      job.leadId ?? null,
      job.dedupeKey ?? null,
      job.maxAttempts ?? automationConfig.retry.maxAttempts,
    ],
  );
  return rows[0]?.id ?? null;
}

/** Cancels queued jobs for a lead, optionally only those from one sequence trigger. */
export async function cancelLeadJobs(c: PoolClient, leadId: string, trigger?: string): Promise<number> {
  const res = await c.query(
    `update jobs set status = 'cancelled', finished_at = now()
     where lead_id = $1 and status = 'queued' and kind = 'followup' and ($2::text is null or payload->>'trigger' = $2)`,
    [leadId, trigger ?? null],
  );
  return res.rowCount ?? 0;
}

export async function claimJobs(limit: number): Promise<ClaimedJob[]> {
  const { rows } = await globalQuery<ClaimedJob>("select * from claim_jobs($1)", [limit]);
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export async function finishJob(job: ClaimedJob) {
  await withTenant(job.workspace_id, (c) =>
    c.query("update jobs set status = 'done', finished_at = now(), locked_at = null, last_error = null where id = $1", [job.id]),
  );
}

/** Backs off exponentially: 2, 4, 8, 16 minutes by default. Gives up after max attempts. */
export async function failJob(job: ClaimedJob, error: unknown): Promise<"retry" | "failed"> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const giveUp = job.attempts >= job.max_attempts || (error instanceof PermanentError);
  const minutes = automationConfig.retry.baseMinutes * 2 ** Math.max(0, job.attempts - 1);
  await withTenant(job.workspace_id, (c) =>
    c.query(
      giveUp
        ? "update jobs set status = 'failed', last_error = $2, finished_at = now(), locked_at = null where id = $1"
        : "update jobs set status = 'queued', last_error = $2, locked_at = null, run_at = now() + make_interval(mins => $3) where id = $1",
      giveUp ? [job.id, message] : [job.id, message, minutes],
    ),
  );
  return giveUp ? "failed" : "retry";
}

/** An error that retrying will not fix, such as a missing connection. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}
