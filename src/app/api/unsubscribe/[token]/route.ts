// One click unsubscribe, as mail apps send it from the List-Unsubscribe header (RFC 8058).
import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const done = await unsubscribe(token);
  return done ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This link is not valid." }, { status: 404 });
}
