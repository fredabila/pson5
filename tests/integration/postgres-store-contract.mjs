import assert from "node:assert/strict";
import {
  createDocumentProfileStoreAdapter,
  initProfile,
  loadProfileByUserId,
  listProfileRevisions,
  saveProfile,
  bumpRevision
} from "@pson5/serialization-engine";
import {
  createPostgresProfileStoreArtifacts,
  createPostgresProfileStoreRepository
} from "@pson5/postgres-store";

async function main() {
  const currentProfiles = new Map();
  const profileRevisions = new Map();
  const userIndexes = new Map();
  const { queries } = createPostgresProfileStoreArtifacts();

  const executor = async (sql, params = []) => {
    if (sql === queries.selectCurrentProfile) {
      const profile = currentProfiles.get(params[0]);
      return { rows: profile ? [{ profile_document: profile.profile_document }] : [] };
    }

    if (sql === queries.upsertCurrentProfile) {
      currentProfiles.set(params[0], {
        profile_id: params[0],
        user_id: params[1],
        profile_revision: params[2],
        profile_document: params[3],
        updated_at: params[4]
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql === queries.upsertProfileRevision) {
      const revisions = profileRevisions.get(params[0]) ?? new Map();
      revisions.set(params[1], {
        profile_id: params[0],
        revision: params[1],
        profile_document: params[2],
        updated_at: params[3]
      });
      profileRevisions.set(params[0], revisions);
      return { rows: [], rowCount: 1 };
    }

    if (sql === queries.selectRevisionNumbers) {
      const revisions = [...(profileRevisions.get(params[0])?.keys() ?? [])].map((revision) => ({ revision }));
      return { rows: revisions };
    }

    if (sql === queries.selectUserIndex) {
      const record = userIndexes.get(params[0]);
      return { rows: record ? [record] : [] };
    }

    if (sql === queries.upsertUserIndex) {
      userIndexes.set(params[0], {
        user_id: params[0],
        latest_profile_id: params[1],
        profile_ids: params[2],
        updated_at: params[3]
      });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const adapter = createDocumentProfileStoreAdapter(createPostgresProfileStoreRepository(executor));
  const store = { adapter };

  const profile = await initProfile({ user_id: "postgres_user", domains: ["core"], depth: "light" }, store);
  const revised = bumpRevision(profile);
  await saveProfile(revised, store);

  const loaded = await loadProfileByUserId("postgres_user", store);
  const revisions = await listProfileRevisions(profile.profile_id, store);

  assert.equal(loaded.profile_id, profile.profile_id);
  assert.equal(loaded.metadata.revision, 2);
  assert.deepEqual(revisions, [1, 2]);

  console.log("postgres store contract passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
