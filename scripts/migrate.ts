// Applies SQL files in db/migrations in name order, once each, using the owner connection.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

function loadEnvFile() {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch {
    // No .env file; rely on the environment.
  }
}

async function main() {
  loadEnvFile();
  const url = process.env.MIGRATION_DATABASE_URL;
  const appRole = process.env.APP_DB_ROLE;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set.");
  if (!appRole || !/^[a-z_][a-z0-9_]*$/.test(appRole)) {
    throw new Error("APP_DB_ROLE must be set to a simple lowercase role name.");
  }

  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  await client.connect();
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );

  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8").replaceAll("{{app_role}}", appRole);
    process.stdout.write(`Applying ${file}... `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("done");
    } catch (error) {
      await client.query("rollback");
      console.log("failed");
      throw error;
    }
  }
  await client.end();
  console.log("Database is up to date.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
