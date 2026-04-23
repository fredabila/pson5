# Agent Auth And Transport Guidance

## Purpose

This document explains how agents should authenticate to PSON5 and which transport to use in each deployment shape.

## The Four Runtime Modes

### 1. Direct SDK

Use this when the agent runs inside the same trusted backend or worker process as your application.

Auth model:

- no PSON API auth layer
- your application is responsible for authenticating the end user
- your application passes the correct `user_id` or `profile_id` into the SDK

Best for:

- backend agents
- job workers
- private internal services

### 2. Remote HTTP Tools

Use this when the agent runs in another runtime and needs to call a hosted PSON API.

Auth model:

- optional API key
- optional signed bearer JWT
- optional tenant enforcement
- optional subject-user enforcement
- route-level role and scope checks

Endpoints:

- `GET /v1/pson/tools/definitions`
- `GET /v1/pson/tools/openai`
- `POST /v1/pson/tools/execute`

Best for:

- hosted agent services
- external model routers
- browser-safe backends that proxy tool calls

### 3. MCP Over HTTP

Use this when the agent framework expects MCP-style JSON-RPC over an HTTP endpoint.

Auth model:

- same as the normal API
- same headers
- same JWT handling
- same tenant and subject-user rules

Endpoint:

- `POST /v1/mcp`

Best for:

- remote MCP-capable agents
- framework connectors that already speak MCP over HTTP

### 4. Local stdio MCP

Use this when the agent runs locally on the same machine and wants stdio instead of HTTP.

Auth model:

- no API auth boundary
- local process trust boundary only
- storage access is controlled by the local store path and process permissions

Command:

- `pson mcp-stdio --store <dir>`

Best for:

- desktop agents
- local copilots
- development and testing

## Recommended Choice

- If the agent is in your backend: use the SDK.
- If the agent is remote: use HTTP tools or MCP over HTTP.
- If the agent is local and framework-driven: use stdio MCP.
- Do not use the browser as the main PSON runtime.

## Header And Token Model

When calling the API remotely, the common headers are:

- `x-api-key`
- `authorization: Bearer <jwt>`
- `x-pson-tenant-id`
- `x-pson-caller-id`
- `x-pson-user-id`
- `x-pson-role`
- `x-pson-scopes`

If signed identity is enabled:

- the bearer JWT becomes the source of truth for caller identity
- signed claims override matching identity headers
- header and JWT mismatches are rejected

## Default JWT Claim Mapping

- caller id: `sub`
- tenant id: `tenant_id`
- subject user id: `user_id`
- role: `role`
- scopes: `scopes`

These can be remapped through API environment variables.

## What Agents Should Actually Send

### API Key Only

Use when the API only requires a shared secret:

```http
x-api-key: your-secret
```

### Signed JWT

Use when the API enforces signed identity:

```http
authorization: Bearer <signed-jwt>
```

### Signed JWT With Explicit Tenant

Only include tenant headers if they match the signed token claims or if the deployment expects a separate tenant header:

```http
authorization: Bearer <signed-jwt>
x-pson-tenant-id: tenant_acme
```

## Role And Scope Expectations

Typical role behavior:

- `viewer`: read profile data, state, graph, agent context, provider status
- `editor`: create profiles, ask questions, learn, simulate
- `admin`: full export and cross-user operations

Typical scope examples:

- `profiles:read`
- `profiles:write`
- `simulation:run`
- `profiles:cross-user`
- `export:full`

## Recommended Agent Tool Rule

The agent should operate on behalf of a specific subject user and should not call PSON without a resolved user identity.

Recommended loop:

1. Resolve the subject user from your app session.
2. Load or create the profile for that `user_id`.
3. Call `pson_get_agent_context`.
4. If uncertainty matters, call `pson_get_next_questions`.
5. Ask the user naturally.
6. Call `pson_learn`.
7. Optionally call `pson_simulate`.

## Examples In This Repo

- [sdk-agent-loop.ts](/C:/Users/user/pson5/examples/agent-tools/sdk-agent-loop.ts)
- [http-tool-client.ts](/C:/Users/user/pson5/examples/agent-tools/http-tool-client.ts)
- [mcp-http-client.ts](/C:/Users/user/pson5/examples/agent-tools/mcp-http-client.ts)
- [SKILL.md](/C:/Users/user/pson5/skills/pson-agent/SKILL.md)

## Important Clarification

The transport layer does not make PSON the model itself.

Current split remains:

- the agent framework decides when to call a tool
- PSON executes profile, learning, simulation, and projection logic
- the provider layer performs optional model-backed reasoning when configured
