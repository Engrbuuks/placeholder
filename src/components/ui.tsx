"use client";

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
}: {
  children: React.ReactNode;
  pending?: string;
  name?: string;
  value?: string;
  tone?: "primary" | "dark" | "quiet";
}) {
  const status = useFormStatus();
  const busy = status.pending;
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
