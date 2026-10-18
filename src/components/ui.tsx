"use client";

import { useFormStatus } from "react-dom";

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
  tone?: "primary" | "quiet";
}) {
  const status = useFormStatus();
  const busy = status.pending;
  const styles =
    tone === "primary"
      ? "bg-ink text-paper hover:bg-ink/90"
      : "border-2 border-ink/80 text-ink hover:bg-ink/5";
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={busy}
      aria-busy={busy}
      className={`rounded-full px-6 py-3 font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${styles}`}
    >
      {busy && pending ? pending : children}
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
    "mt-1.5 w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-soft/60 focus:border-ink focus:outline-none";
  return (
    <div>
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      {help && (
        <p id={helpId} className="text-sm text-ink-soft">
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
    <p role="alert" className="rounded-xl border-l-4 border-leak bg-leak-wash px-4 py-3 text-ink">
      {message}
    </p>
  );
}
