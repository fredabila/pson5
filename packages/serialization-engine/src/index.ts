import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AgentObservationRecord,
  ExportProfileOptions,
  ImportProfileOptions,
  InitProfileInput,
  ProfileStoreAdapter,
  ProfileStoreOptions,
  PsonProfile,
  ValidationResult
} from "@pson5/core-types";
import { PsonError } from "@pson5/core-types";
import { redactProfileForExport } from "@pson5/privacy";
import { validatePsonProfile } from "@pson5/schemas";

const DEFAULT_POLICY_VERSION = "2026-04-22";
const DEFAULT_STORE_DIRNAME = ".pson5-store";
const PROFILES_DIRNAME = "profiles";
const INDEXES_DIRNAME = "indexes";
const USERS_INDEX_DIRNAME = "users";
const CURRENT_PROFILE_FILENAME = "current.json";
const REVISIONS_DIRNAME = "revisions";
const AUDIT_DIRNAME = "audit";
const REVISION_AUDIT_FILENAME = "revisions.jsonl";

export interface RevisionAuditRecord {
  timestamp: string;
  profile_id: string;
  user_id: string;
  tenant_id?: string | null;
  revision: number;
  previous_revision: number | null;
  source_count: number;
  source_count_delta: number;
  updated_at: string;
  changed_top_level_paths: string[];
  pson_version: string;
}

type ProfileStoreErrorCode = "profile_not_found" | "conflict" | "validation_error";

// Map the narrow store codes to the broader PsonError codes.
function mapProfileStoreCode(code: ProfileStoreErrorCode): "not_found" | "conflict" | "validation_error" {
  return code === "profile_not_found" ? "not_found" : code;
}

export interface UserProfileIndexRecord {
  user_id: string;
  latest_profile_id: string;
  profile_ids: string[];
  updated_at: string;
}

export interface DocumentProfileStoreRepository {
  kind: string;
  readCurrentProfile(profileId: string): Promise<unknown | null>;
  writeCurrentProfile(profile: PsonProfile): Promise<void>;
  writeProfileRevision(profile: PsonProfile): Promise<void>;
  listProfileRevisionNumbers(profileId: string): Promise<number[]>;
  readUserProfileIndex(userId: string): Promise<UserProfileIndexRecord | null>;
  writeUserProfileIndex(record: UserProfileIndexRecord): Promise<void>;
}

/**
 * Legacy error type preserved for backwards compatibility. New code should
 * prefer `instanceof PsonError` — ProfileStoreError now extends it, so old
 * `err instanceof ProfileStoreError` checks keep working.
 *
 * Narrowing on the local `storeCode` property is still useful when callers
 * need to distinguish `profile_not_found` from other `not_found` flavours.
 */
export class ProfileStoreError extends PsonError {
  /** The narrow, store-specific code (e.g., "profile_not_found"). */
  public readonly storeCode: ProfileStoreErrorCode;

