import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localeFor } from "@/lib/config";
import { render } from "@/lib/templates";
import { webchatBusiness, workspaceForWebchat } from "@/lib/webchat";
import { LeadForm } from "@/components/LeadForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact", robots: { index: false } };

export default async function LeadFormPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) notFound();
  const business = await webchatBusiness(workspaceId);
  const t = localeFor(business.language).assistant;
  return (
    <main lang={business.language} className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{business.name}</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">{t.formIntro}</p>
        <LeadForm formKey={key} consentText={render(t.formConsent, { businessName: business.name })} />
      </div>
    </main>
  );
}
