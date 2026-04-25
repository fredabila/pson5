#!/usr/bin/env tsx
/**
 * One-shot migration — grant the AI consent scopes
 * (`ai:use`, `ai:modeling`, `ai:simulation`) to every existing profile in
 * the Postgres store.
 *
 * Why this exists: the published @pson5/serialization-engine seeds new
 * profiles with the legacy scope strings `["core:read","core:write",
 * "simulation:run"]`, but @pson5/privacy actually checks for
 * `["ai:use","ai:modeling","ai:simulation"]`. The string mismatch
 * causes pson_get_provider_policy to deny modeling/simulation calls on
 * every profile created before the chat-app-pro fix landed.
 *
 * This script reads every profile out of pson_profiles_current, merges
 * the AI scopes into its consent.scopes array (deduplicated), bumps
 * revision + updated_at, and writes it back. It also writes a new row
 * to pson_profile_revisions so the audit log stays honest.
 *
 * Idempotent — re-running on already-migrated profiles is a no-op.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../server/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

(function loadDotenv() {
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
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
    if (key && !(key in process.env)) process.env[key] = value;
  }
})();

const REQUIRED_SCOPES = ["ai:use", "ai:modeling", "ai:simulation"] as const;

interface ProfileDocument {
  profile_id: string;
  user_id: string;
  consent?: {
    granted?: boolean;
    scopes?: string[];
    [key: string]: unknown;
  };
  metadata?: {
    revision?: number;
    updated_at?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function main() {
  const pool = getPool();

  console.log("Loading existing profiles…");
  const { rows } = await pool.query<{
    profile_id: string;
    user_id: string;
    profile_revision: number;
    profile_document: ProfileDocument;
  }>(`
    select profile_id, user_id, profile_revision, profile_document
    from pson_profiles_current
    order by updated_at asc
  `);

  if (rows.length === 0) {
    console.log("No profiles found — nothing to migrate.");
    await closePool();
    return;
  }

  console.log(`Found ${rows.length} profile${rows.length === 1 ? "" : "s"}.`);

  let migrated = 0;
  let alreadyOk = 0;

  for (const row of rows) {
    // pg returns jsonb as a parsed object already; if a string slips through,
    // parse it. Belt-and-braces.
    const document =
      typeof row.profile_document === "string"
        ? (JSON.parse(row.profile_document) as ProfileDocument)
        : row.profile_document;

    const existing = new Set(document.consent?.scopes ?? []);
    const missing = REQUIRED_SCOPES.filter((scope) => !existing.has(scope));

    if (missing.length === 0) {
      alreadyOk++;
      continue;
    }

    const merged = Array.from(new Set([...(document.consent?.scopes ?? []), ...REQUIRED_SCOPES]));
    const now = new Date().toISOString();
    const nextRevision = (document.metadata?.revision ?? row.profile_revision ?? 0) + 1;

    const next: ProfileDocument = {
      ...document,
      consent: {
        ...(document.consent ?? {}),
        granted: document.consent?.granted ?? true,
        scopes: merged
      },
      metadata: {
        ...(document.metadata ?? {}),
        revision: nextRevision,
        updated_at: now
      }
    };

    const client = await pool.connect();
    try {
      await client.query("begin");

      await client.query(
        `update pson_profiles_current
           set profile_document = $1::jsonb,
               profile_revision = $2,
               updated_at = $3::timestamptz
         where profile_id = $4`,
        [JSON.stringify(next), nextRevision, now, row.profile_id]
      );

      await client.query(
        `insert into pson_profile_revisions (profile_id, revision, profile_document, updated_at)
         values ($1, $2, $3::jsonb, $4::timestamptz)
         on conflict (profile_id, revision) do update set
           profile_document = excluded.profile_document,
           updated_at = excluded.updated_at`,
        [row.profile_id, nextRevision, JSON.stringify(next), now]
      );

      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    migrated++;
    console.log(
      `  ✓ ${row.profile_id} (${row.user_id}): added [${missing.join(", ")}] → revision ${nextRevision}`
    );
  }

  console.log("");
  console.log(`Done. ${migrated} migrated, ${alreadyOk} already had AI scopes.`);
  await closePool();
}

main().catch(async (err) => {
  console.error("\n✗ Migration failed:");
  console.error(err instanceof Error ? err.message : err);
  await closePool();
  process.exit(1);
});
