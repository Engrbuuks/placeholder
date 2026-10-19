// Accounts and sessions. Passwords use Argon2id. Session cookies hold a random token;
// only its SHA256 hash is stored, so a leaked database cannot be replayed as live sessions.
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { appConfig } from "./config";
import { globalQuery, isUuid } from "./db";

export const sessionCookieName = "ph_session";

const argonOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, argonOptions);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verifying against this keeps login timing the same whether or not the email exists.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

/** Records an attempt and reports whether the key is over its limit for the current window. */
export async function overLimit(key: string, max: number, minutes = appConfig.rateLimit.windowMinutes): Promise<boolean> {
  await globalQuery("insert into login_attempts (attempt_key) values ($1)", [key]);
  const { rows } = await globalQuery<{ n: string }>(
    "select count(*) as n from login_attempts where attempt_key = $1 and attempted_at > now() - make_interval(mins => $2)",
    [key, minutes],
  );
  // Old rows are cleared opportunistically so the table stays small without a scheduled job.
  if (Math.random() < 0.02) {
    await globalQuery("delete from login_attempts where attempted_at < now() - interval '1 day'");
  }
  return Number(rows[0].n) > max;
}

export async function clearAttempts(key: string) {
  await globalQuery("delete from login_attempts where attempt_key = $1", [key]);
}

export async function createSession(userId: string, workspaceId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const days = appConfig.sessionDays;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await globalQuery("insert into sessions (id, user_id, workspace_id, expires_at) values ($1, $2, $3, $4)", [
    tokenHash(token),
    userId,
    workspaceId,
    expires,
  ]);
  const jar = await cookies();
  jar.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (token) await globalQuery("delete from sessions where id = $1", [tokenHash(token)]);
  jar.delete(sessionCookieName);
}

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  workspaceId: string;
  role: "owner" | "manager" | "agent";
};

/** Returns the signed in user and their current workspace, or null. Safe to call from server components. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token || token.length > 100) return null;

  const { rows } = await globalQuery<{
    user_id: string;
    email: string;
    full_name: string;
    workspace_id: string | null;
  }>(
    `select s.user_id, u.email, u.full_name, s.workspace_id
     from sessions s join users u on u.id = s.user_id
     where s.id = $1 and s.expires_at > now()`,
    [tokenHash(token)],
  );
  const row = rows[0];
  if (!row) return null;

  // Membership is checked on every request, so removing someone from a workspace takes effect at once.
  const memberships = await globalQuery<{ workspace_id: string; role: Session["role"] }>(
    "select workspace_id, role from workspaces_for_user($1)",
    [row.user_id],
  );
  const current =
    memberships.rows.find((m) => m.workspace_id === row.workspace_id) ?? memberships.rows[0];
  if (!current || !isUuid(current.workspace_id)) return null;

  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    workspaceId: current.workspace_id,
    role: current.role,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
