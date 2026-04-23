# `@pson5/neo4j-store`

Neo4j-backed graph persistence and sync helpers for PSON5.

## Install

```bash
npm install @pson5/neo4j-store neo4j-driver
```

## What It Does

- resolves Neo4j config from env vars or a local store file
- verifies connectivity
- syncs a profile's `knowledge_graph` into Neo4j
- gives SDK and CLI surfaces a real external graph backend
