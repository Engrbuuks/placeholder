"use client";

import { useActionState } from "react";
import { saveAutomationSettings, saveMissedCalls, saveReviewSettings, saveSms, saveWhatsApp, type ActionState } from "@/app/actions/pipeline";
import { Field, FormError, Notice, SelectField, SubmitButton } from "./ui";

type Settings = { enabled: boolean; approvalMode: "auto" | "approve"; alertEmail: string | null; weeklyCheck: boolean };

function Toggle({ name, label, help, defaultChecked }: { name: string; label: string; help: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-ink-soft">{help}</span>
      </span>
      <span className="relative mt-1 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

type Choice = { value: string; label: string };

export function AutomationSettingsForm({
  settings,
  ownerEmail,
  local,
}: {
  settings: Settings;
  ownerEmail: string;
  local: { timeZone: string; timeZones: Choice[]; language: string; languages: Choice[] };
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveAutomationSettings, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <div className="divide-y divide-line">
        <Toggle name="enabled" label="Automations on" help="Instant replies, qualifying questions, follow ups and reminders." defaultChecked={settings.enabled} />
        <Toggle
          name="weeklyCheck"
          label="Weekly check"
          help="Check your business again every week and alert you if the score drops or a new leak appears."
          defaultChecked={settings.weeklyCheck}
        />
      </div>
      <fieldset>
        <legend className="font-medium">Follow ups</legend>
        <p className="text-sm text-ink-soft">Instant replies always go out straight away. This only affects timed follow ups and reminders.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { v: "auto", t: "Send automatically", d: "Fastest. You can pause any conversation." },
            { v: "approve", t: "Wait for my approval", d: "Each follow up waits in your inbox." },
          ].map((o) => (
            <label
              key={o.v}
              className="cursor-pointer rounded-xl border border-line p-3 transition-colors hover:border-ink/30 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)]"
            >
              <input type="radio" name="approvalMode" value={o.v} defaultChecked={settings.approvalMode === o.v} className="sr-only" />
              <span className="block text-sm font-medium">{o.t}</span>
              <span className="block text-[0.8125rem] text-ink-soft">{o.d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        {local.timeZones.length > 1 ? (
          <SelectField label="Time zone" name="timeZone" help="Quiet hours and reminder times follow this." options={local.timeZones} defaultValue={local.timeZone} />
        ) : (
          <div>
            <p className="text-[0.9375rem] font-medium">Time zone</p>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">{local.timeZones[0]?.label ?? "Set your country first"}</p>
          </div>
        )}
        {local.languages.length > 1 ? (
          <SelectField label="Assistant language" name="language" help="For greetings, handovers and the chat window." options={local.languages} defaultValue={local.language} />
        ) : (
          <div>
            <p className="text-[0.9375rem] font-medium">Assistant language</p>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">{local.languages[0]?.label ?? "English"}</p>
          </div>
        )}
      </div>
      <Field
        label="Send alerts to"
        name="alertEmail"
        type="email"
        help={`Leave empty to use your login email, ${ownerEmail}.`}
        defaultValue={settings.alertEmail ?? ""}
      />
      <SubmitButton pending="Saving">Save settings</SubmitButton>
    </form>
  );
}

export function WhatsAppForm({
  phoneNumberId,
  hasToken,
  templateName,
  templateLanguage,
}: {
  phoneNumberId: string;
  hasToken: boolean;
  templateName: string;
  templateLanguage: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveWhatsApp, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <Field label="Phone number ID" name="phoneNumberId" help="From Meta: WhatsApp, then API setup." defaultValue={phoneNumberId} required />
      <Field
        label="Permanent access token"
        name="token"
        type="password"
        autoComplete="off"
        help={hasToken ? "A token is saved and stays hidden. Paste a new one only to replace it." : "From a Meta system user with WhatsApp permissions. Stored encrypted."}
        required={!hasToken}
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field
          label="Follow up template (optional)"
          name="templateName"
          help="An approved template whose first variable is the customer's first name. Used after the 24 hour reply window closes."
          defaultValue={templateName}
        />
        <Field label="Language" name="templateLanguage" defaultValue={templateLanguage || "en"} />
      </div>
      <SubmitButton pending="Saving">Save WhatsApp</SubmitButton>
    </form>
  );
}

export function SmsForm({ accountSid, phoneNumber, hasToken }: { accountSid: string; phoneNumber: string; hasToken: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveSms, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <Field label="Twilio number" name="phoneNumber" help="The number customers text, with the country code, for example +14155550123." defaultValue={phoneNumber} required />
      <Field label="Account SID" name="accountSid" help="On your Twilio console home page. Starts with AC." defaultValue={accountSid} required />
      <Field
        label="Auth token"
        name="smsToken"
        type="password"
        autoComplete="off"
        help={hasToken ? "A token is saved and stays hidden. Paste a new one only to replace it." : "Under Account Info in your Twilio console. Stored encrypted, and used to check that texts really come from Twilio."}
        required={!hasToken}
      />
      <SubmitButton pending="Saving">Save SMS</SubmitButton>
    </form>
  );
}

export function ReviewSettingsForm({ enabled, link, delayHours }: { enabled: boolean; link: string; delayHours: number }) {
  const [state, action] = useActionState<ActionState, FormData>(saveReviewSettings, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <Toggle
        name="reviewEnabled"
        label="Ask for a rating after a sale"
        help="When you mark a customer as won, they are asked for a rating from 1 to 5. A 4 or 5 gets your review link; 1 to 3 comes privately to you."
        defaultChecked={enabled}
      />
      <Field
        label="Your review link"
        name="reviewLink"
        type="url"
        help="On Google: open your Business Profile, choose Ask for reviews, and copy the link. Any https review page works."
        defaultValue={link}
        placeholder="https://g.page/r/..."
      />
      <div className="max-w-[12rem]">
        <Field label="Ask after (hours)" name="reviewDelayHours" type="number" defaultValue={String(delayHours)} />
      </div>
      <SubmitButton pending="Saving">Save reviews</SubmitButton>
    </form>
  );
}

export function MissedCallForm({ enabled, forwardTo, smsReady }: { enabled: boolean; forwardTo: string; smsReady: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveMissedCalls, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      {!smsReady && <p className="rounded-xl bg-accent-wash px-4 py-3 text-sm">Connect SMS above first: the text back goes out from your Twilio number.</p>}
      <Toggle
        name="missedCallEnabled"
        label="Text back missed calls"
        help="Calls to your Twilio number ring your phone. If nobody answers, the caller gets a text at once and the conversation starts in your inbox."
        defaultChecked={enabled}
      />
      <Field label="Phone to ring" name="forwardTo" help="Your business mobile or landline, with the country code." defaultValue={forwardTo} placeholder="+13125550100" />
      <SubmitButton pending="Saving">Save missed calls</SubmitButton>
    </form>
  );
}
