// Used by the server's health checks and any free uptime monitor. Says only whether the app and database answer.
// Loading the config here means a version with broken settings fails its health check and is rolled back.
import { NextResponse } from "next/server";
import { automationConfig } from "@/lib/config";
import { globalQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!automationConfig.stages.length) throw new Error("No stages configured");
    await globalQuery("select 1");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
