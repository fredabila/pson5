# Providers — selection, env vars, custom adapters

PSON5 is model-agnostic. Three built-in adapters ship with the engine; `registerProviderAdapter(...)` lets you plug anything else in.

## Built-in adapters

| Adapter | Transport | Works with |
| --- | --- | --- |
| `openai` | OpenAI Responses API (`/responses`) | GPT-4.1, GPT-4o, any OpenAI-hosted model |
| `anthropic` | Anthropic Messages API (`/messages`) | Claude Sonnet / Haiku / Opus |
| `openai-compatible` | OpenAI chat completions (`/chat/completions`) with JSON mode | Ollama, vLLM, LiteLLM, OpenRouter, Groq, Together, Fireworks, Azure OpenAI, anything that speaks the OpenAI shape |

## Env vars (winning over stored config)

| Variable | Default | Notes |
| --- | --- | --- |
| `PSON_AI_PROVIDER` | `openai` when only `OPENAI_API_KEY` is set; `anthropic` when only `ANTHROPIC_API_KEY` | Explicit wins |
| `PSON_AI_API_KEY` | — | Generic fallback used when the adapter-specific key isn't set |
| `OPENAI_API_KEY` | — | OpenAI-specific |
| `ANTHROPIC_API_KEY` | — | Anthropic-specific |
| `PSON_AI_MODEL` | adapter default | e.g. `claude-haiku-4-5-20251001`, `gpt-4.1-mini`, `llama3.1` |
| `PSON_AI_BASE_URL` | adapter default | Override for openai-compatible endpoints |
| `PSON_AI_TIMEOUT_MS` | `20000` | Raise to 60000 for modeling-heavy flows on Haiku |
| `PSON_AI_ENABLED` | `true` | Force-disable without removing config |

## Examples

### OpenAI
```bash
export PSON_AI_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export PSON_AI_MODEL=gpt-4.1-mini
```

### Claude
```bash
export PSON_AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export PSON_AI_MODEL=claude-haiku-4-5-20251001   # fast + cheap
# or
export PSON_AI_MODEL=claude-sonnet-4-6            # balanced
```

### Ollama (local, no key)
```bash
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:11434/v1
export PSON_AI_MODEL=llama3.1
```

### Groq
```bash
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=https://api.groq.com/openai/v1
export PSON_AI_API_KEY=gsk_...
export PSON_AI_MODEL=llama-3.1-70b-versatile
```

### LiteLLM proxy
```bash
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:4000
export PSON_AI_API_KEY=...
export PSON_AI_MODEL=claude-sonnet-4-6
```

## Persist config (survives shell restarts)

```bash
pson provider-set anthropic --api-key sk-ant-... --model claude-haiku-4-5-20251001 \
  --store .pson5-store
# or interactively:
pson provider-wizard --store .pson5-store
```

The wizard writes `<store>/config/provider.json`. Env vars always override the file.

## Check status before relying on a provider

```ts
const policy = await client.getProviderPolicy(profileId, "simulation", storeOptions);
if (!policy.allowed) {
  // Fall back to rules. Stable reason codes:
  //   "User consent is not granted."
  //   "Profile is marked local_only, so remote AI providers are disabled."
  //   "Required AI consent scopes are missing."
  //   "Provider is not configured."
  //   "Provider integration is disabled."
  //   "Provider adapter '<name>' is not registered."
}
```

## Register a custom adapter

20 lines and you can plug in any model. The adapter interface:

```ts
interface ProviderAdapter {
  readonly name: string;
  readonly default_base_url: string;
  readonly default_model: string;
  readonly display_name?: string;
  callJson(args: ProviderAdapterCallArgs): Promise<ProviderAdapterCallResult>;
}
```

Example:

```ts
import { registerProviderAdapter } from "@pson5/provider-engine";

registerProviderAdapter({
  name: "my-custom-model",
  display_name: "Our In-House Model",
  default_base_url: "https://api.ourmodel.internal/v1",
  default_model: "v2-prod",
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
    let parsed = null;
    try {
      const full = JSON.parse(bodyText);
      parsed = typeof full.output === "string" ? JSON.parse(full.output) : full.output;
    } catch {}
    return {
      parsed,
      endpoint,
      attempt: {
        response,
        body_text: bodyText,
        attempts: 1,
        final_status_code: response.status,
        final_error: response.ok ? null : `HTTP ${response.status}`,
        duration_ms: 0
      }
    };
  }
});
```

After registration, select it:

```bash
export PSON_AI_PROVIDER=my-custom-model
export PSON_AI_API_KEY=...
export PSON_AI_MODEL=v2-prod
```

All retry, audit, and timeout behavior is shared — your adapter only owns request construction and response parsing.

Canonical source: [packages/provider-engine/src/index.ts](https://github.com/fredabila/pson5/blob/main/packages/provider-engine/src/index.ts).
Full guide: [docs/usage/provider-adapters.md](https://github.com/fredabila/pson5/blob/main/docs/usage/provider-adapters.md).

## Per-call audit

Every provider call (successful or failed) writes to `<store>/audit/provider-call.jsonl`:

```jsonc
{
  "timestamp": "2026-04-23T08:00:00.000Z",
  "provider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "base_url": "https://api.anthropic.com/v1",
  "endpoint": "https://api.anthropic.com/v1/messages",
  "schema_name": "pson_modeling_insight",
  "attempts": 1,
  "final_status_code": 200,
  "final_error": null,
  "estimated_prompt_tokens": 1234,
  "estimated_response_tokens": 567,
  "duration_ms": 8912,
  "success": true
}
```

Use this for cost attribution, latency SLOs, retry-storm detection, and provider comparison.

## Troubleshooting

**`"Provider adapter '<name>' is not registered."`**  
`PSON_AI_PROVIDER` is set to a name that isn't in the registry. Either use one of the built-in names (`openai`, `anthropic`, `openai-compatible`) or register the adapter before your first tool call.

**Modeling calls timing out on Haiku**  
Modeling responses can run 2k+ tokens of caveats. Raise `PSON_AI_TIMEOUT_MS` to 60000.

**"Response parse failure" when using openai-compatible**  
Not every OpenAI-compatible server implements strict JSON mode. If responses come back as prose, try a more capable model (`llama-3.1-70b-versatile` on Groq works well) or fall back to explicit schema-in-prompt.
