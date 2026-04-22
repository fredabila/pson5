import type { PsonProfile } from "@pson5/core-types";
import type { DocumentProfileStoreRepository, UserProfileIndexRecord } from "@pson5/serialization-engine";

export interface PostgresQueryRow {
  [key: string]: unknown;
}

export interface PostgresQueryResult<TRow extends PostgresQueryRow = PostgresQueryRow> {
  rows: TRow[];
  rowCount?: number;
}

export type PostgresQueryExecutor = <TRow extends PostgresQueryRow = PostgresQueryRow>(
  sql: string,
  params?: unknown[]
) => Promise<PostgresQueryResult<TRow>>;

export interface PostgresQueryable {
  query<TRow extends PostgresQueryRow = PostgresQueryRow>(
    sql: string,
    params?: unknown[]
  ): Promise<PostgresQueryResult<TRow>>;
}

export interface PostgresProfileStoreOptions {
  schema?: string;
  currentProfilesTable?: string;
  profileRevisionsTable?: string;
  userIndexTable?: string;
}

function identifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function qualify(schema: string, table: string): string {
  return `${identifier(schema)}.${identifier(table)}`;
}

function parseJsonValue<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

export function createPostgresQueryExecutor(queryable: PostgresQueryable): PostgresQueryExecutor {
  return async (sql, params) => queryable.query(sql, params);
}

export function createPostgresProfileStoreArtifacts(options?: PostgresProfileStoreOptions): {
  schemaSql: string;
  queries: {
    selectCurrentProfile: string;
    upsertCurrentProfile: string;
    upsertProfileRevision: string;
    selectRevisionNumbers: string;
    selectUserIndex: string;
    upsertUserIndex: string;
  };
} {
  const schema = options?.schema ?? "public";
  const currentProfilesTable = options?.currentProfilesTable ?? "pson_profiles_current";
  const profileRevisionsTable = options?.profileRevisionsTable ?? "pson_profile_revisions";
  const userIndexTable = options?.userIndexTable ?? "pson_user_profile_index";

  const currentTable = qualify(schema, currentProfilesTable);
  const revisionsTable = qualify(schema, profileRevisionsTable);
  const userTable = qualify(schema, userIndexTable);

  return {
    schemaSql: `
create table if not exists ${currentTable} (
  profile_id text primary key,
  user_id text not null,
  profile_revision integer not null,
  profile_document jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists ${revisionsTable} (
  profile_id text not null,
  revision integer not null,
  profile_document jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, revision)
);

create table if not exists ${userTable} (
  user_id text primary key,
  latest_profile_id text not null,
  profile_ids jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_${currentProfilesTable}_user_id on ${currentTable} (user_id);
create index if not exists idx_${revisionsTable}_profile_id on ${revisionsTable} (profile_id);
    `.trim(),
    queries: {
      selectCurrentProfile: `select profile_document from ${currentTable} where profile_id = $1`,
      upsertCurrentProfile: `
insert into ${currentTable} (profile_id, user_id, profile_revision, profile_document, updated_at)
values ($1, $2, $3, $4::jsonb, $5::timestamptz)
on conflict (profile_id) do update set
  user_id = excluded.user_id,
  profile_revision = excluded.profile_revision,
  profile_document = excluded.profile_document,
  updated_at = excluded.updated_at
      `.trim(),
      upsertProfileRevision: `
insert into ${revisionsTable} (profile_id, revision, profile_document, updated_at)
values ($1, $2, $3::jsonb, $4::timestamptz)
on conflict (profile_id, revision) do update set
  profile_document = excluded.profile_document,
  updated_at = excluded.updated_at
      `.trim(),
      selectRevisionNumbers: `select revision from ${revisionsTable} where profile_id = $1 order by revision asc`,
      selectUserIndex: `select user_id, latest_profile_id, profile_ids, updated_at from ${userTable} where user_id = $1`,
      upsertUserIndex: `
insert into ${userTable} (user_id, latest_profile_id, profile_ids, updated_at)
values ($1, $2, $3::jsonb, $4::timestamptz)
on conflict (user_id) do update set
  latest_profile_id = excluded.latest_profile_id,
  profile_ids = excluded.profile_ids,
  updated_at = excluded.updated_at
      `.trim()
    }
  };
}

export function createPostgresProfileStoreRepository(
  executor: PostgresQueryExecutor,
  options?: PostgresProfileStoreOptions
): DocumentProfileStoreRepository {
  const artifacts = createPostgresProfileStoreArtifacts(options);

  return {
    kind: "postgres",

    async readCurrentProfile(profileId: string): Promise<unknown | null> {
      const result = await executor<{ profile_document: unknown }>(artifacts.queries.selectCurrentProfile, [profileId]);
      return result.rows[0] ? parseJsonValue(result.rows[0].profile_document) : null;
    },

    async writeCurrentProfile(profile: PsonProfile): Promise<void> {
      await executor(artifacts.queries.upsertCurrentProfile, [
        profile.profile_id,
        profile.user_id,
        profile.metadata.revision,
        JSON.stringify(profile),
        profile.metadata.updated_at
      ]);
    },

    async writeProfileRevision(profile: PsonProfile): Promise<void> {
      await executor(artifacts.queries.upsertProfileRevision, [
        profile.profile_id,
        profile.metadata.revision,
        JSON.stringify(profile),
        profile.metadata.updated_at
      ]);
    },

    async listProfileRevisionNumbers(profileId: string): Promise<number[]> {
      const result = await executor<{ revision: unknown }>(artifacts.queries.selectRevisionNumbers, [profileId]);
      return result.rows
        .map((row) => Number(row.revision))
        .filter((value) => Number.isInteger(value))
        .sort((left, right) => left - right);
    },

    async readUserProfileIndex(userId: string): Promise<UserProfileIndexRecord | null> {
      const result = await executor<{
        user_id: unknown;
        latest_profile_id: unknown;
        profile_ids: unknown;
        updated_at: unknown;
      }>(artifacts.queries.selectUserIndex, [userId]);

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        user_id: String(row.user_id ?? userId),
        latest_profile_id: String(row.latest_profile_id ?? ""),
        profile_ids: Array.isArray(parseJsonValue<unknown[]>(row.profile_ids))
          ? (parseJsonValue<unknown[]>(row.profile_ids) ?? []).filter(
              (value): value is string => typeof value === "string"
            )
          : [],
        updated_at: String(row.updated_at ?? "")
      };
    },

    async writeUserProfileIndex(record: UserProfileIndexRecord): Promise<void> {
      await executor(artifacts.queries.upsertUserIndex, [
        record.user_id,
        record.latest_profile_id,
        JSON.stringify(record.profile_ids),
        record.updated_at
      ]);
    }
  };
}
