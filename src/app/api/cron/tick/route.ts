// The scheduler's heartbeat. Vercel's daily cron and a free outside trigger (every minute) call this.
// It queues weekly checks that are due, then runs due jobs until the time budget is spent.
import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { globalQuery } from "@/lib/db";
import { runDueJobs } from "@/lib/pipeline/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}

async function tick(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const summary = await runDueJobs({ scheduleWeekly: true });
  const { rows } = await globalQuery("select * from queue_health()");
  return NextResponse.json({ ok: true, ...summary, queue: rows[0] });
}

export const GET = tick;
export const POST = tick;
