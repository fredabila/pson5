# @pson5/postgres-store

> Postgres-backed `ProfileStoreAdapter` for multi-node PSON5 deployments.

## Install

```bash
npm install @pson5/postgres-store
```

`pg` is a runtime dependency and is installed transitively.

## What this package does

`@pson5/postgres-store` provides a production-grade implementation of the `DocumentProfileStoreRepository` interface from `@pson5/serialization-engine`. Plug it into `createDocumentProfileStoreAdapter(...)` and you get durable, multi-writer storage for profiles and user indexes, with the same audit trail and validation behaviour as the file adapter.

It is intentionally thin: profiles and user indexes are stored as JSON documents. Revision history is tracked as rows keyed by `profile_id` + `revision`.

## Exports

```ts
import {
  createPostgresProfileStoreRepository
} from "@pson5/postgres-store";
```

## Usage

```ts
import {
  createDocumentProfileStoreAdapter,
  initProfile
} from "@pson5/serialization-engine";
import { createPostgresProfileStoreRepository } from "@pson5/postgres-store";

const repository = await createPostgresProfileStoreRepository({
  connectionString: process.env.DATABASE_URL,
  schema: "pson5" // optional, defaults to public
});

const adapter = createDocumentProfileStoreAdapter(repository);

const profile = await initProfile(
  { user_id: "user_123", domains: ["core"], depth: "light" },
  { adapter, rootDir: ".pson5-store" }
);
```

The Postgres repository is substitutable for the file-based one in `@pson5/serialization-engine`. Any code written against `createDocumentProfileStoreAdapter(...)` works against either repository.

## Schema

The repository owns three tables in its configured schema:

| Table | Columns |
| --- | --- |
| `profile_current` | `profile_id TEXT PRIMARY KEY`, `document JSONB`, `updated_at TIMESTAMPTZ` |
| `profile_revisions` | `profile_id TEXT`, `revision INT`, `document JSONB`, `created_at TIMESTAMPTZ`, primary key `(profile_id, revision)` |
| `user_profile_index` | `user_id TEXT PRIMARY KEY`, `latest_profile_id TEXT`, `profile_ids JSONB`, `updated_at TIMESTAMPTZ` |

`createPostgresProfileStoreRepository` runs an `IF NOT EXISTS` bootstrap on first use; there are no separate migrations.

## Contract coverage

The repository passes the shared `tests/integration/postgres-store-contract.mjs` suite in CI, which exercises the same operations as the file-adapter contract (`storage-adapter-contract.mjs`):

- create / load profile
- revision bump + revision list
- `loadProfileByUserId` returns the latest profile
- `findProfilesByUserId` returns every profile owned by a user
- import idempotency (conflict without overwrite)

## Key concepts

- **The repository only deals with already-validated profiles.** Validation happens inside `@pson5/serialization-engine`. The repository stores whatever document it is given.
- **Revisions are append-only.** There is no delete path today. The revision audit trail from the serialization engine is still written to `<store>/audit/revisions.jsonl` alongside the Postgres rows.
- **Use one schema per environment.** Pass `schema: "pson5_dev"` / `"pson5_staging"` to keep namespaces clean.

## Related docs

- [Serialization Engine](./serialization-engine.md) — adapter contract this package implements.
- [Storage Architecture](../architecture/system-architecture.md) — when to use which backend.
