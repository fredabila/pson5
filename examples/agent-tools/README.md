# Agent Tool Examples

These examples show how to connect an agent to PSON5 through different runtime boundaries.

## Files

- `pson-sdk-tools.ts`
  - framework-neutral SDK tool definitions and executor usage
- `sdk-agent-loop.ts`
  - server-side agent flow with direct SDK access
- `openai-function-tools.ts`
  - maps PSON tool definitions into OpenAI-style function tools
- `http-tool-client.ts`
  - remote API tool client with API key, bearer JWT, tenant, caller, and subject-user headers
- `mcp-http-client.ts`
  - minimal MCP-style JSON-RPC over HTTP client

## Which Example To Start With

- If your agent runs in your backend: start with `sdk-agent-loop.ts`
- If your agent runs remotely: start with `http-tool-client.ts`
- If your framework expects MCP over HTTP: start with `mcp-http-client.ts`
- If you need framework tool definitions: start with `pson-sdk-tools.ts`

## Important Rule

These examples show how to access PSON operations. They do not make the SDK the language model itself.

The model runtime stays in your agent framework or under the optional provider engine.
