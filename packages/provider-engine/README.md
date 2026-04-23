# `@pson5/provider-engine`

Model-agnostic provider integration for PSON5. Ships first-class adapters for **OpenAI**, **Anthropic**, and any **OpenAI-compatible** endpoint (Ollama, vLLM, Groq, Together, OpenRouter, LiteLLM, Azure OpenAI). Custom providers implement the `ProviderAdapter` interface and register through the registry.

## Install

```bash
npm install @pson5/provider-engine
```

## Configuration

Credentials and defaults resolve from the environment first, then from `<store>/config/provider.json` (written with `0600` permissions):

```bash
# Claude
export ANTHROPIC_API_KEY=sk-ant-...
export PSON_AI_PROVIDER=anthropic
export PSON_AI_MODEL=claude-haiku-4-5-20251001

# OpenAI
export OPENAI_API_KEY=sk-...
export PSON_AI_PROVIDER=openai
export PSON_AI_MODEL=gpt-4.1-mini

# OpenAI-compatible (Ollama, vLLM, etc.)
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:11434/v1
export PSON_AI_MODEL=llama3.1
# export PSON_AI_API_KEY=...     # only if the endpoint requires it
```

## Usage

### Check provider status

```ts
import { getProviderStatusFromEnv } from "@pson5/provider-engine";

const status = getProviderStatusFromEnv();
// {
//   configured: true,
//   provider: "anthropic",
//   model: "claude-haiku-4-5-20251001",
//   source: "env",
//   has_api_key: true
// }
```

### Evaluate provider policy against a profile

Provider policies encode what a profile allows the model to *see* (e.g., respect `privacy.local_only`, exclude restricted fields). Before sending anything upstream, consult the policy:

```ts
import { getProviderPolicyStatus, sanitizeProfileForProvider } from "@pson5/provider-engine";

const policy = getProviderPolicyStatus(profile, "simulation");
if (!policy.allowed) {
  throw new Error(`Provider use blocked: ${policy.reason}`);
}

const redacted = sanitizeProfileForProvider(profile, { operation: "simulation" });
// redacted is safe to hand to the model; restricted fields are null-ed out
// and redaction_notes is populated for audit.
```

### Register a custom provider

```ts
import { registerProvider, type ProviderAdapter } from "@pson5/provider-engine";

const myAdapter: ProviderAdapter = {
  name: "my-provider",
  async complete(prompt, options) { /* … */ },
  async extractTraits(conversation, domain) { /* … */ },
  async proposeQuestions(profile, brief) { /* … */ }
};

registerProvider(myAdapter);

// Now set PSON_AI_PROVIDER=my-provider and the SDK + CLI route through your adapter.
```

### Persist credentials to the store

```ts
import { saveProviderConfig } from "@pson5/provider-engine";

await saveProviderConfig(
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    api_key: process.env.ANTHROPIC_API_KEY!,
    enabled: true,
    base_url: null,
    timeout_ms: 20000
  },
  { rootDir: ".pson5-store" }
);
// Writes <store>/config/provider.json with mode 0600.
```

For a dev-friendly prompt-driven flow, the CLI ships `pson provider-wizard` which runs a Clack wizard on top of these helpers.

## Retries, timeouts, and backoff

All adapter calls go through a shared retry helper with exponential backoff and jitter. Defaults: 3 retries, 20s timeout, backoff cap of 8s. Override via:

```bash
export PSON_AI_TIMEOUT_MS=60000
export PSON_AI_MAX_RETRIES=5
```

The provider-retry helper is tested independently — see `tests/integration/provider-retry.mjs`.

## What this package does **not** do

- Does not implement rate-limiting or quota management. Providers usually enforce this themselves; layer your own limiter on top if you have multi-tenant needs.
- Does not ship with an HTTP transport of its own — it uses `fetch`. Swap in a custom `fetch` via the options bag if you need a proxy, retry policy, or logging layer.
- Does not store long-lived tokens. Every call constructs a fresh request; rotate credentials out-of-band.

## Related

- [`@pson5/privacy`](https://www.npmjs.com/package/@pson5/privacy) — consent + redaction helpers consumed by `sanitizeProfileForProvider`.
- [`@pson5/modeling-engine`](https://www.npmjs.com/package/@pson5/modeling-engine) — uses `extractTraits` to AI-augment modeling.
- [`@pson5/acquisition-engine`](https://www.npmjs.com/package/@pson5/acquisition-engine) — uses `proposeQuestions` for the zero-registry generative flow.

## License

MIT
