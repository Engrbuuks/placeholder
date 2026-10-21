import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { automationConfig, localeFor } from "@/lib/config";
import { webchatBusiness, workspaceForWebchat } from "@/lib/webchat";
import { ChatWindow } from "@/components/ChatWindow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function ChatPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) notFound();
  const business = await webchatBusiness(workspaceId);
  const w = localeFor(business.language).webchat;
  return (
    <ChatWindow
      chatKey={key}
      businessName={business.name}
      title={w.title}
      subtitle={w.subtitle}
      placeholder={w.placeholder}
      pollSeconds={automationConfig.webchat.pollSeconds}
      language={business.language}
    />
  );
}
