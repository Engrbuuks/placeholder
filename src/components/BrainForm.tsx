"use client";

import { useActionState } from "react";
import { saveBrain, type StepState } from "@/app/actions/onboarding";
import { Field, FormError, SubmitButton } from "./ui";

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
    <form action={action} className="space-y-10">
      <FormError message={state.error} />
      {state.notice && (
        <p role="status" className="rounded-xl border-l-4 border-signal bg-signal-wash px-4 py-3">
          {state.notice}
        </p>
      )}

      <section className="space-y-5">
        <h2 className="text-2xl font-bold">The basics</h2>
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

      <section className="space-y-5">
        <h2 className="text-2xl font-bold">What you sell</h2>
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
        <section className="space-y-5">
          <h2 className="text-2xl font-bold">Details for your kind of business</h2>
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

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">How your assistant should sound</h2>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Tone</legend>
          {tones.map((t) => (
            <label
              key={t.id}
              className="cursor-pointer rounded-full border-2 border-line bg-surface px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-signal-wash"
            >
              <input type="radio" name="tone" value={t.id} defaultChecked={values.tone === t.id} className="sr-only" />
              {t.label}
            </label>
          ))}
        </fieldset>
      </section>

      <div className="flex flex-wrap gap-4 border-t-2 border-line pt-6">
        <SubmitButton name="intent" value="confirm" pending="Saving">
          {confirmLabel}
        </SubmitButton>
        <SubmitButton name="intent" value="save" tone="quiet" pending="Saving">
          Save draft
        </SubmitButton>
      </div>
      <p className="text-sm text-ink-soft">
        Confirming tells your assistant these facts are correct. It will never quote anything that is not written here.
      </p>
    </form>
  );
}
