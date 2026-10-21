"use client";

import { useActionState, useState, useTransition } from "react";
import { campaignAction, type CampaignState } from "@/app/actions/campaigns";
import { FormError, Notice } from "./ui";

type SegmentOption = { id: "lost" | "quiet" | "customers" | "booked_no_show"; label: string; help: string };

const card =
  "group flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-ink/30 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)]";

export function CampaignForm({ segments, ideas }: { segments: SegmentOption[]; ideas: Record<SegmentOption["id"], string> }) {
  const [state, action] = useActionState<CampaignState, FormData>(campaignAction, {});
  const [pending, startTransition] = useTransition();
  const [segment, setSegment] = useState<SegmentOption["id"]>("quiet");
  const [message, setMessage] = useState(ideas.quiet);
  const [edited, setEdited] = useState(false);
  // Kept in state: React clears plain inputs after each form action, and "Check who gets it" is one.
  const [name, setName] = useState("");
  const [quietDays, setQuietDays] = useState("30");
  const p = state.preview;

  function pick(id: SegmentOption["id"]) {
    setSegment(id);
    if (!edited) setMessage(ideas[id]);
  }

  return (
    <form
      // Submitted by hand rather than with the action prop: React resets a form after an action runs,
      // which would put the group choice back to its first option between checking and sending.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(data));
      }}
      className="space-y-5"
    >
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <div>
        <label htmlFor="campaign-name" className="block text-[0.9375rem] font-medium">
          Name
        </label>
        <input
          id="campaign-name"
          name="name"
          required
          maxLength={80}
          placeholder="For example: October win back"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-ink focus:outline-none"
        />
      </div>
      <fieldset>
        <legend className="text-[0.9375rem] font-medium">Who gets it</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {segments.map((s) => (
            <label key={s.id} className={card}>
              <input type="radio" name="segment" value={s.id} checked={segment === s.id} onChange={() => pick(s.id)} className="mt-1 accent-[var(--color-accent)]" />
              <span>
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-[0.8125rem] text-ink-soft">{s.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {segment === "quiet" ? (
        <div className="max-w-xs">
          <label htmlFor="quiet-days" className="block text-[0.9375rem] font-medium">
            Quiet for at least (days)
          </label>
          <input id="quiet-days" name="quietDays" type="number" min={1} max={3650} value={quietDays} onChange={(e) => setQuietDays(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-ink focus:outline-none" />
        </div>
      ) : (
        <input type="hidden" name="quietDays" value="30" />
      )}
      <div>
        <label htmlFor="campaign-message" className="block text-[0.9375rem] font-medium">
          Message
        </label>
        <p className="mt-0.5 text-sm text-ink-soft">{"{firstName}"} becomes each person&apos;s first name. Ask one clear question; replies come to your inbox.</p>
        <textarea
          id="campaign-message"
          name="message"
          rows={4}
          maxLength={600}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setEdited(true);
          }}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-right font-mono text-[0.6875rem] text-ink-soft">{message.length} / 600</p>
      </div>

      {p && (
        <div className="space-y-3 rounded-xl bg-mist p-4">
          <p className="text-[0.9375rem]">
            <span className="text-2xl font-semibold tabular-nums">{p.reachable}</span> of {p.total} {p.total === 1 ? "person" : "people"} in this group can be messaged.
            {p.viaTemplate > 0 && ` ${p.viaTemplate} last wrote more than 24 hours ago on WhatsApp, so they get your approved template instead of this text.`}
            {p.viaEmail > 0 && ` ${p.viaEmail} will get it by email, with an unsubscribe link.`}
          </p>
          {p.skipped.length > 0 && (
            <ul className="space-y-1 text-sm text-ink-soft">
              {p.skipped.map((s) => (
                <li key={s.reason}>
                  {s.count} skipped: {s.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl bg-surface p-3 text-sm">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.04em] text-ink-soft">How it reads</p>
            <p className="mt-1">{p.sample}</p>
          </div>
          <input type="hidden" name="fingerprint" value={state.fingerprint ?? ""} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="check"
          disabled={pending}
          className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium hover:border-ink/30 disabled:opacity-60"
        >
          {pending ? "Working" : "Check who gets it"}
        </button>
        {p && p.reachable > 0 && (
          <button
            type="submit"
            name="intent"
            value="send"
            disabled={pending}
            className="rounded-full bg-accent px-5 py-2.5 text-[0.9375rem] font-medium text-white hover:bg-accent-deep disabled:opacity-60"
          >
            {`Send to ${p.reachable} ${p.reachable === 1 ? "person" : "people"}`}
          </button>
        )}
      </div>
      <p className="font-mono text-[0.6875rem] text-ink-soft">
        Sent in batches outside quiet hours. Anyone who opted out, was messaged by a campaign in the last week, or cannot legally be messaged first is left out.
      </p>
    </form>
  );
}
