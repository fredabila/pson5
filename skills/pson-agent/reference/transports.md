# Transports — SDK · API · CLI · MCP

One executor, four front doors. Pick whichever matches your runtime.

| Transport | Best for | How to call | Auth boundary |
| --- | --- | --- | --- |
| **SDK** | Agent runs in your backend (Node) | `import { PsonClient } from "@pson5/sdk"` | your app handles it |
| **HTTP API** | Remote agent, different runtime | `POST /v1/pson/tools/execute` | API key and/or JWT |
| **MCP over HTTP** | Agent framework expects JSON-RPC | `POST /v1/mcp` | same as API |
| **stdio MCP** | Local desktop / dev agent | `pson mcp-stdio --store …` | local process trust only |

## 1. SDK

Canonical source: [packages/sdk/src/index.ts](https://github.com/fredabila/pson5/blob/main/packages/sdk/src/index.ts).

```ts
import { PsonClient, createPsonAgentToolExecutor } from "@pson5/sdk";

const client = new PsonClient();
const executor = createPsonAgentToolExecutor(client, { rootDir: ".pson5-store" });

const context = await executor.execute({
  name: "pson_get_agent_context",
  arguments: { profile_id: "pson_123", intent: "tutoring" }
});
```

Or call the SDK methods directly — `client.loadProfileByUserId(...)`, `client.getNextQuestions(...)`, `client.learn(...)`, `client.simulate(...)`, `client.getAgentContext(...)`.

**Use when:** same-process agent, no serialization overhead, you want the typed return values.

## 2. HTTP API

Canonical source: [apps/api/src/server.ts](https://github.com/fredabila/pson5/blob/main/apps/api/src/server.ts) · [docs/api/api-contract.md](https://github.com/fredabila/pson5/blob/main/docs/api/api-contract.md).

```http
POST /v1/pson/tools/execute HTTP/1.1
content-type: application/json
x-api-key: <secret>
authorization: Bearer <jwt>
x-pson-tenant-id: tenant_acme
x-pson-caller-id: agent_tutor_service
x-pson-user-id: user_123

{
  "name": "pson_get_agent_context",
  "arguments": { "profile_id": "pson_123", "intent": "tutoring" }
}
```

Every response carries `x-pson-request-id: req_<uuid>` for correlation. Per-tool role/scope policy is enforced server-side — see [tools.md](tools.md).

Auth stack (any combination):

- `PSON_API_KEY` → required `x-api-key` header
- `PSON_JWT_SECRET` / `PSON_JWT_PUBLIC_KEY` / `PSON_JWKS_*` → required `Bearer` token
- Fallback identity headers (`x-pson-tenant-id`, `x-pson-caller-id`, `x-pson-user-id`, `x-pson-role`, `x-pson-scopes`) behind a trusted proxy

Admin callers can request `?redaction_level=full` on profile reads; non-admin callers always get `safe`-redacted responses.

**Use when:** the agent is remote, or you want a single auth boundary for many agents.

## 3. MCP over HTTP

Standard JSON-RPC 2.0. Same per-tool policy as the REST endpoint above.

```http
POST /v1/mcp HTTP/1.1
content-type: application/json
x-api-key: <secret>

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "pson_get_agent_context",
    "arguments": { "profile_id": "pson_123", "intent": "tutoring" }
  }
}
```

Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`. Returns `{ content: [{ type: "text", text }], structuredContent }`.

**Use when:** your agent framework expects the MCP protocol and is comfortable speaking it over HTTP.

## 4. stdio MCP

```bash
pson mcp-stdio --store .pson5-store
```

Uses `Content-Length`-framed JSON-RPC on stdin/stdout. Same four methods as HTTP MCP. Typically invoked by a local agent framework (Claude Desktop, LM Studio, etc.) as a subprocess.

Configure it in the framework's MCP server list — the exact config format depends on the framework. A typical entry for Claude Desktop, using the published CLI (no local clone required), looks like:

```json
{
  "mcpServers": {
    "pson5": {
      "command": "npx",
      "args": [
        "-y",
        "@pson5/cli",
        "mcp-stdio",
        "--store",
        "/absolute/path/to/.pson5-store"
      ]
    }
  }
}
```

If you've installed the CLI globally, replace `"command": "npx"` and the `-y`/`@pson5/cli` args with `"command": "pson"` and drop the first two array entries. If you've cloned the source and prefer to run from `dist/`, point `command` at `node` and give it the absolute path to `apps/cli/dist/apps/cli/src/index.js`.

**Use when:** the agent is running locally on the same machine as PSON5 and you want process-level trust with no network hops.

## Choosing

```
agent runs in your backend (Node)?         → SDK
agent runs elsewhere, speaks REST?         → HTTP API
agent speaks MCP over the network?         → /v1/mcp
agent is local and speaks MCP over stdio?  → pson mcp-stdio
```

All four execute exactly the same logic — the tool executor lives in the SDK and every other transport just wraps it.
