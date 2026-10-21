import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadAppPage } from "@/lib/shell";
import { relativeTime } from "@/lib/health";
import { channelsOverview } from "@/lib/inbox";
import { ensureWebchat } from "@/lib/webchat";
import { disconnectSms, disconnectWhatsApp, rotateWebchatKey } from "@/app/actions/pipeline";
import { AppShell } from "@/components/AppShell";
import { SmsForm, WhatsAppForm } from "@/components/AutomationForms";
import { automationConfig, markets } from "@/lib/config";
import { Icon } from "@/components/Icon";
import { CopyButton, SubmitButton } from "@/components/ui";

export const metadata: Metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function Check({ ok, label, fix }: { ok: boolean; label: string; fix: string }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${ok ? "bg-ink text-white" : "bg-accent-wash text-accent-deep"}`}>
        <Icon name={ok ? "check" : "alert"} className="h-3 w-3" />
      </span>
      <span className="text-sm">
        {label}
        {!ok && <span className="block text-[0.8125rem] text-ink-soft">{fix}</span>}
      </span>
    </li>
  );
}

export default async function ChannelsPage() {
  const { session, workspace, shell } = await loadAppPage();
  const key = await ensureWebchat(session.workspaceId);
  const [c, origin] = await Promise.all([channelsOverview(session.workspaceId), appOrigin()]);
  const lang = workspace.language !== "en" ? ` data-lang="${workspace.language}"` : "";
  const snippet = `<script src="${origin}/widget.js" data-key="${key}"${lang} async></script>`;
  const wa = c.whatsapp;
  const webhook = `${origin}/api/webhooks/whatsapp`;
  const smsWebhook = `${origin}/api/webhooks/sms`;
  const sms = c.sms;
  const market = workspace.country ? markets[workspace.country] : null;

  return (
    <AppShell {...shell} active="channels" title="Channels" subtitle="Where customers reach you, and where the assistant answers">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Web chat */}
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
                <Icon name="globe" className="h-[18px] w-[18px]" /> Web chat
              </h2>
              <p className="mt-1 text-[0.9375rem] text-ink-soft">A chat button on your website, answered by your assistant in seconds.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 font-mono text-xs text-white">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" /> Live
            </span>
          </div>

          <ol className="mt-6 space-y-5">
            <li>
              <p className="font-medium">1. Try it as a customer</p>
              <p className="text-sm text-ink-soft">Ask about a price, or say what you are looking for. Watch it arrive in your inbox.</p>
              <a
                href={`/chat/${key}`}
                target="_blank"
                rel="noopener"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-deep"
              >
                Open your chat <Icon name="send" className="h-3.5 w-3.5" />
              </a>
            </li>
            <li>
              <p className="font-medium">2. Add it to your website</p>
              <p className="text-sm text-ink-soft">Paste this just before the closing body tag on every page, or in your site builder&apos;s custom code box.</p>
              <div className="mt-2 rounded-xl bg-ink p-3">
                <code className="block break-all font-mono text-[0.75rem] leading-relaxed text-white/90">{snippet}</code>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <CopyButton text={snippet} label="Copy code" />
                <form action={rotateWebchatKey}>
                  <SubmitButton tone="quiet" pending="Changing">
                    Change key
                  </SubmitButton>
                </form>
              </div>
              <p className="mt-2 font-mono text-[0.6875rem] text-ink-soft">Changing the key stops the old code working. Only do it if the code was copied somewhere it should not be.</p>
            </li>
          </ol>
        </section>

        {/* WhatsApp */}
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
                <Icon name="chat" className="h-[18px] w-[18px]" /> WhatsApp
              </h2>
              <p className="mt-1 text-[0.9375rem] text-ink-soft">Your WhatsApp Business number, answered by the same assistant.</p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 font-mono text-xs ${
                wa?.has_secret ? "bg-ink text-white" : "border border-line text-ink-soft"
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${wa?.has_secret ? "bg-accent" : "bg-line"}`} />
              {wa?.has_secret ? "Connected" : "Not connected"}
            </span>
          </div>

          {wa?.has_secret && (
            <p className="mt-3 font-mono text-xs text-ink-soft">
              {wa.last_event_at ? `Last message received ${relativeTime(wa.last_event_at)}` : "No messages received yet"}
              {wa.last_error ? ` / ${wa.last_error}` : ""}
            </p>
          )}

          <div className="mt-5 rounded-xl border border-line p-4">
            <p className="text-sm font-medium">Server setup</p>
            <ul className="mt-3 space-y-2.5">
              <Check ok={c.ready.whatsappAppSecret} label="Meta app secret is set" fix="Set WHATSAPP_APP_SECRET on the server, so messages from Meta can be checked." />
              <Check ok={c.ready.whatsappVerifyToken} label="Webhook verify token is set" fix="Set WHATSAPP_VERIFY_TOKEN on the server to any long random value." />
              <Check ok={c.ready.encryption} label="Tokens are stored encrypted" fix="Set ENCRYPTION_KEY on the server: openssl rand -base64 32" />
            </ul>
            <p className="mt-4 text-sm font-medium">Webhook address for Meta</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-mist px-3 py-2 font-mono text-[0.75rem]">{webhook}</code>
              <CopyButton text={webhook} />
            </div>
            <p className="mt-1 font-mono text-[0.6875rem] text-ink-soft">Subscribe it to the messages field in your Meta app.</p>
          </div>

          <div className="mt-5">
            <WhatsAppForm
              phoneNumberId={wa?.external_account_id ?? ""}
              hasToken={Boolean(wa?.has_secret)}
              templateName={wa?.settings?.templateName ?? ""}
              templateLanguage={wa?.settings?.templateLanguage ?? "en"}
            />
          </div>
          {wa && (
            <form action={disconnectWhatsApp} className="mt-3">
              <SubmitButton tone="quiet" pending="Disconnecting">
                Disconnect WhatsApp
              </SubmitButton>
            </form>
          )}
        </section>

        {/* SMS */}
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
                <Icon name="phone" className="h-[18px] w-[18px]" /> SMS
              </h2>
              <p className="mt-1 text-[0.9375rem] text-ink-soft">Customers text your Twilio number and the same assistant answers. Best where texting is how people reach a business, such as the US and Canada.</p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 font-mono text-xs ${
                sms?.has_secret ? "bg-ink text-white" : "border border-line text-ink-soft"
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${sms?.has_secret ? "bg-accent" : "bg-line"}`} />
              {sms?.has_secret ? "Connected" : "Not connected"}
            </span>
          </div>
          {sms?.has_secret && (
            <p className="mt-3 font-mono text-xs text-ink-soft">
              {sms.external_account_id} / {sms.last_event_at ? `last text received ${relativeTime(sms.last_event_at)}` : "no texts received yet"}
              {sms.last_error ? ` / ${sms.last_error}` : ""}
            </p>
          )}
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <SmsForm accountSid={sms?.settings?.accountSid ?? ""} phoneNumber={sms?.external_account_id ?? ""} hasToken={Boolean(sms?.has_secret)} />
              {sms && (
                <form action={disconnectSms} className="mt-3">
                  <SubmitButton tone="quiet" pending="Disconnecting">
                    Disconnect SMS
                  </SubmitButton>
                </form>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-line p-4">
                <p className="text-sm font-medium">Webhook address for Twilio</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-mist px-3 py-2 font-mono text-[0.75rem]">{smsWebhook}</code>
                  <CopyButton text={smsWebhook} />
                </div>
                <p className="mt-1 font-mono text-[0.6875rem] text-ink-soft">In Twilio, open your number, and under Messaging set &quot;A message comes in&quot; to this address with HTTP POST.</p>
              </div>
              <div className="rounded-xl bg-mist p-4 text-sm">
                <p className="font-medium">Rules that apply automatically</p>
                <ul className="mt-2 space-y-1.5 text-ink-soft">
                  <li>Customers who text STOP (or ARRET, PARAR and the like) get nothing automatic again, on any channel, until they text START.</li>
                  <li>
                    No automatic texts between {automationConfig.quietHours.start}:00 and {automationConfig.quietHours.end}:00 in your time zone,{" "}
                    {workspace.timeZone.split("/").pop()!.replaceAll("_", " ")}.
                  </li>
                  <li>{market?.smsFollowUps ? `Follow up texts are allowed in ${market.name}.` : market?.smsNote || "Automated follow up texts are off. Replies and booking reminders still go out."}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
