// The web chat widget talks to this endpoint. GET collects new messages; POST sends one.
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { automationConfig } from "@/lib/config";
import { isUuid } from "@/lib/db";
import { overLimit, clientIp } from "@/lib/auth";
import { visitorMessages, workspaceForWebchat } from "@/lib/webchat";
import { handleInbound } from "@/lib/pipeline/engine";
import { runDueJobs } from "@/lib/pipeline/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ key: string }> };

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request, { params }: Params) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const visitor = new URL(request.url).searchParams.get("visitor") ?? "";
  if (!isUuid(visitor)) return NextResponse.json({ messages: [] }, { headers: noStore });
  return NextResponse.json({ messages: await visitorMessages(workspaceId, visitor) }, { headers: noStore });
}

const sendSchema = z.object({
  visitor: z.string().refine(isUuid, "Invalid visitor"),
  text: z.string().trim().min(1).max(automationConfig.webchat.maxMessageLength),
  name: z.string().trim().max(80).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message is empty or too long." }, { status: 400 });

  const limit = automationConfig.webchat.maxMessagesPerMinute;
  const ip = await clientIp();
  if ((await overLimit(`chat:${parsed.data.visitor}`, limit, 1)) || (await overLimit(`chat-ip:${ip}`, limit * 4, 1))) {
    return NextResponse.json({ error: "You are sending messages very quickly. Please wait a moment." }, { status: 429 });
  }

  await handleInbound({
    workspaceId,
    channel: "webchat",
    externalId: parsed.data.visitor,
    text: parsed.data.text,
    name: parsed.data.name ?? null,
  });
  after(() => runDueJobs({ budgetMs: automationConfig.worker.inlineBudgetMs }));
  return NextResponse.json({ messages: await visitorMessages(workspaceId, parsed.data.visitor) }, { headers: noStore });
}
