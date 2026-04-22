# API Quickstart

## Purpose

This document shows the current practical use of the PSON5 API.

Implementation:

- [api/src/server.ts](/C:/Users/user/pson5/apps/api/src/server.ts)

## Start The API

```powershell
$env:PSON_STORE_DIR='C:\Users\user\pson5\.pson5-store'
$env:PORT='3015'
npm run dev --workspace @pson5/api
```

## Store Backend Selection

The API now supports backend selection at startup:

### File Backend

```powershell
$env:PSON_STORE_BACKEND='file'
$env:PSON_STORE_DIR='C:\Users\user\pson5\.pson5-store'
npm run dev --workspace @pson5/api
```

### Memory Backend

```powershell
$env:PSON_STORE_BACKEND='memory'
npm run dev --workspace @pson5/api
```

### Postgres Backend

This backend requires:

- the `pg` package in the runtime environment
- a connection string via `PSON_PG_CONNECTION_STRING` or `DATABASE_URL`
- the schema from [001_init.sql](/C:/Users/user/pson5/packages/postgres-store/sql/001_init.sql)

```powershell
$env:PSON_STORE_BACKEND='postgres'
$env:PSON_PG_CONNECTION_STRING='postgres://user:pass@host:5432/db'
$env:PSON_PG_SCHEMA='public'
npm run dev --workspace @pson5/api
```

Optional:

```powershell
$env:PSON_PG_APPLY_SCHEMA='true'
```

That tells the API to execute the generated schema SQL at startup.

## Optional Auth And Tenant Enforcement

The API now supports minimal deployment-facing access controls.

### API Key Auth

If `PSON_API_KEY` is set, all non-health routes require either:

- `x-api-key: <value>`
- `authorization: Bearer <value>`

```powershell
$env:PSON_API_KEY='replace-with-real-secret'
```

When JWT signed identity is enabled, prefer `x-api-key` for the API key and reserve `authorization: Bearer ...` for the JWT.

### Signed Identity With JWT

The API can now derive caller identity, tenant, subject user, role, and scopes from a signed bearer token.

```powershell
$env:PSON_JWT_SECRET='replace-with-hs256-secret'
$env:PSON_REQUIRE_SIGNED_IDENTITY='true'
```

For asymmetric verification, use either a PEM public key:

