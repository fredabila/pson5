import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  bumpRevision,
  createDocumentProfileStoreAdapter,
  createFileDocumentProfileStoreRepository,
  createMemoryProfileStoreAdapter,
  initProfile,
  listProfileRevisions,
  loadProfile,
  loadProfileByUserId,
  saveProfile
} from "../../packages/serialization-engine/dist/serialization-engine/src/index.js";

async function runContract(name, storeOptions) {
  const initial = await initProfile(
    {
      user_id: `${name}_user`,
      domains: ["core"],
      depth: "light"
    },
    storeOptions
  );

  assert.equal(initial.user_id, `${name}_user`);

  const loaded = await loadProfile(initial.profile_id, storeOptions);
  assert.equal(loaded.profile_id, initial.profile_id);

  const revised = bumpRevision(loaded);
  await saveProfile(revised, storeOptions);

  const revisions = await listProfileRevisions(initial.profile_id, storeOptions);
  assert.deepEqual(revisions, [1, 2]);

  const byUser = await loadProfileByUserId(`${name}_user`, storeOptions);
  assert.equal(byUser.profile_id, initial.profile_id);
  assert.equal(byUser.metadata.revision, 2);
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-file-store-"));
  await runContract("file", { rootDir: tempRoot });
  await runContract("memory", { adapter: createMemoryProfileStoreAdapter() });
  const documentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-document-store-"));
  await runContract("document", {
    adapter: createDocumentProfileStoreAdapter(createFileDocumentProfileStoreRepository(documentRoot))
  });
  console.log("storage adapter contract passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
