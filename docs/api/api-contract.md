# API Contract

> Authoritative reference for the `@pson5/api` HTTP surface. Covers every implemented route, auth model, response shapes, error codes, and the request-correlation + audit plumbing.

## Base URL and versioning

- Base path: `/v1`
- JSON request and response bodies
- ISO-8601 timestamps throughout
- Every response includes the header `x-pson-request-id: req_<uuid>` (echoed from the inbound header if present; generated otherwise)

## Authentication

The API supports two authentication modes and enforces both layers simultaneously when configured.

### API key

Set `PSON_API_KEY=<secret>` to require an `x-api-key` header on every non-`/health` request.

### Signed identity (JWT)

Set one of `PSON_JWT_SECRET` (HS256), `PSON_JWT_PUBLIC_KEY` (RS256 via PEM), `PSON_JWKS_JSON` (inline JWKS), `PSON_JWKS_PATH` (file), or `PSON_JWKS_URL` (remote with in-process caching) to require a `Bearer` token in the `authorization` header. Claims are extracted using:

| Claim | Env override |
| --- | --- |
| `sub` | `PSON_JWT_CALLER_ID_CLAIM` |
| `tenant_id` | `PSON_JWT_TENANT_CLAIM` |
| `user_id` | `PSON_JWT_USER_ID_CLAIM` |
| `role` | `PSON_JWT_ROLE_CLAIM` |
| `scopes` | `PSON_JWT_SCOPES_CLAIM` |

`iss` and `aud` are enforced when `PSON_JWT_ISSUER` / `PSON_JWT_AUDIENCE` are set. `nbf` and `exp` are always enforced. JWKS responses are cached for `PSON_JWKS_CACHE_TTL_MS` (default `300000`). `PSON_REQUIRE_SIGNED_IDENTITY=true` makes the JWT mandatory even when an API key is also present.

### Identity headers

When signed identity isn't available, the API falls back to trust-on-deploy headers (suitable only behind a trusted proxy):

| Header | Purpose | Env override |
| --- | --- | --- |
| `x-pson-tenant-id` | Tenant binding (required when `PSON_ENFORCE_TENANT=true`) | `PSON_TENANT_HEADER` |
| `x-pson-caller-id` | Caller identifier (required when `PSON_REQUIRE_CALLER_ID=true`) | `PSON_CALLER_ID_HEADER` |
| `x-pson-user-id` | Subject-user binding (enforced when `PSON_ENFORCE_SUBJECT_USER=true`) | `PSON_SUBJECT_USER_HEADER` |
| `x-pson-role` | Caller role (`viewer` \| `editor` \| `admin`) | `PSON_ROLE_HEADER` |
| `x-pson-scopes` | Space- or comma-separated caller scopes | `PSON_SCOPE_HEADER` |

When the JWT is present its claims override these headers.

## Authorization model

Every route declares a required **role** and **scope** set. The caller must hold `role >= required` and contain every required scope. The role ordering is:

```
anonymous < viewer < editor < admin
```

Non-admin callers are additionally subject to:

- **Tenant binding** — profile.tenant_id must match the request's tenant.
- **Subject-user binding** — profile.user_id must match the authenticated subject user when `PSON_ENFORCE_SUBJECT_USER=true`.
- **Profile redaction** — reads of full profiles return a `safe`-redacted variant unless the caller has role `admin` or the scope `profiles:admin`.

