import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { automationConfig } from "@/lib/config";
import { webchatBusinessName, workspaceForWebchat } from "@/lib/webchat";
import { ChatWindow } from "@/components/ChatWindow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function ChatPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const workspaceId = await workspaceForWebchat(key);
  if (!workspaceId) notFound();
  const businessName = await webchatBusinessName(workspaceId);
  const w = automationConfig.webchat;
  return (
    <ChatWindow chatKey={key} businessName={businessName} title={w.title} subtitle={w.subtitle} placeholder={w.placeholder} pollSeconds={w.pollSeconds} />
  );
}
