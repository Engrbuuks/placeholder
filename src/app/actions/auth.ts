"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appConfig } from "@/lib/config";
import { globalQuery } from "@/lib/db";
import {
  clearAttempts,
  clientIp,
  createSession,
  destroySession,
  dummyPasswordHash,
  hashPassword,
  overLimit,
  verifyPassword,
} from "@/lib/auth";
import { createAccountWithWorkspace } from "@/lib/workspaces";

export type FormState = { error?: string; fields?: Record<string, string> };

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  businessName: z.string().trim().min(2, "Enter your business name.").max(160),
  email,
  password: z
    .string()
    .min(appConfig.passwordMinLength, `Use at least ${appConfig.passwordMinLength} characters for your password.`)
    .max(200, "That password is too long."),
});

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    businessName: String(formData.get("businessName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const keep = { fullName: raw.fullName, businessName: raw.businessName, email: raw.email };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: keep };

  const ip = await clientIp();
  if (await overLimit(`signup:${ip}`, appConfig.rateLimit.maxSignupsPerIp)) {
    return { error: "Too many accounts were created from this connection. Try again later.", fields: keep };
  }

  const account = await createAccountWithWorkspace({
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    businessName: parsed.data.businessName,
  });
  if (!account) return { error: "An account with this email already exists. Log in instead.", fields: keep };

  await createSession(account.userId, account.workspaceId);
  redirect("/onboarding");
}

const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(200) });

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: raw.email } };

  const ip = await clientIp();
  const emailKey = `login:${parsed.data.email}`;
  const max = appConfig.rateLimit.maxLoginAttempts;
  const blocked = (await overLimit(emailKey, max)) || (await overLimit(`login-ip:${ip}`, max * 5));
  if (blocked) {
    return {
      error: `Too many login attempts. Wait ${appConfig.rateLimit.windowMinutes} minutes and try again.`,
      fields: { email: raw.email },
    };
  }

  const { rows } = await globalQuery<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = $1",
    [parsed.data.email],
  );
  const user = rows[0];
  const ok = await verifyPassword(user?.password_hash ?? (await dummyPasswordHash()), parsed.data.password);
  if (!user || !ok) return { error: "That email and password do not match an account.", fields: { email: raw.email } };

  await clearAttempts(emailKey);
  const memberships = await globalQuery<{ workspace_id: string }>("select workspace_id from workspaces_for_user($1)", [user.id]);
  await createSession(user.id, memberships.rows[0]?.workspace_id ?? null);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
