// Loads .env for tests so they run against the same local database as the app.
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const text = readFileSync(join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch {
  // Use the environment as it is.
}

export function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.example`;
}
