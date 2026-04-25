#!/usr/bin/env tsx
/**
 * One-time schema bootstrap for the Neon Postgres database.
 *
 * Creates (or idempotently confirms) three tables:
 *   pson_profiles_current       — latest snapshot of every profile, JSONB
 *   pson_profile_revisions      — append-only revision log, JSONB
 *   pson_user_profile_index     — user_id → latest_profile_id lookup
 *
 * Safe to re-run — every DDL uses `create table if not exists`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, initSchema } from "../server/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

loadDotenv(envPath);

function loadDotenv(path: string): void {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  console.log("Applying PSON5 schema to Neon Postgres…");
  await initSchema();
  console.log("✓ Schema ready.");
  console.log("  · pson_profiles_current (latest snapshot)");
  console.log("  · pson_profile_revisions (append-only log)");
  console.log("  · pson_user_profile_index (user → profile lookup)");
  console.log("");
  console.log("Next: `npm run dev` to start the server + Vite.");
  await closePool();
}

main().catch(async (err) => {
  console.error("\n✗ Schema init failed:");
  console.error(err instanceof Error ? err.message : err);
  await closePool();
  process.exit(1);
});
