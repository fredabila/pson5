import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** examples/researcher-agent/ */
export const PROJECT_ROOT = resolve(__dirname, "..");

/** examples/researcher-agent/.env */
export const ENV_PATH = resolve(PROJECT_ROOT, ".env");

/** examples/researcher-agent/.ids.json — persisted agent + environment ids. */
export const IDS_PATH = resolve(PROJECT_ROOT, ".ids.json");

/**
 * Dependency-free .env loader — no `dotenv` dep needed. Values already
 * set in process.env win; the file only fills gaps.
 */
export function loadDotenv(path: string = ENV_PATH): boolean {
  if (!existsSync(path)) return false;
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
  return true;
}

/** Persisted ids produced by `npm run setup`, consumed by `npm run dev`. */
export interface PersistedIds {
  agentId: string;
  agentVersion: number | string;
  environmentId: string;
}

export function readIds(): PersistedIds | null {
  if (!existsSync(IDS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(IDS_PATH, "utf8")) as PersistedIds;
  } catch {
    return null;
  }
}

export function writeIds(ids: PersistedIds): void {
  writeFileSync(IDS_PATH, `${JSON.stringify(ids, null, 2)}\n`, "utf8");
}

/**
 * Resolve the PSON store directory to an absolute path. Defaults to
 * `<project>/store/` so the demo never touches a parent monorepo store.
 */
export function resolveStoreDir(): string {
  const raw = process.env.PSON_STORE_DIR?.trim() ?? "./store";
  return resolve(PROJECT_ROOT, raw);
}

export function resolvePersonaUserId(): string {
  return process.env.PERSONA_USER_ID?.trim() || "persona_amelia_kwan_v1";
}

export function assertAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.error(
      [
        "",
        "✗ ANTHROPIC_API_KEY is not set.",
        `  Expected at: ${ENV_PATH}`,
        "  Copy .env.example to .env and fill it in.",
        ""
      ].join("\n")
    );
    process.exit(1);
  }
  return key;
}
