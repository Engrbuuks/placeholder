"use client";

import { useEffect, useRef } from "react";
import { deleteCustomerAction, replyAction, stageAction, type ActionState } from "@/app/actions/pipeline";
import { FormError, Notice, SubmitButton, useActionForm } from "./ui";

export function ReplyBox({ leadId, channelLabel }: { leadId: string; channelLabel: string }) {
  const [state, action, pending] = useActionForm<ActionState>(replyAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.notice === "Sent.") ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={action} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <FormError message={state.error} />
      {state.notice && state.notice !== "Sent." && <Notice>{state.notice}</Notice>}
      <label htmlFor="reply-text" className="sr-only">
        Reply
      </label>
      <textarea
        id="reply-text"
        name="text"
        rows={3}
        required
        placeholder={`Reply on ${channelLabel}. The assistant pauses while you handle this.`}
        className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-[0.9375rem] focus:border-ink focus:outline-none"
      />
      <div className="flex justify-end">
        <SubmitButton busy={pending} tone="dark" pending="Sending">
          Send reply
        </SubmitButton>
      </div>
    </form>
  );
}

export function StageForm({ leadId, defaultBookedFor, currency }: { leadId: string; defaultBookedFor: string; currency: string }) {
  const [state, action, pending] = useActionForm<ActionState>(stageAction, {});
  return (
    <div className="space-y-3">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}
      <form onSubmit={action} className="space-y-2">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="stage" value="booked" />
        <label htmlFor="booked-for" className="block text-sm font-medium">
          Booked for
        </label>
        <input
          id="booked-for"
          type="datetime-local"
          name="bookedFor"
          required
          defaultValue={defaultBookedFor}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
        />
        <SubmitButton busy={pending} tone="primary" pending="Saving">
          Mark booked
        </SubmitButton>
        <p className="font-mono text-[0.6875rem] text-ink-soft">Reminders are scheduled before this time.</p>
      </form>
      <form onSubmit={action} className="space-y-2 border-t border-line pt-3">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="stage" value="won" />
        <label htmlFor="sale-value" className="block text-sm font-medium">
          Sale value <span className="font-normal text-ink-soft">(optional, for your results)</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-ink-soft">{currency}</span>
          <input
            id="sale-value"
            name="value"
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
          />
        </div>
        <SubmitButton busy={pending} tone="dark" pending="Saving">
          Mark won
        </SubmitButton>
      </form>
      <div className="flex gap-2">
        <form onSubmit={action}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="stage" value="lost" />
          <SubmitButton busy={pending} tone="quiet" pending="Saving">
            Mark lost
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

/** Keeps a conversation scrolled to its newest message. */
export function ScrollToEnd({ targetId, signal }: { targetId: string; signal: number }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.scrollTop = el.scrollHeight;
  }, [targetId, signal]);
  return null;
}

export function DeleteCustomerForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionForm<ActionState>(deleteCustomerAction, {});
  return (
    <form onSubmit={action} className="space-y-3">
      <FormError message={state.error} />
      <input type="hidden" name="leadId" value={leadId} />
      <label className="flex cursor-pointer items-start gap-2 text-[0.8125rem] text-ink-soft">
        <input type="checkbox" name="confirm" value="yes" className="mt-0.5 accent-[var(--color-accent)]" />
        Permanently delete this customer, their messages and anything scheduled for them. This cannot be undone.
      </label>
      <SubmitButton busy={pending} tone="quiet" pending="Deleting">
        Delete customer data
      </SubmitButton>
    </form>
  );
}
