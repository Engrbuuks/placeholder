// Owner alert emails through Resend. The key lives in the environment, never in the database.
// Without a key the email is logged instead of sent, so alerts still show in the app.
import type { PoolClient } from "pg";

export type EmailResult = { transport: "resend" | "logged"; status: "sent" | "failed" | "logged"; error?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  c: PoolClient,
  workspaceId: string,
  mail: { to: string; subject: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<EmailResult> {
  let result: EmailResult;
  if (!emailConfigured()) {
    result = { transport: "logged", status: "logged" };
  } else {
    try {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10000),
      });
      result = res.ok
        ? { transport: "resend", status: "sent" }
        : { transport: "resend", status: "failed", error: `Resend returned ${res.status}` };
    } catch (error) {
      result = { transport: "resend", status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  await c.query(
    "insert into email_log (workspace_id, to_address, subject, transport, status, error) values ($1, $2, $3, $4, $5, $6)",
    [workspaceId, mail.to, mail.subject.slice(0, 200), result.transport, result.status, result.error ?? null],
  );
  // Keep the log short: the last 200 sends per workspace.
  await c.query(
    `delete from email_log where workspace_id = $1 and id not in (
       select id from email_log where workspace_id = $1 order by id desc limit 200)`,
    [workspaceId],
  );
  return result;
}
