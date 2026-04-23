# `@pson5/neo4j-store`

Neo4j-backed graph persistence and sync helpers for PSON5. The `.pson` profile remains the source of truth; Neo4j is an optional mirror for cross-profile traversal, visualization, or any downstream graph tooling that expects Cypher.

## Install

```bash
npm install @pson5/neo4j-store neo4j-driver
```

Requires a reachable Neo4j 5.x instance (Aura, Docker, or self-hosted). See the [one-command Docker setup](https://github.com/fredabila/pson5/blob/main/docs/usage/neo4j-setup.md) if you need one locally.

## Configuration

Credentials resolve from environment first, then from `<store>/config/neo4j.json`:

```bash
export PSON_NEO4J_URI="neo4j+s://<id>.databases.neo4j.io"
export PSON_NEO4J_USERNAME=neo4j
export PSON_NEO4J_PASSWORD="<your-password>"
export PSON_NEO4J_DATABASE=neo4j      # optional
```

Persisting credentials via `saveNeo4jConfig` writes a file with `0600` permissions on POSIX systems.

## Usage

### Check whether Neo4j is reachable

```ts
import { getNeo4jStatus } from "@pson5/neo4j-store";

const status = await getNeo4jStatus({ rootDir: ".pson5-store" });
console.log(status);
// { configured: true, enabled: true, connected: true, uri: "bolt://…", database: "neo4j", latency_ms: 42 }
```

### Sync a profile's knowledge graph

```ts
import { loadProfile } from "@pson5/serialization-engine";
import { syncProfileToNeo4j } from "@pson5/neo4j-store";

const profile = await loadProfile("pson_abc123", { rootDir: ".pson5-store" });
const result = await syncProfileToNeo4j(profile, { rootDir: ".pson5-store" });

console.log(`${result.nodes_written} nodes, ${result.edges_written} edges`);
```

The sync is **idempotent**: re-running with the same profile produces the same graph state. Nodes are keyed by `(profile_id, node_id)`; edges by `(profile_id, from, to, relation)`.

### Query from Cypher directly

After sync, you can open the Neo4j Browser and run:

```cypher
MATCH (p:PsonProfile {profile_id: $id})-[:HAS_NODE]->(n)-[r:PSON_EDGE]->(m)
RETURN p, n, r, m;
```

All Cypher written by this package uses parameterised queries — no string concatenation of user-controlled data.

## What this package does **not** do

- Does not hold a long-lived driver connection — each call opens and closes its own session. Integrate with `@pson5/sdk` or your own pool if you need persistent connections.
- Does not replicate the entire profile. Only `knowledge_graph.nodes` and `knowledge_graph.edges` are mirrored; observed / inferred / simulated layers remain in the `.pson` file.
- Does not enforce consent scopes. The caller is expected to project/redact via `@pson5/privacy` or `@pson5/agent-context` before syncing if that matters.

## Related

- [`@pson5/graph-engine`](https://www.npmjs.com/package/@pson5/graph-engine) — deterministic in-memory graph construction from a profile. You don't need Neo4j to produce a graph.
- [`@pson5/sdk`](https://www.npmjs.com/package/@pson5/sdk) — the primary entry point if you want everything wired together.

## License

MIT
