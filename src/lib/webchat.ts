// Web chat: finds the business behind a public widget key and reads a visitor's conversation.
import { globalQuery, isUuid, withTenant } from "./db";
import { randomKey } from "./crypto";

export async function workspaceForWebchat(key: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return null;
  const { rows } = await globalQuery<{ id: string | null }>("select workspace_for_webchat($1) as id", [key]);
  return rows[0]?.id ?? null;
}

export async function webchatBusiness(workspaceId: string): Promise<{ name: string; language: string }> {
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{ name: string; brand: string | null; language: string }>(
      "select w.name, w.language, b.data->>'businessName' as brand from workspaces w left join brand_brains b on b.workspace_id = w.id where w.id = $1",
      [workspaceId],
    );
    return { name: rows[0]?.brand || rows[0]?.name || "", language: rows[0]?.language ?? "en" };
  });
}

export type ChatMessage = { id: string; from: "visitor" | "business"; body: string; at: string };

export async function visitorMessages(workspaceId: string, visitorId: string): Promise<ChatMessage[]> {
  if (!isUuid(visitorId)) return [];
  return withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<{ id: string; direction: "in" | "out"; body: string; created_at: Date }>(
      `select m.id, m.direction, m.body, m.created_at
       from messages m join leads l on l.id = m.lead_id
       where l.channel = 'webchat' and l.external_id = $1
         and (m.direction = 'in' or m.status in ('sent', 'delivered', 'read'))
       order by m.created_at, m.id
       limit 200`,
      [visitorId],
    );
    return rows.map((r) => ({ id: r.id, from: r.direction === "in" ? "visitor" : "business", body: r.body, at: r.created_at.toISOString() }));
  });
}

/** Makes sure a workspace has a web chat key, and returns it. */
export async function ensureWebchat(workspaceId: string): Promise<string> {
  return withTenant(workspaceId, async (c) => {
    const existing = await c.query<{ public_key: string }>(
      "select public_key from channel_connections where workspace_id = $1 and channel = 'webchat'",
      [workspaceId],
    );
    if (existing.rows[0]?.public_key) return existing.rows[0].public_key;
    const key = randomKey(15);
    await c.query(
      `insert into channel_connections (workspace_id, channel, public_key) values ($1, 'webchat', $2)
       on conflict (workspace_id, channel) do update set public_key = excluded.public_key`,
      [workspaceId, key],
    );
    return key;
  });
}
