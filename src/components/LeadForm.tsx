"use client";

import { useState } from "react";

const input = "mt-1.5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink focus:border-ink focus:outline-none";

export function LeadForm({ formKey, consentText }: { formKey: string; consentText: string }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams(window.location.search);
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/form/${formKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          phone: f.get("phone"),
          email: f.get("email"),
          message: f.get("message"),
          consent: f.get("consent") === "on",
          website: f.get("website"),
          context: { page: q.get("page") || window.location.href, referrer: q.get("ref") || document.referrer },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Your message was not sent. Please try again.");
      setThanks(data.thanks ?? "Thank you.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message was not sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (thanks) {
    return (
      <p role="status" className="mt-6 rounded-xl bg-mist px-4 py-4 text-[0.9375rem]">
        {thanks}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-accent-wash px-4 py-3 text-sm">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="lf-name" className="text-sm font-medium">
          Name
        </label>
        <input id="lf-name" name="name" required maxLength={80} autoComplete="name" className={input} />
      </div>
      <div>
        <label htmlFor="lf-phone" className="text-sm font-medium">
          Phone
        </label>
        <input id="lf-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className={input} />
      </div>
      <div>
        <label htmlFor="lf-email" className="text-sm font-medium">
          Email
        </label>
        <input id="lf-email" name="email" type="email" maxLength={200} autoComplete="email" className={input} />
      </div>
      <div>
        <label htmlFor="lf-message" className="text-sm font-medium">
          How can we help?
        </label>
        <textarea id="lf-message" name="message" rows={3} maxLength={1000} className={input} />
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="lf-website">Website</label>
        <input id="lf-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-[0.8125rem] text-ink-soft">
        <input type="checkbox" name="consent" className="mt-0.5 accent-[var(--color-accent)]" />
        {consentText}
      </label>
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-accent px-5 py-3 font-medium text-white hover:bg-accent-deep disabled:opacity-60"
      >
        {sending ? "Sending" : "Send"}
      </button>
    </form>
  );
}
