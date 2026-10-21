"use client";


import { saveBrain, type StepState } from "@/app/actions/onboarding";
import { Field, FormError, Notice, SubmitButton, useActionForm } from "./ui";

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
  objections: { price: string; trust: string; timing: string; competitor: string };
};

const concernFields = [
  { key: "price", label: "When they say it costs too much", example: "We understand. The price includes everything, with no extra fees, and you can spread it over 6 months." },
  { key: "trust", label: "When they ask if they can trust you", example: "You are welcome to visit our office first. You can read our Google reviews here: (your review link)." },
  { key: "timing", label: "When they want to think about it", example: "Of course, take your time. I can hold a place for you until Friday if that helps." },
  { key: "competitor", label: "When they mention someone else", example: "Good to compare. What makes us different is that every job comes with a written guarantee." },
] as const;

type Intake = { key: string; label: string; help: string; type: "text" | "textarea" };

export function BrainForm({
  values,
  intake,
  tones,
  confirmLabel,
  examplePrice = "45",
}: {
  values: BrainFormValues;
  intake: Intake[];
  tones: { id: string; label: string }[];
  confirmLabel: string;
  /** A sample price in the business's own currency, for example ₹1,500 or $45. */
  examplePrice?: string;
}) {
  const [state, action, pending] = useActionForm<StepState>(saveBrain, {});
  return (
    <form onSubmit={action} className="space-y-4">
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
          help={`One per line. Put a bar between the service and its price, for example: Consultation | ${examplePrice}. The assistant only quotes prices written here.`}
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

      <section className="space-y-5 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div>
          <h2 className="text-[1.6rem] tracking-[-0.03em]">Concerns</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            How you answer when a customer hesitates. The assistant uses your exact words. Leave one empty and that conversation comes to you instead.
          </p>
        </div>
        {concernFields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            name={`objection_${f.key}`}
            multiline
            rows={3}
            placeholder={f.example}
            defaultValue={values.objections[f.key]}
          />
        ))}
      </section>

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
        <SubmitButton busy={pending} name="intent" value="confirm" pending="Saving">
          {confirmLabel}
        </SubmitButton>
        <SubmitButton busy={pending} name="intent" value="save" tone="quiet" pending="Saving">
          Save draft
        </SubmitButton>
      </div>
      <p className="font-mono text-xs leading-relaxed text-ink-soft">
        Confirming tells your assistant these facts are correct. It will never quote anything that is not written here.
      </p>
    </form>
  );
}
