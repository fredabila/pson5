import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ExportProfileOptions,
  ImportProfileOptions,
  InitProfileInput,
  ProfileStoreAdapter,
  ProfileStoreOptions,
  PsonProfile,
  ValidationResult
} from "@pson5/core-types";
import { redactProfileForExport } from "@pson5/privacy";
import { validatePsonProfile } from "@pson5/schemas";

const DEFAULT_POLICY_VERSION = "2026-04-22";
const DEFAULT_STORE_DIRNAME = ".pson5-store";
const PROFILES_DIRNAME = "profiles";
const INDEXES_DIRNAME = "indexes";
const USERS_INDEX_DIRNAME = "users";
const CURRENT_PROFILE_FILENAME = "current.json";
const REVISIONS_DIRNAME = "revisions";

type ProfileStoreErrorCode = "profile_not_found" | "conflict" | "validation_error";

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

export class ProfileStoreError extends Error {
  public readonly code: ProfileStoreErrorCode;

  public constructor(code: ProfileStoreErrorCode, message: string) {
    super(message);
    this.code = code;
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
      scopes: input.consent?.scopes ?? ["core:read", "core:write", "simulation:run"],
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

export async function saveProfile(profile: PsonProfile, options?: ProfileStoreOptions): Promise<PsonProfile> {
  return getProfileStoreAdapter(options).saveProfile(profile, options);
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
