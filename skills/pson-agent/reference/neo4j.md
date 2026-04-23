# Neo4j — optional graph mirror

The PSON5 knowledge graph lives inside every `.pson` profile. Neo4j is an **optional** mirror, useful for visual exploration, cross-profile queries, or downstream graph tooling.

Three setup paths — pick one.

## 1. Local, one command (requires Docker)

```bash
# macOS / Linux / Git Bash / WSL
./scripts/neo4j-up.sh

# Windows PowerShell
.\scripts\neo4j-up.ps1
```

The script:

1. Pulls `neo4j:5.24-community` and starts it on ports 7474 (HTTP) and 7687 (Bolt)
2. Waits up to 2 minutes for the instance to become healthy
3. Writes `<store>/config/neo4j.json` so every PSON5 surface picks it up automatically

On success:

```
Neo4j Browser    http://localhost:7474
Credentials      neo4j / pson5-local-dev
Bolt URI         bolt://localhost:7687
```

Open the browser URL and log in.

## 2. Aura (free cloud, no install)

[neo4j.com/cloud/aura-free](https://neo4j.com/cloud/aura-free). Sign up, create an AuraDB Free instance, save the password, grab the Bolt URI. Then:

```bash
export PSON_NEO4J_URI="neo4j+s://<id>.databases.neo4j.io"
export PSON_NEO4J_USERNAME=neo4j
export PSON_NEO4J_PASSWORD="<your-password>"
```

Or persist it:

```bash
pson neo4j-wizard --store .pson5-store
```

## 3. No infra — `graph.html`

Every demo in `examples/` produces a self-contained HTML graph viewer under `output/`. Open it in any browser. D3 force-layout, drag-and-zoom, the observed/inferred/simulated colour grammar, sidebar with agent contexts and simulations. No install, no server, no credentials.

## Sync a profile

Once a connection is configured (paths 1 or 2):

```bash
# From any .pson export
node scripts/sync-profile-to-neo4j.mjs examples/claude-driven-persona/output/profile.json

# Or via the CLI, against a stored profile
pson neo4j-sync <profile_id> --store .pson5-store
```

The sync is idempotent — previous profile-scoped nodes are detach-deleted and rewritten in a single transaction. Safe to re-run after every learning turn.

## What ends up in Neo4j

```
(:PsonUser { user_id })
    │ OWNS_PROFILE
    ▼
(:PsonProfile { profile_id, user_id, pson_version, revision, updated_at })
    │ HAS_NODE
    ▼
(:PsonNode { profile_id, node_id, type, label, data_json })
    │ PSON_EDGE { profile_id, edge_id, edge_type, data_json }
    ▼
(:PsonNode { … })
```

Every node and relationship is tagged with `profile_id`, so cross-profile queries are always explicit.

## Useful Cypher

**Everything for one profile:**
```cypher
MATCH (p:PsonProfile { profile_id: "pson_…" })-[:HAS_NODE]->(n:PsonNode)
OPTIONAL MATCH (n)-[r:PSON_EDGE]->(m:PsonNode)
RETURN p, n, r, m;
```

**All traits across every profile:**
```cypher
MATCH (n:PsonNode { type: "trait" })
RETURN n.profile_id, n.label, n.data_json
ORDER BY n.profile_id;
```

**Shared heuristics between two users (requires sync of both profiles):**
```cypher
MATCH (p1:PsonProfile { user_id: "user_a" })-[:HAS_NODE]->(h1:PsonNode { type: "decision_rule" }),
      (p2:PsonProfile { user_id: "user_b" })-[:HAS_NODE]->(h2:PsonNode { type: "decision_rule" })
WHERE h1.node_id = h2.node_id
RETURN h1.label AS heuristic, p1.user_id, p2.user_id;
```

## Related

- Full walkthrough with troubleshooting: [docs/usage/neo4j-setup.md](https://github.com/fredabila/pson5/blob/main/docs/usage/neo4j-setup.md)
- Package reference: [docs/usage/neo4j-store.md](https://github.com/fredabila/pson5/blob/main/docs/usage/neo4j-store.md)
- Scripts directory: [scripts/](https://github.com/fredabila/pson5/tree/main/scripts)
