# `@pson5/postgres-store`

Postgres repository and schema helpers for PSON5 storage backends.

## Install

```bash
npm install @pson5/postgres-store
```

## Usage

```ts
import {
  createPostgresProfileStoreArtifacts,
  createPostgresProfileStoreRepository,
  createPostgresQueryExecutor
} from "@pson5/postgres-store";
```

## What It Includes

- schema SQL generation
- repository implementation
- query executor adapter
- compatibility with `createDocumentProfileStoreAdapter(...)`
