# @pson5/serialization-engine

> Canonical `.pson` create / load / save pipeline with pluggable storage adapters, append-only revision audit, and validated import / export.

## Install

```bash
npm install @pson5/serialization-engine
```

## What this package does

This is the storage and lifecycle core of PSON5. It owns:

- **Profile creation** (`createEmptyProfile`, `initProfile`) with consent, depth, domains, and metadata stamped from defaults.
- **Load / save** via a pluggable `ProfileStoreAdapter` (file by default; memory and document / Postgres available).
- **Revision history** (`listProfileRevisions`) plus an append-only audit (`readRevisionAuditRecords`) logged to `<store>/audit/revisions.jsonl` on every save.
- **Import / export** (`importProfileDocument`, `exportProfile`, `exportStoredProfile`) with `safe` / `full` redaction levels delegated to `@pson5/privacy`.
- **Validation** (`validateProfile`) via `@pson5/schemas` — importing an invalid document throws.

## Exports

```ts
import {
  createEmptyProfile,
  bumpRevision,
  validateProfile,
  exportProfile,
  exportStoredProfile,
  importProfileDocument,
  initProfile,
  loadProfile,
  loadProfileByUserId,
  findProfilesByUserId,
  listProfileRevisions,
  saveProfile,
  profileExists,
  readRevisionAuditRecords,
  resolveStoreRoot,
  getDefaultStoreRoot,
  getProfileStoreAdapter,
  createMemoryProfileStoreAdapter,
  createDocumentProfileStoreAdapter,
  createFileDocumentProfileStoreRepository,
  ProfileStoreError,
  type DocumentProfileStoreRepository,
  type RevisionAuditRecord
} from "@pson5/serialization-engine";
```

## Usage

### Initialize, load, save

```ts
import {
  initProfile,
  loadProfile,
  saveProfile
} from "@pson5/serialization-engine";

const store = { rootDir: ".pson5-store" };

const profile = await initProfile({ user_id: "user_123", domains: ["core"], depth: "light" }, store);
const reloaded = await loadProfile(profile.profile_id, store);
await saveProfile(reloaded, store);
// A record is appended to <store>/audit/revisions.jsonl automatically.
```

### Export

```ts
import { exportStoredProfile } from "@pson5/serialization-engine";

const safe = await exportStoredProfile("pson_123", {
  rootDir: ".pson5-store",
  redaction_level: "safe"
});
const full = await exportStoredProfile("pson_123", {
  rootDir: ".pson5-store",
  redaction_level: "full"
});
// `safe` drops observed.*.facts in restricted_fields, anonymises user_id,
// and removes layers.inferred.ai_model. `full` returns the raw .pson.
```

### Import

```ts
import { importProfileDocument } from "@pson5/serialization-engine";

const profile = await importProfileDocument(jsonDocument, {
  rootDir: ".pson5-store",
  overwrite: false
});
// Throws ProfileStoreError("conflict", ...) if a profile with the same id
// already exists unless overwrite is true. Always validates through
// @pson5/schemas before writing.
```

### Read the revision audit

```ts
import { readRevisionAuditRecords } from "@pson5/serialization-engine";

const records = await readRevisionAuditRecords({
  rootDir: ".pson5-store",
  profile_id: "pson_123"
});
// Every entry:
//   timestamp, profile_id, user_id, tenant_id,
//   revision, previous_revision, source_count, source_count_delta,
//   updated_at, pson_version,
//   changed_top_level_paths: ["layers", "state_model", ...]
```

## Storage adapters

`ProfileStoreOptions.adapter` accepts any `ProfileStoreAdapter`. Built-in adapters:

| Adapter | Factory | When to use |
| --- | --- | --- |
| File (default) | none — used automatically when `adapter` is omitted | Local dev, single-node deployments, CI fixtures. |
| Memory | `createMemoryProfileStoreAdapter()` | Tests and throw-away fixtures. No persistence. |
| Document | `createDocumentProfileStoreAdapter(repo)` | Any backend that implements `DocumentProfileStoreRepository` (current / revisions / user index). File-backed reference implementation available via `createFileDocumentProfileStoreRepository(root)`. |
| Postgres | `createPostgresProfileStoreAdapter(...)` from `@pson5/postgres-store` | Multi-node / cloud deployments. |

The contract they all implement:

```ts
interface ProfileStoreAdapter {
  profileExists(profileId, options?): Promise<boolean>;
  loadProfile(profileId, options?): Promise<PsonProfile>;
  loadProfileByUserId(userId, options?): Promise<PsonProfile>;
  findProfilesByUserId(userId, options?): Promise<string[]>;
  listProfileRevisions(profileId, options?): Promise<number[]>;
  saveProfile(profile, options?): Promise<PsonProfile>;
}
```

The adapter is transport-agnostic — it only deals with already-validated `PsonProfile` documents. Validation and audit happen in this package regardless of adapter.

## Key concepts

- **`saveProfile` is the only write path.** `initProfile` and `importProfileDocument` both call it. The audit trail and validation are enforced there, so no adapter has to reimplement them.
- **Revision is monotonic.** The caller bumps `profile.metadata.revision` before saving (acquisition does this via `bumpRevision`). The audit records whatever revision lands.
- **Audit is best-effort.** If the audit write fails (permission, disk full, etc.) the save still succeeds — audit errors are swallowed to avoid masking the authoritative write.
- **`ProfileStoreError` has a typed code.** `profile_not_found`, `conflict`, or `validation_error`. HTTP and CLI layers map these to stable exit codes.

## Related docs

- [PSON Profile Schema](../schemas/pson-schema.md) — the document shape this package validates.
- [Privacy Model](../privacy/privacy-model.md) — the redaction behind `exportProfile`.
- [API Quickstart](./api-quickstart.md) — `/v1/pson/export` and `/v1/pson/import` wrap this package.
- [Postgres Store](./postgres-store.md) — cloud-grade adapter.
