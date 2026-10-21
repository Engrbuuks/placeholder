// The monthly AI allowance for each workspace. Every AI call, whether it answers, reads or writes, is reserved
// here first; once the month's calls are used, every feature falls back to its rules until the next month.
import type { PoolClient } from "pg";
import { automationConfig } from "./config";
import { logActivity } from "./activity";

export type AiUse = "ai_reply" | "ai_read" | "ai_followup";

/**
 * Reserves one Claude call against the workspace's monthly cap. Returns false once the cap is reached,
 * so the question goes to the owner instead. The owner is told once, when the last allowed call is used.
 */
export async function reserveAiCall(c: PoolClient, workspaceId: string, leadId: string | null): Promise<boolean> {
  const limit = automationConfig.ai.monthlyCallsPerWorkspace;
  if (limit <= 0) return false;
  const { rows } = await c.query<{ calls: number }>(
    `insert into ai_usage (workspace_id, month, calls)
     values ($1, date_trunc('month', now() at time zone 'utc')::date, 1)
     on conflict (workspace_id, month) do update set calls = ai_usage.calls + 1
     where ai_usage.calls < $2
     returning calls`,
    [workspaceId, limit],
  );
  if (rows.length === 0) return false;
  if (rows[0].calls === limit) {
    await logActivity(c, workspaceId, {
      leadId,
      kind: "ai_cap",
      summary: `AI reached this month's limit of ${limit} calls. Until next month, questions the rules cannot answer come to you, and leads are read and followed up by the rules.`,
    });
  }
  return true;
}


/** Records a used AI call in the usage ledger, by what it was used for. */
export async function recordAiUse(c: PoolClient, workspaceId: string, kind: AiUse) {
  await c.query("insert into usage_ledger (workspace_id, kind, units) values ($1, $2, 1)", [workspaceId, kind]);
}
