# @pson5/neo4j-store

> Optional Neo4j persistence for the PSON5 knowledge graph. Configuration, status, and idempotent profile-scoped sync via Cypher MERGE.

## Install

```bash
npm install @pson5/neo4j-store
```

`neo4j-driver` is a peer dependency and is installed transitively.

## What this package does

PSON5 always keeps the graph inside the `.pson` profile. This package lets you optionally mirror that graph to a Neo4j database so you can run cross-profile queries, render it in tools like Bloom, or feed it into downstream graph workloads.

Three responsibilities:

1. **Configuration** — resolve a connection from env vars first, then from `<store>/config/neo4j.json`. Save / clear the stored config.
2. **Status** — confirm connectivity, report the server agent / protocol version, or surface the reason the connection is disabled or misconfigured.
3. **Sync** — write a profile's current knowledge graph to Neo4j with `MERGE` semantics, scoped by `profile_id`. Safe to run repeatedly; previous profile-scoped nodes are detached and replaced on each sync.

## Exports

```ts
import {
  getStoredNeo4jConfig,
  saveNeo4jConfig,
  clearStoredNeo4jConfig,
  getNeo4jStatus,
  syncKnowledgeGraphToNeo4j,
  syncStoredProfileKnowledgeGraph
} from "@pson5/neo4j-store";
```

## Configuration

| Env var | Default |
| --- | --- |
| `PSON_NEO4J_URI` | — |
| `PSON_NEO4J_USERNAME` | — |
| `PSON_NEO4J_PASSWORD` | — |
| `PSON_NEO4J_DATABASE` | — (driver default) |
| `PSON_NEO4J_ENABLED` | `true` |

Persisted config lives at `<store>/config/neo4j.json`. The CLI wizard (`pson neo4j-wizard`) and HTTP admin routes write it.

## Usage

### Configure

```ts
import { saveNeo4jConfig, clearStoredNeo4jConfig } from "@pson5/neo4j-store";

await saveNeo4jConfig(
  {
    uri: "neo4j+s://example.databases.neo4j.io",
    username: "neo4j",
    password: "***",
    database: null,
    enabled: true
  },
  { rootDir: ".pson5-store" }
);

await clearStoredNeo4jConfig({ rootDir: ".pson5-store" });
```

### Check status

```ts
import { getNeo4jStatus } from "@pson5/neo4j-store";

const status = await getNeo4jStatus({ rootDir: ".pson5-store" });
// {
//   configured, enabled, connected,
//   uri, database, username, source: "env" | "file" | "none",
//   reason?: string,
//   server_agent?: string,
//   server_protocol_version?: string
// }
```

### Sync a profile's graph

```ts
import {
  syncKnowledgeGraphToNeo4j,
  syncStoredProfileKnowledgeGraph
} from "@pson5/neo4j-store";

const result = await syncStoredProfileKnowledgeGraph("pson_123", {
  rootDir: ".pson5-store"
});
// { profile_id, user_id, node_count, edge_count, uri, database, synced_at }

// Or sync an in-memory profile directly:
await syncKnowledgeGraphToNeo4j(profile, { rootDir: ".pson5-store" });
```

## Cypher schema

A single profile sync runs four statements in a single transaction:

1. `MERGE (profile:PsonProfile {profile_id})` — upsert profile metadata.
2. `MERGE (user:PsonUser {user_id}) -[:OWNS_PROFILE]-> (profile)` — link owner.
3. `MATCH (profile) -[:HAS_NODE]-> (node) DETACH DELETE node` — clear previous nodes for this profile.
4. `UNWIND $nodes … MERGE (graphNode:PsonNode {profile_id, node_id})` + `MERGE (profile) -[:HAS_NODE]-> (graphNode)` — add nodes.
5. `UNWIND $edges … MERGE (from)-[rel:PSON_EDGE {profile_id, edge_id}]->(to)` — add edges.

Every node and relationship is tagged with `profile_id` so querying for cross-profile structure is explicit.

## Key concepts

- **Neo4j is not the source of truth.** The `.pson` profile is. Sync is one-way: profile → Neo4j. A lost Neo4j instance is recoverable from the profile; the inverse is not guaranteed.
- **Sync is idempotent.** Re-running on an unchanged profile re-writes the same nodes and edges. Running on a changed profile drops the previous profile-scoped nodes and writes the new ones atomically.
- **Env beats file.** Set `PSON_NEO4J_*` in production; let the stored config handle local dev.
- **Check status before sync.** `getNeo4jStatus` is cheap and returns `reason` when something's wrong. The API's `/v1/pson/neo4j/status` wraps it.

## Related docs

- [Graph Engine](./graph-engine.md) — builds the graph that is synced.
- [System Architecture](../architecture/system-architecture.md) — where Neo4j sits in the stack.
