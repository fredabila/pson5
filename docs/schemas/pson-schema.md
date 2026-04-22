# PSON Schema

## Purpose

This document defines the canonical `.pson` document model, validation requirements, and versioning rules.

## Design Rules

- JSON-compatible document format
- explicit separation of observed, inferred, and simulated data
- portable across local and cloud deployments
- composable with domain-specific schema fragments
- versioned and migratable

## Core Document Shape

```json
{
  "pson_version": "5.0",
  "profile_id": "uuid",
  "user_id": "hashed_or_tokenized",
  "consent": {
    "granted": true,
    "scopes": ["core:read", "core:write"],
    "policy_version": "2026-04-22",
    "updated_at": "2026-04-22T00:00:00Z"
  },
  "domains": {
    "active": ["core", "education"],
    "depth": "standard"
  },
  "layers": {
    "observed": {},
    "inferred": {},
    "simulated": {}
  },
  "cognitive_model": {
    "thinking_style": {},
    "learning_style": {},
    "processing_patterns": {}
  },
  "behavioral_model": {
    "decision_functions": [],
    "action_patterns": [],
    "motivation_model": {}
  },
  "state_model": {
    "states": [],
    "transitions": []
  },
  "knowledge_graph": {
    "nodes": [],
    "edges": []
  },
  "simulation_profiles": {
    "scenarios": [],
    "domains": {}
  },
  "privacy": {
    "encryption": true,
    "access_levels": {},
    "local_only": false,
    "restricted_fields": []
  },
  "metadata": {
    "confidence": 0.0,
    "created_at": "2026-04-22T00:00:00Z",
    "updated_at": "2026-04-22T00:00:00Z",
    "source_count": 0,
    "revision": 1
  }
}
```

## Field Requirements

### Root Fields

- `pson_version`: required string, semantic document version
- `profile_id`: required stable identifier
- `user_id`: required tokenized or hashed user identifier
- `consent`: required object
- `domains`: required object
- `layers`: required object
- `privacy`: required object
- `metadata`: required object

### Recommended Root Fields

- `cognitive_model`
- `behavioral_model`
- `state_model`
- `knowledge_graph`
- `simulation_profiles`

These may start minimally populated but should exist in exported v5 profiles for consistency.

## Layer Semantics

### `layers.observed`

Contains:

- direct user answers
- directly measured behavioral events
- explicit corrections
- imported historical records with source tags

Must not contain:

- model guesses
- scenario predictions

### `layers.inferred`

Contains:

- traits
- patterns
- heuristics
- state likelihood snapshots where stored durably

Must include confidence and evidence metadata for meaningful entries.

### `layers.simulated`

Contains:

- cached scenario outputs
- simulation summaries
- counterfactual results

Must never be treated as durable truth without supporting observed updates.

### `simulation_profiles`

Contains structured simulation-related artifacts intended for reuse or inspection.

Recommended subkeys:

- `scenarios`: cached scenario outputs
- `domains`: domain-specific simulation settings, templates, or summaries

## Shared Metadata Shapes

### Evidence Reference

```json
{
  "source_type": "answer|event|correction|import|simulation_feedback",
  "source_id": "string",
  "recorded_at": "ISO-8601",
  "weight": 0.0
}
```

### Confidence Record

```json
{
  "score": 0.0,
  "method": "rule|statistical|hybrid",
  "last_validated_at": "ISO-8601",
  "decay_policy": {
    "kind": "time_decay",
    "half_life_days": 30
  },
  "evidence": []
}
```

### Access Tag

```json
{
  "level": "public|private|restricted",
  "scope": "domain:action",
  "reason": "string"
}
```

## Domain Composition Model

The schema system should be composed from:

1. core schema
2. shared metadata definitions
3. built-in domain fragments
4. optional custom domain fragments

Validation must fail if:

- a domain fragment collides with reserved root keys
- a custom domain redefines a core type incompatibly
- restricted data is declared without access tags

## Minimal Valid Profile

A minimal valid profile should support initialization before learning:

```json
{
  "pson_version": "5.0",
  "profile_id": "pson_123",
  "user_id": "user_token_abc",
  "consent": {
    "granted": true,
    "scopes": ["core:read", "core:write"],
    "policy_version": "2026-04-22",
    "updated_at": "2026-04-22T00:00:00Z"
  },
  "domains": {
    "active": ["core"],
    "depth": "light"
  },
  "layers": {
    "observed": {},
    "inferred": {},
    "simulated": {}
  },
  "privacy": {
    "encryption": false,
    "access_levels": {},
    "local_only": true,
    "restricted_fields": []
  },
  "metadata": {
    "confidence": 0,
    "created_at": "2026-04-22T00:00:00Z",
    "updated_at": "2026-04-22T00:00:00Z",
    "source_count": 0,
    "revision": 1
  }
}
```

## Versioning Rules

- Major version changes can break field compatibility.
- Minor version changes may add optional fields but not remove required ones.
- Patch versions should not change data meaning.

## Migration Rules

Every supported version must define:

- source version
- target version
- transform steps
- validation after transform
- behavior for unknown domain fragments

## Validation Requirements

Validation should run:

- on profile init
- on profile update
- on import
- on export
- before simulation when loading stored documents

Validation must cover:

- required fields
- enum values
- timestamp format
- confidence bounds
- access tag completeness
- domain fragment compatibility

## Reserved Keys

Custom domains may not define these root keys:

- `pson_version`
- `profile_id`
- `user_id`
- `consent`
- `domains`
- `layers`
- `privacy`
- `metadata`
- `cognitive_model`
- `behavioral_model`
- `state_model`
- `knowledge_graph`
- `simulation_profiles`

## Initial Deliverables

- JSON Schema for core profile
- schema test fixtures
- example profiles for `core`, `education`, and `productivity`
- migration scaffold for future minor versions
