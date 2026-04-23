# Agent Tool Contracts

## Purpose

This document defines the framework-consumable tool layer for agents that use PSON5.

## What Now Exists

The SDK now exports reusable PSON tool definitions and a matching executor:

- `getPsonAgentToolDefinitions()`
- `createPsonAgentToolExecutor(client, storeOptions)`

The API now also exposes a remote tool server layer:

- `GET /v1/pson/tools/definitions`
- `GET /v1/pson/tools/openai`
- `POST /v1/pson/tools/execute`
- `POST /v1/mcp`

The CLI now also exposes a local stdio MCP transport:

- `pson mcp-stdio --store <dir>`

Implementation:

- [packages/sdk/src/agent-tools.ts](/C:/Users/user/pson5/packages/sdk/src/agent-tools.ts)

## Why This Matters

This removes guesswork from agent integrations.

Instead of inventing ad hoc tool names and payload shapes in every project, agents can use a stable PSON tool contract.

## Included Tool Names

- `pson_load_profile_by_user_id`
- `pson_create_profile`
- `pson_get_agent_context`
- `pson_get_next_questions`
- `pson_learn`
- `pson_simulate`
- `pson_get_provider_policy`

## SDK Usage

```ts
import { PsonClient, createPsonAgentToolExecutor, getPsonAgentToolDefinitions } from "@pson5/sdk";

const client = new PsonClient();
const store = { rootDir: ".pson5-store" };

const definitions = getPsonAgentToolDefinitions();
const executor = createPsonAgentToolExecutor(client, store);

const result = await executor.execute({
  name: "pson_get_next_questions",
  arguments: {
    profile_id: "pson_123",
    limit: 1
  }
});
```

## Transport Matrix

| Mode | Best when | Auth boundary | Recommended runtime |
| --- | --- | --- | --- |
| Direct SDK | agent runs inside your backend | your app handles auth | server / worker |
| HTTP tools | remote agent or external service | API key and/or JWT | hosted API |
| MCP over HTTP | framework expects MCP-style JSON-RPC | same as API | hosted API |
| stdio MCP | local desktop or local dev agent | local process trust only | local machine |

## Which One To Use

- If the agent runs inside your backend, use the SDK.
- If the agent is remote, use the HTTP tools or MCP over HTTP.
- If the agent is local and framework-driven, use `pson mcp-stdio`.
- Do not use the browser as the primary PSON runtime boundary.

## OpenAI-Style Function Tools

The PSON definitions are exported in a framework-neutral shape:

```ts
{
  type: "function",
  name,
  description,
  input_schema
}
```

You can map that to OpenAI-style tool definitions by renaming `input_schema` to `parameters`.

Example:

- [examples/agent-tools/openai-function-tools.ts](/C:/Users/user/pson5/examples/agent-tools/openai-function-tools.ts)

## Remote API Usage

### Get raw PSON tool definitions

```http
GET /v1/pson/tools/definitions
```

### Get OpenAI-style tool definitions

```http
GET /v1/pson/tools/openai
```

### Execute a remote tool call

```http
POST /v1/pson/tools/execute
content-type: application/json

{
  "name": "pson_get_agent_context",
  "arguments": {
    "profile_id": "pson_123",
    "intent": "tutoring",
    "include_predictions": true,
    "max_items": 12
  }
}
```

The execution route still enforces auth, tenancy, subject-user binding, and per-tool authorization.

### Typical remote headers

```http
x-api-key: <secret>
authorization: Bearer <jwt>
x-pson-tenant-id: tenant_acme
x-pson-caller-id: agent_tutor_service
x-pson-user-id: user_123
```

If signed identity is enabled, the JWT becomes the source of truth for caller identity and subject-user binding.

## MCP HTTP Transport

PSON now also exposes a minimal MCP-style JSON-RPC transport over HTTP:

```http
POST /v1/mcp
content-type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "example-client",
      "version": "0.1.0"
    }
  }
}
```

Supported methods:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Example client:

- [examples/agent-tools/mcp-http-client.ts](/C:/Users/user/pson5/examples/agent-tools/mcp-http-client.ts)

## Local stdio MCP

For local desktop agents or tools that want stdio instead of HTTP, start:

```bash
pson mcp-stdio --store .pson5-store
```

This transport uses `Content-Length` framing and supports:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

## Example Files

- [examples/agent-tools/README.md](/C:/Users/user/pson5/examples/agent-tools/README.md)
- [examples/agent-tools/sdk-agent-loop.ts](/C:/Users/user/pson5/examples/agent-tools/sdk-agent-loop.ts)
- [examples/agent-tools/http-tool-client.ts](/C:/Users/user/pson5/examples/agent-tools/http-tool-client.ts)
- [examples/agent-tools/mcp-http-client.ts](/C:/Users/user/pson5/examples/agent-tools/mcp-http-client.ts)

## Execution Rule

The tool executor should live server-side with the SDK and store adapter.

Do not put direct SDK tool execution in the browser as the main runtime boundary.

## LLM Position

These tool contracts make PSON easier for agents to use, but they do not turn the SDK into the model runtime.

Current split remains:

- agent framework decides when to call a tool
- SDK executes the PSON operation
- provider engine performs optional model-backed cognition when configured

## Related Docs

- [sdk-usage.md](/C:/Users/user/pson5/docs/usage/sdk-usage.md)
- [agent-integration.md](/C:/Users/user/pson5/docs/usage/agent-integration.md)
- [pson-agent-skill.md](/C:/Users/user/pson5/docs/usage/pson-agent-skill.md)
- [agent-auth.md](/C:/Users/user/pson5/docs/usage/agent-auth.md)
