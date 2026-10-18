import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { appConfig } from "@/lib/config";
import { Wordmark } from "@/components/Wordmark";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <Wordmark />
      <h1 className="mt-10 text-4xl font-extrabold">Create your account</h1>
      <p className="mt-3 text-lg text-ink-soft">
        Next we will ask where you trade and what you do, then check your business for missed enquiries.
      </p>
      <div className="mt-8">
        <SignupForm minLength={appConfig.passwordMinLength} />
      </div>
    </main>
  );
}
