// Meta calls this for every WhatsApp message and delivery update.
// GET answers Meta's one time verification. POST checks the signature, acknowledges at once,
// then handles each message. Duplicates from Meta's retries are ignored by message id.
import { after, NextResponse } from "next/server";
import { globalQuery, withTenant } from "@/lib/db";
import { parseWebhook, verifySignature } from "@/lib/channels/whatsapp";
import { safeEqual } from "@/lib/crypto";
import { automationConfig } from "@/lib/config";
import { handleInbound } from "@/lib/pipeline/engine";
import { runDueJobs } from "@/lib/pipeline/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const token = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") === "subscribe" && expected && safeEqual(token, expected)) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function workspaceFor(phoneNumberId: string): Promise<string | null> {
  const { rows } = await globalQuery<{ id: string | null }>("select workspace_for_whatsapp($1) as id", [phoneNumberId]);
  return rows[0]?.id ?? null;
}

const statusMap: Record<string, string> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { messages, statuses } = parseWebhook(body);

  after(async () => {
    for (const m of messages) {
      const workspaceId = await workspaceFor(m.phoneNumberId);
      if (!workspaceId) continue;
      try {
        await withTenant(workspaceId, (c) =>
          c.query("update channel_connections set last_event_at = now(), last_error = null where workspace_id = $1 and channel = 'whatsapp'", [workspaceId]),
        );
        await handleInbound({
          workspaceId,
          channel: "whatsapp",
          externalId: m.from,
          text: m.text,
          externalMessageId: m.id,
          name: m.name,
        });
      } catch (error) {
        console.error("WhatsApp message could not be handled", error instanceof Error ? error.message : error);
      }
    }
    for (const s of statuses) {
      const workspaceId = await workspaceFor(s.phoneNumberId);
      const next = statusMap[s.status];
      if (!workspaceId || !next) continue;
      await withTenant(workspaceId, (c) =>
        c.query(
          `update messages set status = $3, status_detail = coalesce($4, status_detail)
           where workspace_id = $1 and channel = 'whatsapp' and external_message_id = $2 and direction = 'out'
             and status not in ('read', 'failed')`,
          [workspaceId, s.id, next, s.error],
        ),
      );
    }
    await runDueJobs({ budgetMs: automationConfig.worker.inlineBudgetMs });
  });

  return NextResponse.json({ ok: true });
}
