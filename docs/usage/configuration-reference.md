# PSON5 Configuration Reference

This page collects the runtime knobs used by the API, SDK, provider engine, storage layer, and MCP transport.

## API Runtime

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | API bind host. Refuses unauthenticated non-loopback binds unless explicitly allowed. |
| `PORT` | `3000` | API port. |
| `PSON_ALLOW_UNAUTHED_BIND` | `false` | Allows unauthenticated non-loopback bind for deliberate tests. |
| `PSON_MAX_REQUEST_BYTES` | `1048576` | Request body cap, min 1KB, max 50MB. |

## Store

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_STORE_BACKEND` | `file` | `file`, `memory`, or `postgres`. |
| `PSON_STORE_DIR` | `.pson5-store` resolved path | Filesystem store root. |
| `DATABASE_URL` | none | Postgres connection string fallback. |
| `PSON_PG_CONNECTION_STRING` | none | Postgres connection string. |
| `PSON_PG_SCHEMA` | `public` | Postgres schema. |
| `PSON_PG_APPLY_SCHEMA` | `false` | Apply schema SQL on startup. |

## API Key Auth

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_API_KEY` | none | Shared secret accepted as `x-api-key` or bearer token when JWT secret is not configured. |
| `PSON_DEFAULT_API_KEY_ROLE` | `editor` | Role assigned to API-key callers if no role header is present. |

## JWT/JWKS Auth

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_REQUIRE_SIGNED_IDENTITY` | `false` | Require bearer JWT when JWT verification is configured. |
| `PSON_JWT_SECRET` | none | HS256 secret. |
| `PSON_JWT_PUBLIC_KEY` | none | RS256 public key PEM. |
| `PSON_JWKS_JSON` | none | Inline JWKS JSON. |
| `PSON_JWKS_PATH` | none | Path to JWKS JSON file. |
| `PSON_JWKS_URL` | none | Remote JWKS URL. |
| `PSON_JWKS_CACHE_TTL_MS` | `300000` | Remote JWKS cache TTL. |
| `PSON_JWKS_TIMEOUT_MS` | `5000` | Remote JWKS fetch timeout. |
| `PSON_JWT_ISSUER` | none | Optional issuer check. |
| `PSON_JWT_AUDIENCE` | none | Optional audience check. |
| `PSON_JWT_CALLER_ID_CLAIM` | `sub` | Claim used as caller id. |
| `PSON_JWT_TENANT_CLAIM` | `tenant_id` | Claim used as tenant id. |
| `PSON_JWT_USER_ID_CLAIM` | `user_id` | Claim used as subject user id. |
| `PSON_JWT_ROLE_CLAIM` | `role` | Claim used as caller role. |
| `PSON_JWT_SCOPES_CLAIM` | `scopes` | Claim used as scopes array/string. |

## Tenant, Caller, Subject, Role, Scopes

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_ENFORCE_TENANT` | `false` | Require tenant binding and tenant match. |
| `PSON_TENANT_HEADER` | `x-pson-tenant-id` | Header used for tenant id. |
| `PSON_REQUIRE_CALLER_ID` | `false` | Require caller id. |
| `PSON_CALLER_ID_HEADER` | `x-pson-caller-id` | Header used for caller id. |
| `PSON_ENFORCE_SUBJECT_USER` | `false` | Require subject-user binding on user-data operations. |
| `PSON_SUBJECT_USER_HEADER` | `x-pson-user-id` | Header used for subject user id. |
| `PSON_ROLE_HEADER` | `x-pson-role` | Header used for caller role. |
| `PSON_SCOPE_HEADER` | `x-pson-scopes` | Comma-separated scopes header. |

Roles:

- `anonymous`
- `viewer`
- `editor`
- `admin`

## MCP

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_DEFAULT_MCP_SUBJECT_ROLE` | `editor` | Role assigned to subject-bound MCP callers that otherwise arrive as anonymous. |
| `PSON_MCP_ALLOW_ARGUMENT_SUBJECT_FALLBACK` | `true` | Allows `arguments.user_id` as a fallback subject for user-bound MCP tools. |
| `PSON_MCP_SUBJECT_FALLBACK` | `session_hash` | Fallback user id mode: `session_hash`, `bearer_hash`, or `disabled`. |
| `PSON_OPENAI_APPS_CHALLENGE_TOKEN` | none | Token served from `/.well-known/openai-apps-challenge`. |

Subject resolution order for MCP:

1. JWT/header subject.
2. `_meta["openai/subject"]`.
3. `_meta.openai.subject`.
4. `arguments.user_id` for user-bound profile tools when enabled.
5. `profile_id` lookup for profile-bound tools.
6. Bearer/API-key hash.
7. MCP session hash.

## Audit

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_ACCESS_AUDIT_ENABLED` | `true` | Write API access audit. |
| `PSON_ACCESS_AUDIT_FILENAME` | `api-access.jsonl` | Access audit file under `<store>/audit`. |

## Neo4j

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_NEO4J_URI` | none | Neo4j connection URI. |
| `PSON_NEO4J_USERNAME` | none | Neo4j username. |
| `PSON_NEO4J_PASSWORD` | none | Neo4j password. |
| `PSON_NEO4J_DATABASE` | none | Optional database name. |
| `PSON_NEO4J_ENABLED` | `true` when config exists | Disable Neo4j integration without removing credentials. |

## Provider Engine

| Variable | Default | Meaning |
| --- | --- | --- |
| `PSON_AI_PROVIDER` | none | `openai`, `anthropic`, or `openai-compatible`. |
| `PSON_AI_API_KEY` | none | Generic provider API key. |
| `OPENAI_API_KEY` | none | OpenAI-specific API key. |
| `ANTHROPIC_API_KEY` | none | Anthropic-specific API key. |
| `PSON_AI_MODEL` | provider default | Model override. |
| `PSON_AI_BASE_URL` | provider default | Base URL override. |
| `PSON_AI_TIMEOUT_MS` | `20000` | Provider request timeout. |
| `PSON_AI_MAX_RETRIES` | `3` | Provider retry attempts. |
| `PSON_AI_ENABLED` | `true` | Disable provider integration without removing config. |

Provider config can also be stored at:

```text
<store>/config/provider.json
```

Environment variables take precedence over stored config.
