"use client";

import { useActionState } from "react";
import { chooseMarket, chooseNiche, savePresence, type StepState } from "@/app/actions/onboarding";
import { Field, FormError, SubmitButton } from "./ui";

type MarketOption = { code: string; name: string; detail: string };

const card =
  "flex cursor-pointer gap-4 rounded-2xl border-2 border-line bg-surface p-5 has-[:checked]:border-ink has-[:checked]:bg-signal-wash has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sun";

export function MarketStep({ options, current }: { options: MarketOption[]; current: string | null }) {
  const [state, action] = useActionState<StepState, FormData>(chooseMarket, {});
  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Where your business trades</legend>
        {options.map((m) => (
          <label key={m.code} className={card}>
            <input type="radio" name="country" value={m.code} defaultChecked={current === m.code} required className="mt-1.5 h-5 w-5 accent-ink" />
            <span>
              <span className="block font-display text-xl font-bold">{m.name}</span>
              <span className="text-ink-soft">{m.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton pending="Saving">Continue</SubmitButton>
    </form>
  );
}

type PackOption = { id: string; name: string; description: string };

export function NicheStep({ options, current }: { options: PackOption[]; current: string | null }) {
  const [state, action] = useActionState<StepState, FormData>(chooseNiche, {});
  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <fieldset className="grid gap-4">
        <legend className="sr-only">What kind of business you run</legend>
        {options.map((p) => (
          <label key={p.id} className={card}>
            <input type="radio" name="pack" value={p.id} defaultChecked={current === p.id} className="mt-1.5 h-5 w-5 accent-ink" />
            <span>
              <span className="block font-display text-xl font-bold">{p.name}</span>
              <span className="text-ink-soft">{p.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="rounded-2xl border-2 border-dashed border-line p-5">
        <Field
          label="Not sure? Describe your business instead"
          name="description"
          help="For example: we sell plots of land in Ibadan to buyers in the UK. Leave the choices above empty if you use this."
          defaultValue={state.fields?.description}
        />
      </div>
      <SubmitButton pending="Finding your match">Continue</SubmitButton>
    </form>
  );
}

export function PresenceStep({
  website,
  instagram,
  google,
}: {
  website: string | null;
  instagram: string | null;
  google: string | null;
}) {
  const [state, action] = useActionState<StepState, FormData>(savePresence, {});
  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <Field
        label="Website"
        name="websiteUrl"
        placeholder="mybusiness.com"
        help="Leave empty if you do not have one yet."
        defaultValue={state.fields?.websiteUrl ?? website ?? ""}
      />
      <Field
        label="Instagram handle"
        name="instagram"
        placeholder="@mybusiness"
        defaultValue={state.fields?.instagram ?? instagram ?? ""}
      />
      <Field
        label="Google Business Profile link"
        name="googleProfileUrl"
        placeholder="https://maps.app.goo.gl/..."
        help="Open your listing on Google Maps, tap Share, and paste the link."
        defaultValue={state.fields?.googleProfileUrl ?? google ?? ""}
      />
      <SubmitButton pending="Checking your business. This can take up to a minute.">Check my business</SubmitButton>
    </form>
  );
}
