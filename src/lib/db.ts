// Database access. Tenant data is only ever read or written inside withTenant,
// which sets the workspace for one transaction so row level security can enforce isolation.
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
}

export function getPool(): Pool {
  if (!globalForDb.pgPool) globalForDb.pgPool = createPool();
  return globalForDb.pgPool;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

/** Queries on global tables only: users, sessions, login attempts. */
export async function globalQuery<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

/** Runs fn in one transaction scoped to a single workspace. */
export async function withTenant<T>(workspaceId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!isUuid(workspaceId)) throw new Error("A valid workspace id is required.");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