  public constructor(code: ProfileStoreErrorCode, message: string) {
    super(mapProfileStoreCode(code), message, { store_code: code });
    this.storeCode = code;
    this.name = "ProfileStoreError";
  }
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function createProfileId(now = new Date()): string {
  return `pson_${now.getTime()}`;
}

export function createEmptyProfile(input: InitProfileInput, now = new Date()): PsonProfile {
  const timestamp = nowIso(now);

  return {
    pson_version: "5.0",
    profile_id: createProfileId(now),
    user_id: input.user_id,
    tenant_id: input.tenant_id,
    consent: {
      granted: input.consent?.granted ?? true,
      // Default scopes cover both the local-only surface (core:*,
      // simulation:run) and the AI-provider surface (ai:use, ai:modeling,
      // ai:simulation). Earlier versions shipped only the local-only set,
      // which meant every pson_get_provider_policy call on a fresh profile
      // denied modeling/simulation with "missing scopes" — a contract
      // drift between serialization-engine and privacy. Callers who want
      // a local-only profile pass consent.scopes explicitly.
      scopes: input.consent?.scopes ?? [
        "core:read",
        "core:write",
        "simulation:run",
        "ai:use",
        "ai:modeling",
        "ai:simulation"
      ],
      policy_version: input.consent?.policy_version ?? DEFAULT_POLICY_VERSION,
      updated_at: input.consent?.updated_at ?? timestamp
    },
    domains: {
      active: input.domains && input.domains.length > 0 ? input.domains : ["core"],
      depth: input.depth ?? "light"
    },
    layers: {
      observed: {},
      inferred: {},
      simulated: {}
    },
    cognitive_model: {
      thinking_style: {},
      learning_style: {},
      processing_patterns: {}
    },
    behavioral_model: {
      decision_functions: [],
      action_patterns: [],
      motivation_model: {}
    },
    state_model: {
      states: [],
      transitions: []
    },
    knowledge_graph: {
      nodes: [],
      edges: []
    },
    simulation_profiles: {
      scenarios: [],
      domains: {}
    },
    privacy: {
      encryption: input.privacy?.encryption ?? false,
      access_levels: input.privacy?.access_levels ?? {},
      local_only: input.privacy?.local_only ?? false,
      restricted_fields: input.privacy?.restricted_fields ?? []
    },
    metadata: {
      confidence: 0,
      created_at: timestamp,
      updated_at: timestamp,
      source_count: 0,
      revision: 1
    }
  };
}

export function getDefaultStoreRoot(cwd = process.cwd()): string {
  return path.resolve(cwd, DEFAULT_STORE_DIRNAME);
}

export function resolveStoreRoot(options?: ProfileStoreOptions): string {
  return path.resolve(options?.rootDir ?? getDefaultStoreRoot());
}

function getResolvedOptions(options?: ProfileStoreOptions): ProfileStoreOptions {
  return options ?? {};
}

export function validateProfile(profile: unknown): ValidationResult<PsonProfile> {
  return validatePsonProfile(profile);
}

export function exportProfile(profile: PsonProfile, options?: { redaction_level?: "full" | "safe" }): string {
  const exportableProfile = redactProfileForExport(profile, options?.redaction_level ?? "full");
  const validation = validateProfile(exportableProfile);

  if (!validation.success || !validation.value) {
    const message = validation.issues
      .map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Cannot export invalid profile. ${message}`);
  }

  return JSON.stringify(validation.value, null, 2);
}

export function bumpRevision(profile: PsonProfile, now = new Date()): PsonProfile {
  return {
    ...profile,
    metadata: {
      ...profile.metadata,
      revision: profile.metadata.revision + 1,
      updated_at: nowIso(now)
    }
  };
}

function getProfilesRoot(rootDir: string): string {
  return path.join(rootDir, PROFILES_DIRNAME);
}

function getIndexesRoot(rootDir: string): string {
  return path.join(rootDir, INDEXES_DIRNAME);
}

function sanitizeUserId(userId: string): string {
  return encodeURIComponent(userId);
}

function getUserIndexPath(userId: string, rootDir: string): string {
  return path.join(getIndexesRoot(rootDir), USERS_INDEX_DIRNAME, `${sanitizeUserId(userId)}.json`);
}

function getProfileDir(profileId: string, rootDir: string): string {
  return path.join(getProfilesRoot(rootDir), profileId);
}

function getCurrentProfilePath(profileId: string, rootDir: string): string {
  return path.join(getProfileDir(profileId, rootDir), CURRENT_PROFILE_FILENAME);
}

function getRevisionPath(profileId: string, revision: number, rootDir: string): string {
  return path.join(getProfileDir(profileId, rootDir), REVISIONS_DIRNAME, `${revision}.json`);
}

async function ensureProfileDirectories(profileId: string, rootDir: string): Promise<void> {
  await mkdir(path.join(getProfileDir(profileId, rootDir), REVISIONS_DIRNAME), { recursive: true });
}

async function ensureIndexDirectories(rootDir: string): Promise<void> {
  await mkdir(path.join(getIndexesRoot(rootDir), USERS_INDEX_DIRNAME), { recursive: true });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function assertValidProfile(profile: unknown): PsonProfile {
  const validation = validateProfile(profile);

  if (!validation.success || !validation.value) {
    const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new ProfileStoreError("validation_error", `Invalid profile document. ${message}`);
  }

  return validation.value;
}

async function fileProfileExists(profileId: string, options?: ProfileStoreOptions): Promise<boolean> {
  try {
    const rootDir = resolveStoreRoot(options);
    await stat(getCurrentProfilePath(profileId, rootDir));
    return true;
  } catch {
    return false;
  }
}

async function fileSaveProfile(profile: PsonProfile, options?: ProfileStoreOptions): Promise<PsonProfile> {
  const validProfile = assertValidProfile(profile);
  const rootDir = resolveStoreRoot(options);
  const existingUserIndex = await readJsonOrNull<{
    profile_ids?: unknown;
  }>(getUserIndexPath(validProfile.user_id, rootDir));
  const existingProfileIds = Array.isArray(existingUserIndex?.profile_ids)
    ? existingUserIndex.profile_ids.filter((value): value is string => typeof value === "string")
    : [];
  const nextProfileIds = Array.from(new Set([...existingProfileIds, validProfile.profile_id]));

  await ensureProfileDirectories(validProfile.profile_id, rootDir);
  await ensureIndexDirectories(rootDir);
  await writeJson(getCurrentProfilePath(validProfile.profile_id, rootDir), validProfile);
  await writeJson(getRevisionPath(validProfile.profile_id, validProfile.metadata.revision, rootDir), validProfile);
  await writeJson(getUserIndexPath(validProfile.user_id, rootDir), {
    user_id: validProfile.user_id,
    latest_profile_id: validProfile.profile_id,
    profile_ids: nextProfileIds,
    updated_at: validProfile.metadata.updated_at
  });

  return validProfile;
}

async function fileLoadProfile(profileId: string, options?: ProfileStoreOptions): Promise<PsonProfile> {
  const rootDir = resolveStoreRoot(options);
  const filePath = getCurrentProfilePath(profileId, rootDir);

  try {
    const raw = await readFile(filePath, "utf8");
    return assertValidProfile(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ProfileStoreError) {
      throw error;
    }

    throw new ProfileStoreError("profile_not_found", `Profile '${profileId}' was not found in store '${rootDir}'.`);
  }
}

async function fileFindProfilesByUserId(userId: string, options?: ProfileStoreOptions): Promise<string[]> {
  const rootDir = resolveStoreRoot(options);
  const indexPath = getUserIndexPath(userId, rootDir);

  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as { profile_ids?: unknown };
    return Array.isArray(parsed.profile_ids)
      ? parsed.profile_ids.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

async function fileLoadProfileByUserId(userId: string, options?: ProfileStoreOptions): Promise<PsonProfile> {
  const rootDir = resolveStoreRoot(options);
  const indexPath = getUserIndexPath(userId, rootDir);

  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as { latest_profile_id?: unknown; profile_ids?: unknown };
    const latestProfileId =
      typeof parsed.latest_profile_id === "string"
        ? parsed.latest_profile_id
        : Array.isArray(parsed.profile_ids)
          ? parsed.profile_ids.find((value): value is string => typeof value === "string")
          : undefined;

    if (!latestProfileId) {
      throw new ProfileStoreError(
        "profile_not_found",
        `No profile mapping was found for user '${userId}' in store '${rootDir}'.`
      );
    }

    return fileLoadProfile(latestProfileId, options);
  } catch (error) {
    if (error instanceof ProfileStoreError) {
      throw error;
    }

    throw new ProfileStoreError(
      "profile_not_found",
      `No profile mapping was found for user '${userId}' in store '${rootDir}'.`
    );
  }
}

async function fileListProfileRevisions(profileId: string, options?: ProfileStoreOptions): Promise<number[]> {
  const rootDir = resolveStoreRoot(options);
  const revisionsDir = path.join(getProfileDir(profileId, rootDir), REVISIONS_DIRNAME);

  try {
    const files = await readdir(revisionsDir, { withFileTypes: true });
    return files
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => Number.parseInt(entry.name.replace(/\.json$/u, ""), 10))
      .filter((value) => Number.isInteger(value))
      .sort((left, right) => left - right);
  } catch {
    throw new ProfileStoreError("profile_not_found", `Profile '${profileId}' has no stored revisions.`);
  }
}

export function createFileDocumentProfileStoreRepository(
  rootDirOrOptions?: string | ProfileStoreOptions
): DocumentProfileStoreRepository {
  const repositoryOptions =
    typeof rootDirOrOptions === "string" ? { rootDir: rootDirOrOptions } : rootDirOrOptions;

  return {
    kind: "file-document",

    async readCurrentProfile(profileId: string): Promise<unknown | null> {
      const rootDir = resolveStoreRoot(repositoryOptions);
      return readJsonOrNull(getCurrentProfilePath(profileId, rootDir));
    },

    async writeCurrentProfile(profile: PsonProfile): Promise<void> {
      const rootDir = resolveStoreRoot(repositoryOptions);
      await ensureProfileDirectories(profile.profile_id, rootDir);
      await writeJson(getCurrentProfilePath(profile.profile_id, rootDir), profile);
    },

    async writeProfileRevision(profile: PsonProfile): Promise<void> {
      const rootDir = resolveStoreRoot(repositoryOptions);
      await ensureProfileDirectories(profile.profile_id, rootDir);
      await writeJson(getRevisionPath(profile.profile_id, profile.metadata.revision, rootDir), profile);
    },

    async listProfileRevisionNumbers(profileId: string): Promise<number[]> {
      const rootDir = resolveStoreRoot(repositoryOptions);
      const revisionsDir = path.join(getProfileDir(profileId, rootDir), REVISIONS_DIRNAME);

      try {
        const files = await readdir(revisionsDir, { withFileTypes: true });
        return files
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => Number.parseInt(entry.name.replace(/\.json$/u, ""), 10))
          .filter((value) => Number.isInteger(value))
          .sort((left, right) => left - right);
      } catch {
        return [];
      }
    },

    async readUserProfileIndex(userId: string): Promise<UserProfileIndexRecord | null> {
      const rootDir = resolveStoreRoot(repositoryOptions);
      return readJsonOrNull<UserProfileIndexRecord>(getUserIndexPath(userId, rootDir));
    },

    async writeUserProfileIndex(record: UserProfileIndexRecord): Promise<void> {
      const rootDir = resolveStoreRoot(repositoryOptions);
      await ensureIndexDirectories(rootDir);
      await writeJson(getUserIndexPath(record.user_id, rootDir), record);
    }
  };
}

export const fileProfileStoreAdapter: ProfileStoreAdapter = {
  kind: "file",
  saveProfile: fileSaveProfile,
  loadProfile: fileLoadProfile,
  profileExists: fileProfileExists,
  listProfileRevisions: fileListProfileRevisions,
  findProfilesByUserId: fileFindProfilesByUserId,
  loadProfileByUserId: fileLoadProfileByUserId
};

export function createMemoryProfileStoreAdapter(): ProfileStoreAdapter {
  const profiles = new Map<string, PsonProfile>();
  const revisions = new Map<string, Map<number, PsonProfile>>();
  const userIndex = new Map<string, string[]>();

  return {
    kind: "memory",
    async saveProfile(profile: PsonProfile): Promise<PsonProfile> {
      const validProfile = assertValidProfile(profile);
      profiles.set(validProfile.profile_id, validProfile);

      const profileRevisions = revisions.get(validProfile.profile_id) ?? new Map<number, PsonProfile>();
      profileRevisions.set(validProfile.metadata.revision, validProfile);
      revisions.set(validProfile.profile_id, profileRevisions);

      const existingProfileIds = userIndex.get(validProfile.user_id) ?? [];
      userIndex.set(validProfile.user_id, Array.from(new Set([...existingProfileIds, validProfile.profile_id])));

      return validProfile;
    },

    async loadProfile(profileId: string): Promise<PsonProfile> {
      const profile = profiles.get(profileId);
      if (!profile) {
        throw new ProfileStoreError("profile_not_found", `Profile '${profileId}' was not found in memory store.`);
      }

      return profile;
    },

    async profileExists(profileId: string): Promise<boolean> {
      return profiles.has(profileId);
    },

    async listProfileRevisions(profileId: string): Promise<number[]> {
      const profileRevisions = revisions.get(profileId);
      if (!profileRevisions) {
        throw new ProfileStoreError("profile_not_found", `Profile '${profileId}' has no stored revisions.`);
      }

      return [...profileRevisions.keys()].sort((left, right) => left - right);
    },

    async findProfilesByUserId(userId: string): Promise<string[]> {
      return [...(userIndex.get(userId) ?? [])];
    },

    async loadProfileByUserId(userId: string): Promise<PsonProfile> {
      const profileIds = userIndex.get(userId) ?? [];
      const latestProfileId = profileIds.at(-1);
      if (!latestProfileId) {
        throw new ProfileStoreError("profile_not_found", `No profile mapping was found for user '${userId}' in memory store.`);
      }

      const profile = profiles.get(latestProfileId);
      if (!profile) {
        throw new ProfileStoreError("profile_not_found", `Profile '${latestProfileId}' was not found in memory store.`);
      }

      return profile;
    }
  };
}

export function createDocumentProfileStoreAdapter(repository: DocumentProfileStoreRepository): ProfileStoreAdapter {
  return {
    kind: `document:${repository.kind}`,

    async saveProfile(profile: PsonProfile): Promise<PsonProfile> {
      const validProfile = assertValidProfile(profile);
      const existingIndex = await repository.readUserProfileIndex(validProfile.user_id);
      const nextProfileIds = Array.from(new Set([...(existingIndex?.profile_ids ?? []), validProfile.profile_id]));

      await repository.writeCurrentProfile(validProfile);
      await repository.writeProfileRevision(validProfile);
      await repository.writeUserProfileIndex({
        user_id: validProfile.user_id,
        latest_profile_id: validProfile.profile_id,
        profile_ids: nextProfileIds,
        updated_at: validProfile.metadata.updated_at
      });

      return validProfile;
    },

    async loadProfile(profileId: string): Promise<PsonProfile> {
      const raw = await repository.readCurrentProfile(profileId);
      if (!raw) {
        throw new ProfileStoreError("profile_not_found", `Profile '${profileId}' was not found in ${repository.kind} store.`);
      }

      return assertValidProfile(raw);
    },

    async profileExists(profileId: string): Promise<boolean> {
      return (await repository.readCurrentProfile(profileId)) !== null;
    },

    async listProfileRevisions(profileId: string): Promise<number[]> {
      const revisions = await repository.listProfileRevisionNumbers(profileId);
      if (revisions.length === 0) {
        throw new ProfileStoreError("profile_not_found", `Profile '${profileId}' has no stored revisions in ${repository.kind} store.`);
      }

      return [...revisions].sort((left, right) => left - right);
    },

    async findProfilesByUserId(userId: string): Promise<string[]> {
      return [...(await repository.readUserProfileIndex(userId))?.profile_ids ?? []];
    },

    async loadProfileByUserId(userId: string): Promise<PsonProfile> {
      const indexRecord = await repository.readUserProfileIndex(userId);
      const latestProfileId = indexRecord?.latest_profile_id ?? indexRecord?.profile_ids.at(-1);

      if (!latestProfileId) {
        throw new ProfileStoreError("profile_not_found", `No profile mapping was found for user '${userId}' in ${repository.kind} store.`);
      }

      return this.loadProfile(latestProfileId);
    }
  };
}

export function getProfileStoreAdapter(options?: ProfileStoreOptions): ProfileStoreAdapter {
  return getResolvedOptions(options).adapter ?? fileProfileStoreAdapter;
}

export async function profileExists(profileId: string, options?: ProfileStoreOptions): Promise<boolean> {
  return getProfileStoreAdapter(options).profileExists(profileId, options);
}

const TOP_LEVEL_AUDIT_KEYS: Array<keyof PsonProfile> = [
  "consent",
  "domains",
  "layers",
  "cognitive_model",
  "behavioral_model",
  "state_model",
  "knowledge_graph",
  "simulation_profiles",
  "privacy",
  "metadata"
];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function diffTopLevelPaths(previous: PsonProfile | null, next: PsonProfile): string[] {
  const changed: string[] = [];
  for (const key of TOP_LEVEL_AUDIT_KEYS) {
    if (!previous) {
      changed.push(String(key));
      continue;
    }
    if (stableStringify(previous[key]) !== stableStringify(next[key])) {
      changed.push(String(key));
    }
  }
  return changed;
}

async function appendRevisionAuditRecord(
  record: RevisionAuditRecord,
  options?: ProfileStoreOptions
): Promise<void> {
  const rootDir = resolveStoreRoot(options);
  const auditDir = path.join(rootDir, AUDIT_DIRNAME);
  const auditPath = path.join(auditDir, REVISION_AUDIT_FILENAME);
  await mkdir(auditDir, { recursive: true });
  await writeFile(auditPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
}

export async function readRevisionAuditRecords(
  options?: ProfileStoreOptions & { profile_id?: string }
): Promise<RevisionAuditRecord[]> {
  const rootDir = resolveStoreRoot(options);
  const auditPath = path.join(rootDir, AUDIT_DIRNAME, REVISION_AUDIT_FILENAME);

  let raw: string;
  try {
    raw = await readFile(auditPath, "utf8");
  } catch {
    return [];
  }

  const records: RevisionAuditRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as RevisionAuditRecord;
      if (!options?.profile_id || parsed.profile_id === options.profile_id) {
        records.push(parsed);
      }
    } catch {
      // Skip malformed lines rather than failing the whole read.
    }
  }
  return records;
}

export async function saveProfile(profile: PsonProfile, options?: ProfileStoreOptions): Promise<PsonProfile> {
  let previous: PsonProfile | null = null;
  try {
    previous = await getProfileStoreAdapter(options).loadProfile(profile.profile_id, options);
  } catch (error) {
    if (!(error instanceof ProfileStoreError && error.storeCode === "profile_not_found")) {
      throw error;
    }
  }

  const saved = await getProfileStoreAdapter(options).saveProfile(profile, options);

  try {
    await appendRevisionAuditRecord(
      {
        timestamp: new Date().toISOString(),
        profile_id: saved.profile_id,
        user_id: saved.user_id,
        tenant_id: saved.tenant_id ?? null,
        revision: saved.metadata.revision,
        previous_revision: previous?.metadata.revision ?? null,
        source_count: saved.metadata.source_count,
        source_count_delta:
          saved.metadata.source_count - (previous?.metadata.source_count ?? 0),
        updated_at: saved.metadata.updated_at,
        changed_top_level_paths: diffTopLevelPaths(previous, saved),
        pson_version: saved.pson_version
      },
      options
    );
  } catch {
    // Audit is best-effort; never block a successful save on audit I/O.
  }

  return saved;
}

export async function initProfile(input: InitProfileInput, options?: ProfileStoreOptions): Promise<PsonProfile> {
  const profile = createEmptyProfile(input);
  return saveProfile(profile, options);
}

export async function loadProfile(profileId: string, options?: ProfileStoreOptions): Promise<PsonProfile> {
  return getProfileStoreAdapter(options).loadProfile(profileId, options);
}

export async function findProfilesByUserId(userId: string, options?: ProfileStoreOptions): Promise<string[]> {
  return getProfileStoreAdapter(options).findProfilesByUserId(userId, options);
}

export async function loadProfileByUserId(userId: string, options?: ProfileStoreOptions): Promise<PsonProfile> {
  return getProfileStoreAdapter(options).loadProfileByUserId(userId, options);
}

export async function listProfileRevisions(profileId: string, options?: ProfileStoreOptions): Promise<number[]> {
  return getProfileStoreAdapter(options).listProfileRevisions(profileId, options);
}

export async function exportStoredProfile(profileId: string, options?: ExportProfileOptions): Promise<string> {
  const profile = await loadProfile(profileId, options);
  return exportProfile(profile, { redaction_level: options?.redaction_level });
}

export async function importProfileDocument(
  document: unknown,
  options?: ImportProfileOptions
): Promise<PsonProfile> {
  const profile = assertValidProfile(document);
  const exists = await profileExists(profile.profile_id, options);

  if (exists && !options?.overwrite) {
    throw new ProfileStoreError(
      "conflict",
      `Profile '${profile.profile_id}' already exists. Pass overwrite to replace it.`
    );
  }

  return saveProfile(profile, options);
}

// ─── observeFact ────────────────────────────────────────────────────────
//
// Append a free-form observed fact to the profile WITHOUT going through
// the structured question flow. This is the right primitive when an
// agent captures something the user volunteered in open conversation.
//
// The three-layer invariant still holds:
//   • writes go to `layers.observed[domain]` and only there
//   • carries `observation_type: "agent_observation"` + `source_question_id: null`
//     so downstream code can distinguish question-driven answers from
//     agent observations.
//   • every entry has a confidence score (defaults to 1.0 when the user
//     stated the fact directly).

export interface ObserveFactInput {
  profile_id: string;
  /** Domain slug the fact belongs to ("core", "personal", "custom:<name>" …). */
  domain: string;
  /** Short fact slug — e.g. "preferred_name", "current_city", "pet_species". */
  key: string;
  /** The fact itself. */
  value: string | number | boolean | string[] | null;
  /** Optional rationale — how the agent derived or confirmed this. */
  note?: string;
  /** 0-1. Defaults to 1.0 when omitted (user stated it directly). */
  confidence?: number;
}

function sanitizeFactKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new ProfileStoreError("validation_error", "observeFact requires a non-empty key.");
  }
  // Keep it friendly: lower-case snake_case, no odd characters. Agents
  // passing `Preferred Name` get a consistent `preferred_name`.
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asObservedDomainObject(current: unknown): Record<string, unknown> {
  return typeof current === "object" && current !== null && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {};
}

function asNestedRecord(current: unknown): Record<string, unknown> {
  return typeof current === "object" && current !== null && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {};
}

export async function observeFact(
  input: ObserveFactInput,
  options?: ProfileStoreOptions
): Promise<PsonProfile> {
  if (!input.profile_id) {
    throw new ProfileStoreError("validation_error", "observeFact requires profile_id.");
  }
  if (!input.domain || typeof input.domain !== "string") {
    throw new ProfileStoreError("validation_error", "observeFact requires a non-empty domain.");
  }
  const normalizedKey = sanitizeFactKey(input.key);

  const confidence =
    typeof input.confidence === "number" && input.confidence >= 0 && input.confidence <= 1
      ? input.confidence
      : 1.0;

  const profile = await loadProfile(input.profile_id, options);
  const now = new Date();
  const recordedAt = nowIso(now);

  const record: AgentObservationRecord = {
    source_id: `observation_${now.getTime()}_${normalizedKey}`,
    observation_type: "agent_observation",
    domain: input.domain,
    key: normalizedKey,
    value: input.value as AgentObservationRecord["value"],
    note: input.note && input.note.trim().length > 0 ? input.note.trim() : null,
    recorded_at: recordedAt,
    confidence,
    source_question_id: null
  };

  const existingDomain = asObservedDomainObject(profile.layers.observed[input.domain]);
  const existingObservations = asNestedRecord(existingDomain.observations);
  const existingFacts = asNestedRecord(existingDomain.facts);

  const nextProfile: PsonProfile = {
    ...profile,
    layers: {
      ...profile.layers,
      observed: {
        ...profile.layers.observed,
        [input.domain]: {
          ...existingDomain,
          observations: {
            ...existingObservations,
            [record.source_id]: record
          },
          facts: {
            ...existingFacts,
            [normalizedKey]: input.value
          },
          last_updated_at: recordedAt
        }
      }
    },
    metadata: {
      ...profile.metadata,
      revision: profile.metadata.revision + 1,
      source_count: profile.metadata.source_count + 1,
      updated_at: recordedAt
    }
  };

  return saveProfile(nextProfile, options);
}
