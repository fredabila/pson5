# Current Direction

## Purpose

This document states the intended direction of the project as it exists now, so implementation work stays aligned with the real target and does not drift.

## Where The Project Is Now

The codebase currently implements:

- `.pson` schema validation
- profile persistence
- acquisition flows with fatigue, contradiction flags, and confidence-gap
  tracking in the learning session
- rules-based modeling
- rules-based simulation
- OpenAI- and Anthropic-backed provider augmentation for modeling and simulation
- derived state model with time-based confidence decay and trigger evaluation
  against observed facts
- generated in-profile knowledge graph
- Neo4j knowledge-graph sync (env/file config, status, Cypher-backed merge of
  profile / user / nodes / edges)
- agent tool contract layer: `@pson5/sdk` definitions plus `/v1/pson/tools/*`
  and `/v1/mcp` on the API and `pson mcp-stdio` on the CLI
- API auth stack with role + scope enforcement, tenant binding, subject-user
  binding, per-route request IDs, and profile redaction for non-privileged
  callers on read endpoints
- agent context projection with explicit redaction notes and consent gating
- SDK
- API
- CLI (Ink/React interactive console, legacy readline kept as `console-legacy`)
- web console

## What The Project Is Not Yet

The codebase does not yet implement:

- vector retrieval
- rate limiting
- distributed persistence beyond the file-backed and Postgres scaffolds
- deeper policy modeling across tenants and domains
- key rotation and trust-provider workflows for production identity

## Correct Direction

The right direction is:

1. keep PSON5 as a structured personalization layer
2. keep `.pson` as the portable standard
3. treat LLMs as optional reasoning engines around the profile, not the profile itself
4. move from file-backed internals to production-grade stores without breaking the contracts
5. treat graph/state/simulation as explainability assets, not hidden magic

## Recommended Next Technical Sequence

1. Privacy and policy hardening around provider usage
2. shared provider validation and retry hardening
3. Real datastore backends
4. Neo4j integration for external graph persistence
5. Evaluation and calibration work

## Guidance On OpenAI / Claude

OpenAI and Claude should not replace the `.pson` model. They should sit beside it.

Current state:

- OpenAI and Anthropic are now wired
- Anthropic is not yet live-tested here without a real Anthropic key
- Claude agents can integrate via the PSON agent skill
  (`skills/pson-agent/SKILL.md`), the SDK tool executor, `/v1/mcp`, or the
  local `pson mcp-stdio` transport

Recommended role:

- turn conversation into candidate structured updates
- help generate adaptive questions
- help generate bounded reasoning text
- never bypass schema validation or privacy policy

## Guidance On Neo4j

Neo4j is now available as an external persistence backend. The knowledge graph
is still the source of truth inside `.pson`, and Neo4j is synced from it:

- `@pson5/neo4j-store` exposes `saveNeo4jConfig`, `getNeo4jStatus`, and
  `syncKnowledgeGraphToNeo4j`
- the SDK wires `PsonClient.syncProfileGraph(profileId)`
- the API exposes `/v1/pson/neo4j/status` and `/v1/pson/neo4j/sync`
- the CLI adds `pson neo4j-status`, `pson neo4j-set`, `pson neo4j-wizard`,
  `pson neo4j-clear`, and `pson neo4j-sync`

Next steps: treat Neo4j as one backend implementation alongside the in-profile
graph, not the entire graph API, and keep graph node and edge shapes stable so
repository alternatives stay pluggable.

## Production Readiness Assessment

Current maturity:

- prototype / internal alpha

Not yet ready for:

- public production deployment
- sensitive-data production handling
- large-scale multi-user workloads
