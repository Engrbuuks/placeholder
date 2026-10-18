import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <Wordmark />
      <h1 className="mt-10 text-4xl font-extrabold">Log in</h1>
      <div className="mt-8">
        <LoginForm />
      </div>
    </main>
  );
}
