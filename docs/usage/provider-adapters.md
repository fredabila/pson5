# Provider Adapters

> One interface, any model. The PSON5 provider layer is pluggable via a tiny registry. Anything that can produce structured JSON from a prompt can be a provider.

## Why adapters

PSON5 never required a specific model. Three built-in adapters ship with the provider engine:

| Adapter | Transport | Notes |
| --- | --- | --- |
| `openai` | OpenAI responses API (`/responses`) | Structured outputs via `json_schema`. |
| `anthropic` | Anthropic messages API (`/messages`) | Schema is embedded in the user message. |
| `openai-compatible` | OpenAI chat completions (`/chat/completions`) with `response_format: { type: "json_object" }` | Works against Ollama, vLLM, LiteLLM, OpenRouter, Groq, Together, Fireworks, Azure OpenAI, and anything else that speaks the OpenAI shape. |

The `openai-compatible` adapter already covers the vast majority of third-party models by base-URL alone. When you need something more specific — a custom transport, a provider with its own schema hints, a local inference server with bespoke auth — you can register your own adapter in a few lines.

## Contract

```ts
import type { ProviderAdapter, ProviderAdapterCallArgs, ProviderAdapterCallResult } from "@pson5/provider-engine";

interface ProviderAdapter {
  readonly name: string;               // registry key, lowercase
  readonly default_base_url: string;
  readonly default_model: string;
  readonly display_name?: string;      // for UIs and audits
  callJson(args: ProviderAdapterCallArgs): Promise<ProviderAdapterCallResult>;
}

interface ProviderAdapterCallArgs {
  config: StoredAiProviderConfig;      // name, model, base_url, timeout_ms, api_key
  format: { name: string; schema: Record<string, unknown> }; // JSON schema hint
  instructions: string;                // developer-level steering
  payload: Record<string, unknown>;    // the actual "user" content
  signal: AbortSignal;                 // bound to the PSON5 timeout
}

interface ProviderAdapterCallResult {
  parsed: Record<string, unknown> | null;
  attempt: FetchWithRetryResult;  // attempts, status, duration, body_text
  endpoint: string;
}
```

`callJson` is responsible for exactly two things:
1. **Build the request.** Translate `instructions + payload + format` into whatever shape the model expects.
2. **Parse the response.** Extract the JSON object the model produced; return `null` if it's unparseable.

Everything else — retry on 429/5xx, exponential backoff, `Retry-After` honouring, token estimation, per-call audit to `<store>/audit/provider-call.jsonl` — is shared and runs around your adapter.

## Register an adapter

```ts
import { registerProviderAdapter } from "@pson5/provider-engine";

registerProviderAdapter({
  name: "my-provider",
  display_name: "My Provider",
  default_base_url: "https://api.my-provider.com/v1",
  default_model: "my-model-v1",
  async callJson({ config, format, instructions, payload, signal }) {
    const endpoint = `${config.base_url ?? this.default_base_url}/generate`;
    const body = JSON.stringify({
      model: config.model ?? this.default_model,
      prompt: `${instructions}\nReply with JSON matching: ${JSON.stringify(format.schema)}\n${JSON.stringify(payload)}`,
      json_mode: true
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.api_key ?? ""}`
      },
      body,
      signal
    });

    const bodyText = await response.text();
    const duration_ms = 0; // your helper, or use the shared fetchWithRetry exported by the package

    let parsed: Record<string, unknown> | null = null;
    try {
      const full = JSON.parse(bodyText) as { output?: string };
      parsed = full.output ? (JSON.parse(full.output) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    return {
      parsed,
      endpoint,
      attempt: {
        response,
        body_text: bodyText,
        attempts: 1,
        final_status_code: response.status,
        final_error: response.ok ? null : `HTTP ${response.status}`,
        duration_ms
      }
    };
  }
});
```

Once registered, the adapter is selectable by its name:

```bash
export PSON_AI_PROVIDER=my-provider
export PSON_AI_API_KEY=...
export PSON_AI_MODEL=my-model-v1
```

Or via the CLI:

```bash
pson provider-set my-provider --api-key ... --model my-model-v1 --store .pson5-store
```

## Use shared fetch + retry

The package exports the same retry primitives PSON5 uses internally, so you get identical behaviour for free:

```ts
import {
  registerProviderAdapter,
  estimateTokens
} from "@pson5/provider-engine";

// fetchWithRetry is currently internal. If you want the same semantics,
// wrap your HTTP call in your own retry helper and pass its result through
// `attempt`. PSON5's shared audit layer reads `attempts`, `duration_ms`,
// `final_status_code`, and `final_error` from whatever you return.
```

The adapter's `attempt` field **drives** the audit record, so set:
- `attempts` — how many HTTP calls you made
- `final_status_code` — last HTTP status you saw
- `final_error` — `null` on success, a short message on failure
- `duration_ms` — total wall-clock time, first request to final resolution
- `body_text` — raw response body (used for response-token estimation)

## Built-in adapters: quick reference

### `openai`

```bash
export PSON_AI_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export PSON_AI_MODEL=gpt-4.1-mini             # optional
export PSON_AI_BASE_URL=https://api.openai.com/v1  # optional
```

### `anthropic`

```bash
export PSON_AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export PSON_AI_MODEL=claude-haiku-4-5-20251001  # optional
```

### `openai-compatible`

```bash
# Ollama local
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:11434/v1
export PSON_AI_MODEL=llama3.1

# Groq
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=https://api.groq.com/openai/v1
export PSON_AI_API_KEY=gsk_...
export PSON_AI_MODEL=llama-3.1-70b-versatile

# LiteLLM proxy
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:4000
export PSON_AI_API_KEY=...
export PSON_AI_MODEL=claude-sonnet-4-6
```

## Policy rules stay the same

Whatever adapter you register, `@pson5/privacy.getProviderPolicyDecision(profile, operation)` still runs *before* any adapter call. If consent is denied, the profile is marked `local_only`, or required scopes are missing, the adapter is never invoked and PSON5 falls back to rules with a stable reason code.

## Related docs

- [Provider engine](./provider-engine.md) — configuration, retry, audit, token estimation.
- [Privacy model](../privacy/privacy-model.md) — scopes, consent, policy gates.
- [Quickstart](./quickstart.md) — getting everything wired up end-to-end.