## Error response envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "profile_id is required."
  }
}
```

Every error also includes the `x-pson-request-id` header. Canonical error codes:

| Code | HTTP | Raised when |
| --- | --- | --- |
| `bad_request` | 400 | Malformed request (missing URL / method / body parse failure). |
| `validation_error` | 400 | Required field missing or invalid value. |
| `unauthorized` | 401 | No / invalid API key or JWT. |
| `forbidden` | 403 | Role insufficient, scope missing, subject-user mismatch, full-view denied. |
| `tenant_mismatch` | 403 | Request tenant header does not match profile tenant. |
| `profile_not_found` | 404 | No profile with the given id or user id. |
| `conflict` | 409 | Import without overwrite on an existing profile. |
| `tool_unsupported` | 400 | JSON-RPC / MCP call for an unknown tool. |

## Observability

Every authenticated request is written to `<store>/audit/api-access.jsonl` with:

- `timestamp`, `request_id`, `route`, `method`, `operation`
- `decision: "allowed" | "denied"`, `status_code`, `reason`
- `auth_source`, `caller_id`, `subject_user_id`, `caller_role`, `caller_scopes`
- `tenant_id`, `profile_id`, `user_id`
- `required_role`, `required_scopes`
- `redaction_applied`, `redaction_level`, `duration_ms`

---

# Endpoints

## Health

### `GET /health`

No auth required. Returns the service status, configured security mode, and store backend.

```json
{
  "data": {
    "status": "ok",
    "service": "@pson5/api",
    "provider": { "configured": true, "provider": "openai", "model": "gpt-4.1-mini" },
    "security": {
      "api_key_required": true,
      "signed_identity_enabled": true,
      "signed_identity_required": false,
      "signed_identity_mode": "jwks",
      "jwt_issuer": "https://example.com",
      "jwt_audience": "pson5-api",
      "jwks_url": "https://example.com/.well-known/jwks.json",
      "jwks_cache_ttl_ms": 300000,
      "tenant_enforced": true,
      "tenant_header": "x-pson-tenant-id",
      "caller_id_required": true,
      "caller_id_header": "x-pson-caller-id",
      "subject_user_enforced": true,
      "subject_user_header": "x-pson-user-id",
      "role_header": "x-pson-role",
      "scope_header": "x-pson-scopes"
    },
    "store": { "backend": "file", "root_dir": ".pson5-store" }
  }
}
```

---

## Profiles

### `POST /v1/pson/init`
Role `editor` · Scopes `profiles:write`

Create a new profile shell.

Request:
```json
{
  "user_id": "user_123",
  "tenant_id": "tenant_acme",
  "domains": ["core"],
  "depth": "light",
  "consent": { "granted": true, "scopes": ["core:read", "core:write", "simulation:run"] },
  "privacy": { "encryption": false, "local_only": false, "restricted_fields": [] }
}
```

Response: the full `PsonProfile` (revision 1).

### `GET /v1/pson/profile/{profile_id}`
Role `viewer` · Scopes `profiles:read`

Returns the profile. By default the response is `safe`-redacted (restricted observed facts stripped, `layers.inferred.ai_model` dropped, `user_id` anonymised). Admins or callers with scope `profiles:admin` may request `?redaction_level=full` to receive the unredacted profile. Non-admins requesting `full` receive `forbidden`.

### `GET /v1/pson/profile-by-user?user_id={user_id}`
Role `viewer` · Scopes `profiles:read`

Returns the latest profile for a user plus the full `profile_ids` list. Same redaction semantics as `/v1/pson/profile/:id`. Subject-user binding is enforced.

Response:
```json
{
  "user_id": "user_123",
  "profile": { /* PsonProfile (safe by default) */ },
  "profile_ids": ["pson_123", "pson_456"]
}
```

### `GET /v1/pson/export?profile_id={id}&redaction_level={safe|full}`
Role `viewer` (for `safe`) · `admin` (for `full`)
Scopes `profiles:read`, `export:safe` (for `safe`) or `export:full` (for `full`)

Streams the serialized `.pson` document as JSON. `safe` is the default.

### `POST /v1/pson/import`
Role `editor` · Scopes `profiles:write`

Request:
```json
{
  "document": { /* full PsonProfile document */ },
  "overwrite": false
}
```

Response:
```json
{
  "profile_id": "pson_123",
  "tenant_id": "tenant_acme",
  "revision": 7,
  "imported": true
}
```

Errors:
- `conflict` if the profile id already exists and `overwrite: false`.
- `tenant_mismatch` if `enforce_tenant` is on and the imported tenant differs from the request tenant.
- `validation_error` if the document fails schema validation.

### `POST /v1/pson/validate`
Role `viewer` · Scopes `system:read`

Validates a candidate document without persisting it. Returns:

```json
{
  "success": true,
  "issues": [],
  "value": { /* the parsed profile if valid */ }
}
```

---

## Learning

### `POST /v1/pson/question/next`
Role `editor` · Scopes `profiles:write`

Request:
```json
{
  "profile_id": "pson_123",
  "session_id": "learn_1776913414584",
  "domains": ["core", "education"],
  "depth": "standard",
  "limit": 1
}
```

Response:
```json
{
  "session_id": "learn_1776913414584",
  "session": { /* full LearningSessionState */ },
  "questions": [ /* QuestionDefinition[] */ ]
}
```

`session.confidence_gaps`, `session.fatigue_score`, `session.contradiction_flags`, and `session.stop_reason` are always populated. An empty `questions` array with `session.stop_reason` set is the "pause" signal.

### `POST /v1/pson/learn`
Role `editor` · Scopes `profiles:write`

Request:
```json
{
  "profile_id": "pson_123",
  "session_id": "learn_1776913414584",
  "domains": ["core"],
  "depth": "standard",
  "answers": [
    { "question_id": "core_deadline_effect", "value": "mixed" }
  ],
  "options": {
    "return_next_questions": true,
    "next_question_limit": 1
  }
}
```

Response:
```json
{
  "session": { /* LearningSessionState */ },
  "profile": { /* updated PsonProfile */ },
  "updated_fields": ["layers.observed.core.answers.core_deadline_effect", "layers.inferred.core", "state_model", "knowledge_graph"],
  "next_questions": [ /* QuestionDefinition[] */ ]
}
```

Triggers the full pipeline: acquisition → modeling → state → graph → save. Revision is bumped atomically.

---

## Simulation

### `POST /v1/pson/simulate`
Role `editor` · Scopes `profiles:write`, `simulation:run`

Request:
```json
{
  "profile_id": "pson_123",
  "context": { "task": "study for exam", "deadline_days": 2, "difficulty": "high" },
  "domains": ["core", "education"],
  "options": {
    "include_reasoning": true,
    "include_evidence": true,
    "explanation_level": "standard"
  }
}
```

Response:
```json
{
  "prediction": "delayed_start",
  "confidence": 0.72,
  "reasoning": ["Observed task_start_pattern = delay_start", "..."],
  "evidence": [{ "source_type": "answer", "source_id": "answer_...", "weight": 1 }],
  "caveats": ["Limited exam-specific evidence."],
  "alternatives": ["compressed_preparation"],
  "context_hash": "ab12…",
  "cached": false,
  "provider": { "mode": "rules", "provider": "openai", "model": "gpt-4.1-mini" }
}
```

`cached: true` indicates the result came from `<store>/simulations/<profile_id>/` and the profile revision hasn't changed since it was generated.

---

## Agent context

### `POST /v1/pson/agent-context`
Role `viewer` · Scopes `profiles:read`, `agent-context:read`

Request:
```json
{
  "profile_id": "pson_123",
  "intent": "help the user plan a deadline-sensitive task",
  "domains": ["core", "education"],
  "max_items": 6,
  "include_predictions": true,
  "min_confidence": 0.6,
  "task_context": { "task": "exam prep", "deadline_days": 2 }
}
```

Response: the full `PsonAgentContext` including `redaction_notes` (see [Agent Context](../usage/agent-context.md)). When `profile.consent.granted === false` the response has an empty `personal_data` payload and a single `consent_not_granted` redaction note.

---

## State, graph, explain

### `GET /v1/pson/state/{profile_id}`
Role `viewer` · Scopes `profiles:read`

Returns the state snapshot with decay + trigger evaluation applied:

```json
{
  "profile_id": "pson_123",
  "generated_at": "2026-04-23T08:00:00.000Z",
  "evaluated_triggers": ["deadline_pressure", "clear_structure"],
  "decay_applied": true,
  "active_states": [
    {
      "state_id": "stressed",
      "likelihood": 0.82,
      "base_confidence": 0.72,
      "decayed_confidence": 0.69,
      "trigger_boost": 0.13,
      "matched_triggers": ["deadline_pressure"]
    }
  ]
}
```

### `GET /v1/pson/graph/{profile_id}`
Role `viewer` · Scopes `profiles:read`

Returns `profile.knowledge_graph` (nodes + edges).

### `GET /v1/pson/explain?profile_id={id}&prediction={name}`
Role `viewer` · Scopes `profiles:read`

Returns the legacy support shape:

```json
{
  "prediction": "delayed_start",
  "support": [
    "Supports deadline_driven_activation: core.task_start_pattern -[reinforces]-> deadline_driven_activation"
  ]
}
```

For richer output (paths, missing targets, target node ids) call `explainPrediction` via the SDK or MCP.

---

## Provider

### `GET /v1/pson/provider/status`
Role `viewer` · Scopes `system:read`

Query params (optional):
- `profile_id` — if provided, the response includes the per-profile policy decision.
- `operation` — `modeling` or `simulation` (required when `profile_id` is set).

Response (no profile_id):
```json
{
  "data": {
    "configured": true,
    "enabled": true,
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "base_url": "https://api.openai.com/v1",
    "timeout_ms": 20000,
    "source": "env"
  }
}
```

Response (with profile_id + operation): adds `allowed`, `reason`, `required_scopes`, `missing_scopes`, `redacted_fields` to `data`.

---

## Neo4j

### `GET /v1/pson/neo4j/status`
Role `viewer` · Scopes `system:read`

Returns the connectivity and configuration state of the Neo4j integration:
```json
{
  "data": {
    "configured": true, "enabled": true, "connected": true,
    "uri": "neo4j+s://…", "database": null, "username": "neo4j",
    "source": "env",
    "server_agent": "Neo4j/5.x",
    "server_protocol_version": "5.0"
  }
}
```

### `POST /v1/pson/neo4j/sync`
Role `editor` · Scopes `profiles:write`, `graph:sync`

Request:
```json
{ "profile_id": "pson_123" }
```

Response:
```json
{
  "data": {
    "profile_id": "pson_123",
    "user_id": "user_123",
    "node_count": 7,
    "edge_count": 12,
    "uri": "neo4j+s://…",
    "database": null,
    "synced_at": "2026-04-23T08:00:00.000Z"
  }
}
```

---

## Agent tool transports

These routes expose the same SDK tool executor to remote agents.

### `GET /v1/pson/tools/definitions`
Role `viewer` · Scopes `system:read`

Returns the list of `{ type: "function", name, description, input_schema }` tool definitions (framework-neutral).

### `GET /v1/pson/tools/openai`
Role `viewer` · Scopes `system:read`

Same definitions rewritten in OpenAI function-calling shape (`parameters` instead of `input_schema`).

### `POST /v1/pson/tools/execute`
Role / scopes depend on the tool (see per-tool policy below).

Request:
```json
{ "name": "pson_get_agent_context", "arguments": { "profile_id": "pson_123", "intent": "study plan" } }
```

Response: the raw tool result. Errors follow the standard envelope.

### `POST /v1/mcp`
Role / scopes depend on the tool. Min role `viewer`, `system:read` for discovery methods.

Minimal MCP-style JSON-RPC transport. Supported methods:

- `initialize` — returns server capabilities and info.
- `ping` — returns `{}`.
- `tools/list` — returns `{ tools: MCPTool[] }`.
- `tools/call` — executes a tool and returns `{ content: [{ type: "text", text }], structuredContent }`.

### Per-tool policy

| Tool | Role | Scopes |
| --- | --- | --- |
| `pson_load_profile_by_user_id` | viewer | `profiles:read` |
| `pson_create_profile` | editor | `profiles:write` |
| `pson_get_agent_context` | viewer | `profiles:read`, `agent-context:read` |
| `pson_get_next_questions` | editor | `profiles:write` |
| `pson_learn` | editor | `profiles:write` |
| `pson_simulate` | editor | `profiles:write`, `simulation:run` |
| `pson_get_provider_policy` | viewer | `profiles:read` |

---

## Lifecycle rules

- `init` writes revision `1`.
- `learn` bumps the revision and triggers modeling → state → graph → save atomically.
- `import` validates + optional overwrite; respects tenant binding.
- `export` always validates before returning.
- `simulate` is read-only against the durable profile. Its cached result lives under `<store>/simulations/<profile_id>/` keyed by `context_hash` + `profile_revision`.
- `/health` is unauthenticated and never writes to the audit log.

## Rate limiting

Not currently implemented. Wrap the API behind a reverse proxy (nginx, CloudFront, Cloudflare) if you need per-caller quotas. See `PSON5_SCOPE.md §19` for the deferred design notes.
