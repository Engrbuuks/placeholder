"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";

const arrow = (
  <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function SubmitButton({
  children,
  pending,
  name,
  value,
  tone = "primary",
  busy: busyProp,
}: {
  children: React.ReactNode;
  pending?: string;
  name?: string;
  value?: string;
  tone?: "primary" | "dark" | "quiet";
  /** Set by forms that submit through useActionForm, where the browser's form status is not used. */
  busy?: boolean;
}) {
  const status = useFormStatus();
  const busy = busyProp ?? status.pending;
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-deep",
    dark: "bg-ink text-white hover:bg-ink/85",
    quiet: "border border-ink/20 bg-surface text-ink hover:border-ink/50",
  }[tone];
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={busy}
      aria-busy={busy}
      className={`inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[0.9375rem] font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${styles}`}
    >
      {busy && pending ? pending : children}
      {tone !== "quiet" && !busy && arrow}
    </button>
  );
}

export function Field({
  label,
  name,
  type = "text",
  help,
  defaultValue,
  autoComplete,
  required,
  multiline,
  rows = 4,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  help?: string;
  defaultValue?: string;
  autoComplete?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const id = `field_${name}`;
  const helpId = help ? `${id}_help` : undefined;
  const base =
    "mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-soft/50 transition-colors hover:border-ink/25 focus:border-ink focus:outline-none";
  return (
    <div>
      <label htmlFor={id} className="block text-[0.9375rem] font-medium">
        {label}
      </label>
      {help && (
        <p id={helpId} className="mt-0.5 text-sm text-ink-soft">
          {help}
        </p>
      )}
      {multiline ? (
        <textarea
          id={id}
          name={name}
          rows={rows}
          defaultValue={defaultValue}
          required={required}
          placeholder={placeholder}
          aria-describedby={helpId}
          className={base}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          aria-describedby={helpId}
          className={base}
        />
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex gap-3 rounded-xl bg-accent-wash px-4 py-3 text-ink">
      <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
      {message}
    </p>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-ink">
      <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ink" />
      {children}
    </p>
  );
}

/** A round icon button that submits its form and spins while the server works. */
export function RefreshButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-ink/40 disabled:cursor-wait"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`h-[18px] w-[18px] ${pending ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 8a7.5 7.5 0 1 0 1 6M19 3.5V8h-4.5" />
      </svg>
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={async (e) => {
        const button = e.currentTarget;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "Copied";
        } catch {
          button.textContent = "Select and copy";
        }
        setTimeout(() => (button.textContent = label), 1800);
      }}
      className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:border-ink/40"
    >
      {label}
    </button>
  );
}

export function SelectField({
  label,
  name,
  help,
  options,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  name: string;
  help?: string;
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const id = `field_${name}`;
  const helpId = help ? `${id}_help` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-[0.9375rem] font-medium">
        {label}
      </label>
      {help && (
        <p id={helpId} className="mt-0.5 text-sm text-ink-soft">
          {help}
        </p>
      )}
      <select
        id={id}
        name={name}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        aria-describedby={helpId}
        className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-ink/25 focus:border-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Like useActionState, but returns a submit handler instead of a form action. React clears every field of a
 * form after its action runs; this keeps what the person typed, so an error never wipes their work.
 */
export function useActionForm<S>(fn: (state: Awaited<S>, data: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, dispatch] = useActionState<S, FormData>(fn, initial);
  const [pending, startTransition] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
  return [state, onSubmit, pending] as const;
}
