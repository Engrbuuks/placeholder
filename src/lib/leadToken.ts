import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

/** A customer's own link, made the first time it is needed. */
export async function publicTokenFor(c: PoolClient, leadId: string): Promise<string> {
  const r = await c.query<{ public_token: string }>(
    "update leads set public_token = coalesce(public_token, $2) where id = $1 returning public_token",
    [leadId, randomBytes(12).toString("base64url")],
  );
  return r.rows[0].public_token;
}
