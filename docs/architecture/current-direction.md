# Current Direction

## Purpose

This document states the intended direction of the project as it exists now, so implementation work stays aligned with the real target and does not drift.

## Where The Project Is Now

The codebase currently implements:

- `.pson` schema validation
- profile persistence
- acquisition flows
- rules-based modeling
- rules-based simulation
- OpenAI- and Anthropic-backed provider augmentation for modeling and simulation
- derived state model
- generated in-profile knowledge graph
- SDK
- API
- CLI
- web console

## What The Project Is Not Yet

The codebase does not yet implement:

- Claude integration
- Neo4j integration
- vector retrieval
- production auth
- production privacy enforcement depth
- distributed persistence

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

Recommended role:

- turn conversation into candidate structured updates
- help generate adaptive questions
- help generate bounded reasoning text
- never bypass schema validation or privacy policy

## Guidance On Neo4j

Neo4j should become an external persistence and traversal backend for the knowledge graph, but only after the current graph contracts are stable.

That means:

- keep graph node and edge shapes stable first
- add a graph repository layer second
- make Neo4j one backend implementation, not the entire graph API

## Production Readiness Assessment

Current maturity:

- prototype / internal alpha

Not yet ready for:

- public production deployment
- sensitive-data production handling
- large-scale multi-user workloads
