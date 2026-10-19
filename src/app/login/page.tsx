import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { appConfig } from "@/lib/config";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <AuthShell title={appConfig.auth.loginTitle} intro={appConfig.auth.loginIntro}>
      <LoginForm />
    </AuthShell>
  );
}
