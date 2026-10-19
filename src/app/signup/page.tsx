import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { appConfig } from "@/lib/config";
import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <AuthShell title={appConfig.auth.signupTitle} intro={appConfig.auth.signupIntro}>
      <SignupForm minLength={appConfig.passwordMinLength} />
    </AuthShell>
  );
}
