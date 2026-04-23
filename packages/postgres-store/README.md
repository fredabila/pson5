# `@pson5/postgres-store`

Postgres repository + schema helpers for PSON5 storage backends. Use this when you want durable, queryable profile storage on a stack your ops team already runs.

## Install

```bash
npm install @pson5/postgres-store pg
```

Targets PostgreSQL 14 or newer. `pg` (`node-postgres`) is the expected driver; the package accepts any compatible query executor, so you can swap in `postgres.js` or a custom pool if preferred.

## Schema

Before first use, apply the schema. The SQL is shipped with the package so you can run it through your migration tooling of choice:

```ts
import { createPostgresProfileStoreArtifacts } from "@pson5/postgres-store";

const { schemaSql } = createPostgresProfileStoreArtifacts({ schema: "public" });
// schemaSql is a string of CREATE TABLE statements — idempotent.
```

Pipe it into `psql`, Flyway, Atlas, or whatever you use to manage migrations.

## Usage

### Wire up a store adapter

```ts
import { Pool } from "pg";
import {
  createPostgresQueryExecutor,
  createPostgresProfileStoreRepository
} from "@pson5/postgres-store";
import { createDocumentProfileStoreAdapter } from "@pson5/serialization-engine";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const exec = createPostgresQueryExecutor(pool);
const repository = createPostgresProfileStoreRepository({ exec, schema: "public" });

// Hand the repo to the standard adapter from serialization-engine.
const store = createDocumentProfileStoreAdapter(repository);

// Now every operation (loadProfile, saveProfile, etc.) talks to Postgres.
```

### Use it from the SDK

```ts
import { createPsonSdk } from "@pson5/sdk";

const sdk = createPsonSdk({ store });   // pass the adapter above
const profile = await sdk.loadProfile("pson_abc123");
```

## Queries

The repository surfaces targeted query helpers for the common access patterns:

- `loadProfile(profile_id)` — fetch a single profile by id
- `findProfilesByUserId(user_id)` — find all profiles tied to a user
- `saveProfile(profile)` — upsert atomically (increments revision, writes audit entry)
- `deleteProfile(profile_id)` — remove profile + dependent rows in a single transaction
- `listAuditEntries(profile_id, { limit, cursor })` — paginated audit log

All queries are parameterised — no string concatenation of user-controlled data.

## Tables

| Table | Purpose |
|:---|:---|
| `pson_profiles` | one row per `.pson` profile, JSONB document column |
| `pson_profile_audit` | append-only revision log |
| `pson_domain_index` | secondary index for fast `findProfilesByUserId` lookups |

All table names are configurable via the `tablePrefix` option if `pson_` conflicts with your schema.

## Observability

Each method accepts an optional `context` parameter for structured logging:

```ts
await repository.loadProfile(profileId, { context: { request_id, trace_id } });
```

The context is attached to any emitted events so you can correlate queries with the upstream request.

## What this package does **not** do

- Does not create the database or user — run that out-of-band.
- Does not apply schema migrations itself. Use your existing migration pipeline.
- Does not enforce row-level security. Add Postgres RLS policies on top for multi-tenant isolation.

## Related

- [`@pson5/serialization-engine`](https://www.npmjs.com/package/@pson5/serialization-engine) — the abstract adapter interface this repo implements.
- [`@pson5/sdk`](https://www.npmjs.com/package/@pson5/sdk) — hand the adapter to the SDK and everything else falls into place.
- Integration test: `tests/integration/postgres-store-contract.mjs` — exercises the full adapter contract against a live Postgres instance.

## License

MIT
