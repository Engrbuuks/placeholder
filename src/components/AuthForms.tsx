"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type FormState } from "@/app/actions/auth";
import { Field, FormError, SubmitButton } from "./ui";

export function SignupForm({ minLength }: { minLength: number }) {
  const [state, action] = useActionState<FormState, FormData>(signup, {});
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <Field label="Your name" name="fullName" autoComplete="name" required defaultValue={state.fields?.fullName} />
      <Field
        label="Business name"
        name="businessName"
        autoComplete="organization"
        required
        defaultValue={state.fields?.businessName}
      />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        help={`At least ${minLength} characters.`}
        required
      />
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <SubmitButton pending="Creating your account">Create account</SubmitButton>
        <Link href="/login" className="font-bold underline underline-offset-4">
          I already have an account
        </Link>
      </div>
    </form>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <SubmitButton pending="Logging in">Log in</SubmitButton>
        <Link href="/signup" className="font-bold underline underline-offset-4">
          Create an account
        </Link>
      </div>
    </form>
  );
}