```powershell
$env:PSON_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Or a JWKS source:

```powershell
$env:PSON_JWKS_JSON='{"keys":[...]}'
```

Or:

```powershell
$env:PSON_JWKS_PATH='C:\path\to\jwks.json'
```

Or fetch from a remote JWKS endpoint:

```powershell
$env:PSON_JWKS_URL='https://auth.example.com/.well-known/jwks.json'
```

Optional JWKS cache controls:

```powershell
$env:PSON_JWKS_CACHE_TTL_MS='300000'
$env:PSON_JWKS_TIMEOUT_MS='5000'
```

Optional JWT validation settings:

```powershell
$env:PSON_JWT_ISSUER='https://auth.example.com'
$env:PSON_JWT_AUDIENCE='pson5-api'
```

Default claim mapping:

- caller id: `sub`
- tenant id: `tenant_id`
- subject user: `user_id`
- role: `role`
- scopes: `scopes`

You can override the claim names with:

- `PSON_JWT_CALLER_ID_CLAIM`
- `PSON_JWT_TENANT_CLAIM`
- `PSON_JWT_USER_ID_CLAIM`
- `PSON_JWT_ROLE_CLAIM`
- `PSON_JWT_SCOPES_CLAIM`

Current implementation note:

- this runtime supports HS256 and RS256 JWT verification
- RS256 can use a PEM public key, a local JWKS document, or a remote JWKS URL
- remote JWKS responses are cached in-process and refreshed on key miss
- signed claims override the equivalent identity headers
- mismatches between signed claims and headers are rejected

### Tenant Enforcement

If `PSON_ENFORCE_TENANT='true'`, profile access requires a tenant header. By default the API reads:

- `x-pson-tenant-id`

You can override that with `PSON_TENANT_HEADER`.

```powershell
$env:PSON_ENFORCE_TENANT='true'
$env:PSON_TENANT_HEADER='x-pson-tenant-id'
```

When tenant enforcement is enabled:

- `POST /v1/pson/init` will bind the profile to the request tenant
- profile reads and writes are rejected if the profile tenant does not match the request tenant
- imported profile documents must also carry a matching `tenant_id`

### Caller Identity And Route Authorization

The API now also supports caller identity and subject-user binding.

Optional env flags:

```powershell
$env:PSON_REQUIRE_CALLER_ID='true'
$env:PSON_ENFORCE_SUBJECT_USER='true'
```

Default headers:

- `x-pson-caller-id`: identifies the app, agent, or service making the request
- `x-pson-user-id`: identifies the subject user whose profile is being accessed
- `x-pson-role`: one of `viewer`, `editor`, `admin`
- `x-pson-scopes`: comma-separated scope overrides such as `profiles:read,profiles:write`

Header names can be overridden with:

- `PSON_CALLER_ID_HEADER`
- `PSON_SUBJECT_USER_HEADER`
- `PSON_ROLE_HEADER`
- `PSON_SCOPE_HEADER`

Behavior:

- `viewer` can read profile data and agent context
- `editor` can create profiles, ask next questions, learn, simulate, and import
- `admin` can perform all operations, including full export
- `export?redaction_level=full` requires `admin` or scope `export:full`
- when subject-user enforcement is enabled, the caller can only access profiles for the same `x-pson-user-id` unless it is `admin` or has scope `profiles:cross-user`

### API Access Audit Log

API access decisions are now appended to:

- `.pson5-store/audit/api-access.jsonl`

You can disable that with:

```powershell
$env:PSON_ACCESS_AUDIT_ENABLED='false'
```

Or rename the file with:

```powershell
$env:PSON_ACCESS_AUDIT_FILENAME='api-access.jsonl'
```

Each entry records the request method, route, operation, caller identity, subject user, tenant, role, scopes, decision, status code, and the target profile or user when available.

## Current Routes

- `GET /health`
- `GET /v1/pson/provider/status`
- `POST /v1/pson/init`
- `POST /v1/pson/question/next`
- `POST /v1/pson/learn`
- `POST /v1/pson/simulate`
- `POST /v1/pson/agent-context`
- `GET /v1/pson/profile-by-user?user_id=...`
- `GET /v1/pson/profile/{id}`
- `GET /v1/pson/graph/{id}`
- `GET /v1/pson/state/{id}`
- `GET /v1/pson/explain?profile_id=...&prediction=...`
- `GET /v1/pson/export?profile_id=...`
- `POST /v1/pson/import`
- `POST /v1/pson/validate`

## Minimal Lifecycle

### 1. Initialize

```json
POST /v1/pson/init
{
  "user_id": "user_123",
  "tenant_id": "tenant_acme",
  "domains": ["core", "education"],
  "depth": "deep"
}
```

### 2. Ask Next Question

```json
POST /v1/pson/question/next
{
  "profile_id": "pson_123",
  "limit": 1
}
```

### 3. Learn

```json
POST /v1/pson/learn
{
  "profile_id": "pson_123",
  "session_id": "learn_456",
  "answers": [
    {
      "question_id": "edu_study_start_pattern",
      "value": "last_minute"
    }
  ]
}
```

### 4. Simulate

```json
POST /v1/pson/simulate
{
  "profile_id": "pson_123",
  "context": {
    "task": "study for exam",
    "deadline_days": 2,
    "difficulty": "high"
  },
  "domains": ["education"],
  "options": {
    "include_reasoning": true,
    "include_evidence": true,
    "explanation_level": "detailed"
  }
}
```

### 5. Inspect Graph Support

```text
GET /v1/pson/explain?profile_id=pson_123&prediction=delayed_start
```

### 6. Export A Safe Profile

```text
GET /v1/pson/export?profile_id=pson_123&redaction_level=safe
```

### 7. Get Agent Context

```json
POST /v1/pson/agent-context
{
  "profile_id": "pson_123",
  "intent": "help the user study for an exam",
  "domains": ["core", "education"],
  "max_items": 4,
  "include_predictions": true,
  "min_confidence": 0.6,
  "task_context": {
    "task": "study for exam",
    "deadline_days": 2
  }
}
```

### 8. Resolve A Profile By App User Id

```text
GET /v1/pson/profile-by-user?user_id=app_user_42
```

## What The API Is Today

The current API is a local-service interface over the file-backed engine. It is appropriate for:

- local development
- internal prototypes
- agent experimentation
- provider-backed hybrid simulation experiments
- early cloud integration behind API key, signed identity, tenant isolation, and basic route authorization

For profile-specific provider policy inspection:

- `GET /v1/pson/provider/status?profile_id={id}&operation=modeling|simulation`

It is not yet appropriate for:

- regulated data environments
- large-scale concurrent workloads

## Current Missing Production Pieces

- rate limits
- richer role and policy modeling beyond the current JWT/header authorization layer
- production-grade remote JWKS rotation strategy and stronger trust-provider integration
- operational metrics
- policy enforcement depth
