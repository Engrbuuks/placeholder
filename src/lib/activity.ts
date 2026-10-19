// The activity log: one line for every automated step, so owners can see exactly what ran and why.
// Notifications are the subset the owner should be told about; important ones are also emailed.
import type { PoolClient } from "pg";
import { enqueue } from "./queue";

export async function logActivity(
  c: PoolClient,
  workspaceId: string,
  entry: { leadId?: string | null; kind: string; summary: string; detail?: Record<string, unknown> },
) {
  await c.query("insert into activity (workspace_id, lead_id, kind, summary, detail) values ($1, $2, $3, $4, $5)", [
    workspaceId,
    entry.leadId ?? null,
    entry.kind,
    entry.summary.slice(0, 300),
    JSON.stringify(entry.detail ?? {}),
  ]);
}

export async function notify(
  c: PoolClient,
  workspaceId: string,
  n: { kind: string; title: string; body?: string; link?: string; email?: boolean },
) {
  await c.query("insert into notifications (workspace_id, kind, title, body, link) values ($1, $2, $3, $4, $5)", [
    workspaceId,
    n.kind,
    n.title.slice(0, 200),
    (n.body ?? "").slice(0, 1000),
    n.link ?? null,
  ]);
  if (n.email) {
    const { rows } = await c.query<{ alert_email: string | null }>(
      "select alert_email from automation_settings where workspace_id = $1",
      [workspaceId],
    );
    let to = rows[0]?.alert_email ?? null;
    if (!to) {
      const owner = await c.query<{ email: string }>(
        `select u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = $1 and m.role = 'owner' order by m.created_at limit 1`,
        [workspaceId],
      );
      to = owner.rows[0]?.email ?? null;
    }
    if (to) {
      await enqueue(c, {
        workspaceId,
        kind: "email",
        payload: {
          to,
          subject: n.title,
          text: [n.body ?? "", n.link ? `Open: ${new URL(n.link, process.env.APP_URL || "http://localhost:3000").toString()}` : ""]
            .filter(Boolean)
            .join("\n\n"),
        },
      });
    }
  }
}
