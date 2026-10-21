import { after, NextResponse } from "next/server";
import { automationConfig, localeFor } from "@/lib/config";
import { clientIp, overLimit } from "@/lib/auth";
import { attributionFromPage } from "@/lib/attribution";
import { leadFormSchema, submitLeadForm } from "@/lib/leadForm";
import { webchatBusiness, workspaceForWebchat } from "@/lib/webchat";
import { runDueJobs } from "@/lib/pipeline/worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) return NextResponse.json({ error: "This form is not active." }, { status: 404 });
  const ip = await clientIp();
  if (await overLimit(`form-ip:${ip}`, automationConfig.webchat.maxMessagesPerMinute, 1)) {
    return NextResponse.json({ error: "Too many tries. Please wait a minute and send again." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = leadFormSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // A filled honeypot gets the same thanks as a person, so bots learn nothing.
    if (issue.message === "Spam") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: issue.message }, { status: 400 });
  }
  const context = (body?.context ?? {}) as { page?: unknown; referrer?: unknown };
  const attribution = attributionFromPage(typeof context.page === "string" ? context.page : null, typeof context.referrer === "string" ? context.referrer : null);
  await submitLeadForm(workspaceId, parsed.data, attribution);
  after(() => runDueJobs({ budgetMs: automationConfig.worker.inlineBudgetMs }));
  const business = await webchatBusiness(workspaceId);
  return NextResponse.json({ ok: true, thanks: localeFor(business.language).assistant.formThanks });
}
