# API Contract

## Purpose

This document defines the HTTP surface for PSON5. It is the authoritative contract for request and response shapes, lifecycle semantics, and error handling.

## API Conventions

- base path: `/v1`
- JSON request and response bodies
- ISO-8601 timestamps
- explicit versioning in both path and response metadata
- idempotency keys for retriable writes where relevant

## Authentication and Authorization

The gateway must support pluggable auth. The API contract assumes:

- caller identity is resolved before business logic
- every request is evaluated against consent scopes
- restricted fields are redacted when caller scope is insufficient

## Standard Response Envelope

Success:

```json
{
  "data": {},
  "meta": {
    "version": "v1",
    "request_id": "req_123",
    "timestamp": "2026-04-22T00:00:00Z"
  }
}
```

Error:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid profile payload",
    "details": []
  },
  "meta": {
    "version": "v1",
    "request_id": "req_123",
    "timestamp": "2026-04-22T00:00:00Z"
  }
}
```

## Endpoints

### POST `/v1/pson/init`

Creates a new profile shell.

Request:

```json
{
  "user_id": "tokenized_user_id",
  "domains": ["core"],
  "depth": "light",
  "consent": {
    "granted": true,
    "scopes": ["core:read", "core:write"]
  },
  "privacy": {
    "local_only": false,
    "allow_sensitive": false
  }
}
```

Response:

```json
{
  "data": {
    "profile_id": "pson_123",
    "revision": 1,
    "next_action": "learn"
  },
  "meta": {}
}
```

### POST `/v1/pson/learn`

Accepts observed inputs and updates the profile.

Request:

```json
{
  "profile_id": "pson_123",
  "session_id": "learn_456",
  "domain": "education",
  "answers": [
    {
      "question_id": "edu_study_start",
      "value": "I usually delay until the day before"
    }
  ],
  "events": [],
  "options": {
    "run_modeling": true,
    "return_next_questions": true
  }
}
```

Response:

```json
{
  "data": {
    "revision": 2,
    "updated_fields": [
      "layers.observed.education",
      "layers.inferred.behavioral_model"
    ],
    "next_questions": []
  },
  "meta": {}
}
```

### POST `/v1/pson/question/next`

Returns the next best question set for a profile and active session.

Request:

```json
{
  "profile_id": "pson_123",
  "session_id": "learn_456",
  "domains": ["core", "education"],
  "depth": "standard"
}
```

Response:

```json
{
  "data": {
    "questions": [
      {
        "id": "core_problem_solving_style",
        "prompt": "Do you prefer to plan first or figure it out as you go?",
        "type": "single_choice",
        "domain": "core"
      }
    ]
  },
  "meta": {}
}
```

### POST `/v1/pson/simulate`

Runs a simulation against a stored profile.

Request:

```json
{
  "profile_id": "pson_123",
  "context": {
    "task": "study for exam",
    "deadline_days": 2,
    "difficulty": "high"
  },
  "assumed_state": null,
  "options": {
    "include_reasoning": true,
    "include_evidence": true
  }
}
```

Response:

```json
{
  "data": {
    "prediction": "delayed_start",
    "confidence": 0.74,
    "reasoning": [
      "Observed answers indicate delayed task initiation under low urgency.",
      "Inferred heuristic suggests deadline-driven engagement."
    ],
    "evidence": [
      {
        "source_id": "answer_123",
        "source_type": "answer"
      }
    ],
    "caveats": [
      "Limited scenario-specific evidence for exam preparation."
    ]
  },
  "meta": {}
}
```

### PATCH `/v1/pson/update`

Applies targeted changes such as consent updates, domain activation, or explicit corrections.

Request:

```json
{
  "profile_id": "pson_123",
  "operations": [
    {
      "op": "replace",
      "path": "/domains/depth",
      "value": "deep"
    }
  ]
}
```

### GET `/v1/pson/profile/{profile_id}`

Returns the current profile snapshot subject to access scope.

### GET `/v1/pson/export`

Exports a validated `.pson` document.

Query parameters:

- `profile_id`
- `format=json`
- `redaction=none|restricted|public`

### POST `/v1/pson/import`

Imports a `.pson` document after validation and migration.

### POST `/v1/pson/validate`

Validates a profile payload or export candidate without persisting it.

### POST `/v1/pson/feedback`

Submits feedback on a prediction outcome so the system can update confidence and heuristics.

## Error Codes

- `validation_error`
- `unauthorized`
- `forbidden_scope`
- `profile_not_found`
- `schema_version_unsupported`
- `domain_module_invalid`
- `privacy_policy_violation`
- `simulation_unavailable`
- `conflict`

## Lifecycle Rules

- `init` creates revision `1`.
- successful learning or updates increment revision.
- import must run migration before persistence.
- export must validate before returning data.
- simulate must not mutate durable profile state unless explicit feedback is submitted separately.

## Idempotency Rules

- `POST /pson/init` should support an idempotency key for retries.
- `POST /pson/learn` should deduplicate duplicate session submissions where feasible.
- `POST /pson/feedback` should reject duplicate outcome events for the same source event unless explicitly versioned.

## Observability Requirements

Each request should produce:

- request id
- actor id
- profile id when applicable
- consent evaluation result
- timing metrics
- redaction decision if any fields were filtered
