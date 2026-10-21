"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; from: "visitor" | "business"; body: string; at: string };

type Props = {
  chatKey: string;
  businessName: string;
  title: string;
  subtitle: string;
  placeholder: string;
  pollSeconds: number;
  language?: string;
};

/** The host page and referrer the widget passed in, if any. Opened directly, the chat has neither. */
function pageContext(): { page?: string; referrer?: string } {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  return { page: q.get("page")?.slice(0, 600) || undefined, referrer: q.get("ref")?.slice(0, 300) || undefined };
}

function visitorId(chatKey: string): string {
  const storageKey = `ph_chat_${chatKey}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function ChatWindow({ chatKey, businessName, title, subtitle, placeholder, pollSeconds, language = "en" }: Props) {
  const [visitor, setVisitor] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => setVisitor(visitorId(chatKey)), [chatKey]);

  useEffect(() => {
    if (!visitor) return;
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat/${chatKey}?visitor=${visitor}`, { cache: "no-store" });
        if (res.ok && !stopped) setMessages((await res.json()).messages);
      } catch {
        // Try again on the next poll.
      }
    };
    load();
    const timer = setInterval(load, pollSeconds * 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [visitor, chatKey, pollSeconds]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !visitor || sending) return;
    setSending(true);
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, from: "visitor", body, at: new Date().toISOString() }]);
    setText("");
    try {
      const res = await fetch(`/api/chat/${chatKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitor, text: body, context: pageContext() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Your message was not sent.");
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message was not sent.");
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div lang={language} className="flex h-dvh flex-col bg-surface">
      <header className="flex items-center gap-3 bg-ink px-5 py-4 text-white">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold">
          {businessName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{businessName || title}</p>
          <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-white/60">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {subtitle}
          </p>
        </div>
      </header>

      <ol ref={listRef} aria-live="polite" className="flex-1 space-y-2 overflow-y-auto bg-paper px-4 py-5">
        {messages.length === 0 && (
          <li className="mx-auto max-w-[28ch] py-8 text-center text-sm text-ink-soft">Ask a question or tell us what you are looking for.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`flex ${m.from === "visitor" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[82%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-snug ${
                m.from === "visitor" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-line bg-surface text-ink"
              }`}
            >
              {m.body}
            </p>
          </li>
        ))}
        {sending && (
          <li className="flex justify-start" aria-label="Typing">
            <span className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
          </li>
        )}
      </ol>

      <form onSubmit={send} className="border-t border-line bg-surface p-3">
        {error && (
          <p role="alert" className="mb-2 px-1 text-sm text-accent-deep">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-text" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-text"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            placeholder={placeholder}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-paper px-4 py-2.5 text-[0.9375rem] focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
