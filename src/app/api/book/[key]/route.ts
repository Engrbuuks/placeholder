import { NextResponse } from "next/server";
import { automationConfig } from "@/lib/config";
import { clientIp, overLimit } from "@/lib/auth";
import { attributionFromPage } from "@/lib/attribution";
import { bookingRequestSchema, bookSlot } from "@/lib/booking";
import { workspaceForWebchat } from "@/lib/webchat";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) return NextResponse.json({ error: "This booking page is not active." }, { status: 404 });
  if (await overLimit(`book-ip:${await clientIp()}`, automationConfig.webchat.maxMessagesPerMinute, 1)) {
    return NextResponse.json({ error: "Too many tries. Please wait a minute." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = bookingRequestSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const ctxIn = (body?.context ?? {}) as { page?: unknown; referrer?: unknown };
  const attribution = attributionFromPage(typeof ctxIn.page === "string" ? ctxIn.page : null, typeof ctxIn.referrer === "string" ? ctxIn.referrer : null);
  const result = await bookSlot(workspaceId, parsed.data, attribution);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, when: result.when, manage: `/b/manage/${result.manageToken}` });
}
