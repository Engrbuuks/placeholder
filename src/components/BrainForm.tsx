"use client";

import { useActionState } from "react";
import { saveBrain, type StepState } from "@/app/actions/onboarding";
import { Field, FormError, Notice, SubmitButton } from "./ui";

export type BrainFormValues = {
  businessName: string;
  summary: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  services: string;
  faqs: string;
  tone: string;
  answers: Record<string, string>;
};

type Intake = { key: string; label: string; help: string; type: "text" | "textarea" };

export function BrainForm({
  values,
  intake,
  tones,
  confirmLabel,
}: {
  values: BrainFormValues;
  intake: Intake[];
  tones: { id: string; label: string }[];
  confirmLabel: string;
}) {
  const [state, action] = useActionState<StepState, FormData>(saveBrain, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.notice && <Notice>{state.notice}</Notice>}

      <section className="space-y-5 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-[1.6rem] tracking-[-0.03em]">The basics</h2>
        <Field label="Business name" name="businessName" defaultValue={values.businessName} required />
        <Field
          label="What you do"
          name="summary"
          multiline
          rows={3}
          help="Two plain sentences on what you offer and who for. Your assistant uses this to introduce you."
          defaultValue={values.summary}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Phone" name="phone" type="tel" defaultValue={values.phone} />
          <Field label="WhatsApp number" name="whatsapp" type="tel" defaultValue={values.whatsapp} />
          <Field label="Email" name="email" type="email" defaultValue={values.email} />
          <Field label="Opening hours" name="hours" placeholder="Mon to Fri 9am to 6pm, Sat 10am to 2pm" defaultValue={values.hours} />
        </div>
        <Field label="Address" name="address" defaultValue={values.address} />
      </section>

      <section className="space-y-5 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-[1.6rem] tracking-[-0.03em]">What you sell</h2>
        <Field
          label="Services and prices"
          name="services"
          multiline
          rows={6}
          help="One per line. Put a bar between the service and its price, for example: Consultation | ₦15,000. The assistant only quotes prices written here."
          defaultValue={values.services}
        />
        <Field
          label="Common questions"
          name="faqs"
          multiline
          rows={6}
          help="One per line, question then a bar then the answer. For example: Do you open on Sundays? | No, we open Monday to Saturday."
          defaultValue={values.faqs}
        />
      </section>

      {intake.length > 0 && (
        <section className="space-y-5 rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-[1.6rem] tracking-[-0.03em]">Details for your kind of business</h2>
          {intake.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              name={`answer_${f.key}`}
              help={f.help}
              multiline={f.type === "textarea"}
              rows={4}
              defaultValue={values.answers[f.key] ?? ""}
            />
          ))}
        </section>
      )}

      <section className="space-y-4 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-[1.6rem] tracking-[-0.03em]">How your assistant should sound</h2>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Tone</legend>
          {tones.map((t) => (
            <label
              key={t.id}
              className="cursor-pointer rounded-full border border-line bg-surface px-4 py-2 text-[0.9375rem] transition-colors hover:border-ink/30 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input type="radio" name="tone" value={t.id} defaultChecked={values.tone === t.id} className="sr-only" />
              {t.label}
            </label>
          ))}
        </fieldset>
      </section>

      <div className="flex flex-wrap gap-3 pt-2">
        <SubmitButton name="intent" value="confirm" pending="Saving">
          {confirmLabel}
        </SubmitButton>
        <SubmitButton name="intent" value="save" tone="quiet" pending="Saving">
          Save draft
        </SubmitButton>
      </div>
      <p className="font-mono text-xs leading-relaxed text-ink-soft">
        Confirming tells your assistant these facts are correct. It will never quote anything that is not written here.
      </p>
    </form>
  );
}
