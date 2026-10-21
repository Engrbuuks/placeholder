"use client";

import { useActionState, useState } from "react";
import { chooseMarket, chooseNiche, savePresence, type StepState } from "@/app/actions/onboarding";
import type { MarketOption } from "@/lib/marketOptions";
import { Field, FormError, SelectField, SubmitButton } from "./ui";

const card =
  "group flex cursor-pointer items-start gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink/30 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

function Dot() {
  return (
    <span
      aria-hidden
      className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] border-ink/30 group-has-[:checked]:border-accent"
    >
      <span className="h-2.5 w-2.5 scale-0 rounded-full bg-accent transition-transform group-has-[:checked]:scale-100" />
    </span>
  );
}

export function MarketStep({
  options,
  current,
}: {
  options: MarketOption[];
  current: { country: string | null; timeZone: string | null; language: string };
}) {
  const [state, action] = useActionState<StepState, FormData>(chooseMarket, {});
  const [code, setCode] = useState(current.country ?? "");
  const market = options.find((m) => m.code === code);
  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <SelectField
        label="Country"
        name="country"
        value={code}
        onChange={setCode}
        options={[{ value: "", label: "Choose a country" }, ...options.map((m) => ({ value: m.code, label: m.name }))]}
      />
      {market && (
        <>
          <p className="rounded-xl bg-mist px-4 py-3 text-[0.9375rem] text-ink-soft">{market.detail}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {market.timeZones.length > 1 ? (
              <SelectField
                key={`tz_${market.code}`}
                label="Time zone"
                name="timeZone"
                help="Follow ups and reminders respect quiet hours here."
                options={market.timeZones}
                defaultValue={current.country === market.code && current.timeZone ? current.timeZone : market.timeZones[0].value}
              />
            ) : (
              <input type="hidden" name="timeZone" value={market.timeZones[0].value} />
            )}
            {market.languages.length > 1 ? (
              <SelectField
                key={`lang_${market.code}`}
                label="Language for your assistant"
                name="language"
                help="Customers who write in another language still get answered in theirs when AI is on."
                options={market.languages}
                defaultValue={market.languages.some((l) => l.value === current.language) ? current.language : market.languages[0].value}
              />
            ) : (
              <input type="hidden" name="language" value={market.languages[0].value} />
            )}
          </div>
        </>
      )}
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
            <input type="radio" name="pack" value={p.id} defaultChecked={current === p.id} className="sr-only" />
            <Dot />
            <span>
              <span className="block text-lg font-medium tracking-[-0.02em]">{p.name}</span>
              <span className="text-[0.9375rem] text-ink-soft">{p.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="rounded-2xl border border-dashed border-ink/25 p-5">
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
