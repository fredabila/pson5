# @pson5/provider-engine

> OpenAI + Anthropic integration, with env/file configuration, per-call audit, token estimation, and retry-with-backoff on 429 / 5xx.

## Install

```bash
npm install @pson5/provider-engine
```

## What this package does

The provider engine is the only part of PSON5 that talks to external LLMs. It owns:

- **Configuration** — resolved from env vars first, then from a stored `<store>/config/provider.json`. Env always wins.
- **Policy** — `getProviderPolicyStatus` composes `@pson5/privacy.getProviderPolicyDecision` with the current provider status to give a single "allowed? why not?" answer per profile + operation.
- **Structured call wrappers** — modeling, simulation, answer normalization, adaptive question derivation, console-intent derivation. Each call returns parsed JSON or `null` (fail-open to rules), and writes a per-call audit.
- **Transport** — `fetchWithRetry` handles 429 / 408 / 5xx (except 501) with exponential backoff (500 ms → 8 s cap, max 3 attempts) and honours `Retry-After` (seconds or HTTP-date) up to a 15 s clamp.
- **Observability** — token estimation (chars / 4 heuristic), per-attempt audit to `<store>/audit/provider-call.jsonl`, operation-level audit to `<store>/audit/provider.jsonl`.

## Exports

```ts
import {
  getProviderStatusFromEnv,
  getStoredProviderConfig,
  saveProviderConfig,
  clearStoredProviderConfig,
  getProviderPolicyStatus,
  deriveProviderModelingInsight,
  deriveProviderSimulationInsight,
  deriveAdaptiveQuestion,
  normalizeAnswerWithProvider,
  deriveConsoleIntent,
  estimateTokens,
  shouldRetryStatus,
  parseRetryAfter,
  readProviderCallAuditRecords,
  providerEngineStatus
} from "@pson5/provider-engine";
```

## Configuration

Env vars take precedence over stored config. All are optional.

| Env var | Default |
| --- | --- |
| `PSON_AI_PROVIDER` | — (`openai` or `anthropic`) |
| `PSON_AI_API_KEY` | — |
| `PSON_AI_MODEL` | `gpt-4.1-mini` (openai) / `claude-sonnet-4-20250514` (anthropic) |
| `PSON_AI_BASE_URL` | `https://api.openai.com/v1` / `https://api.anthropic.com/v1` |
| `PSON_AI_TIMEOUT_MS` | `20000` |
| `PSON_AI_ENABLED` | `true` |

Persisted config lives at `<store>/config/provider.json`. The CLI wizard (`pson provider-wizard`) and API route (`POST /v1/pson/provider/config`) write it.

## Usage

### Inspect current config + policy

```ts
import { getProviderStatusFromEnv, getProviderPolicyStatus } from "@pson5/provider-engine";

const status = getProviderStatusFromEnv({ rootDir: ".pson5-store" });
// { configured, provider, model, base_url, timeout_ms, source, enabled, reason? }

const policy = getProviderPolicyStatus(profile, "simulation", { rootDir: ".pson5-store" });
// Adds allowed / reason / required_scopes / missing_scopes / redacted_fields to status.
```

### Save / clear stored config

```ts
import { saveProviderConfig, clearStoredProviderConfig } from "@pson5/provider-engine";

await saveProviderConfig({
  provider: "openai",
  api_key: "sk-...",
  model: "gpt-4.1-mini",
  enabled: true
}, { rootDir: ".pson5-store" });

await clearStoredProviderConfig({ rootDir: ".pson5-store" });
```

### Token estimation + retry helpers

```ts
import {
  estimateTokens,
  shouldRetryStatus,
  parseRetryAfter
} from "@pson5/provider-engine";

estimateTokens("hello world");      // 3 (ceil(11 / 4))
shouldRetryStatus(429);              // true
shouldRetryStatus(501);              // false (not retried — Not Implemented)
parseRetryAfter("5");                // 5000 ms
parseRetryAfter("Mon, 01 Jan 2026 00:00:00 GMT");  // delta in ms, clamped to 15 s
```

### Read the per-call audit

```ts
import { readProviderCallAuditRecords } from "@pson5/provider-engine";

const records = await readProviderCallAuditRecords({ rootDir: ".pson5-store" });
// Every entry:
//   timestamp, provider, model, base_url, endpoint, schema_name,
//   attempts, final_status_code, final_error,
//   estimated_prompt_tokens, estimated_response_tokens,
//   duration_ms, success
```

## Policy denial codes

`getProviderPolicyStatus` returns a stable `reason` phrase when `allowed: false`:

- `"User consent is not granted."`
- `"Profile is marked local_only, so remote AI providers are disabled."`
- `"Required AI consent scopes are missing."`
- `"Provider is not configured."`
- `"Provider integration is disabled."`

Callers should treat any denial as "fall back to rules". The rule-based engines always run first anyway.

## Retry semantics

The wrapper never retries on client-side JSON parse failures. It only retries on:

- HTTP `429`, `408`, `500`, `502`, `503`, `504` (not `501`)
- Network / abort errors

Between attempts it sleeps `min(500ms * 2^(attempt - 1), 8s)`, or honours `Retry-After` when the server sends one (clamped to 15 s). Max 3 attempts per call. Every attempt is counted in the per-call audit's `attempts` field.

## Key concepts

- **`null` means "fall back to rules".** Every high-level function (modeling / simulation / normalize / adaptive question) returns `null` rather than throwing when the provider is unconfigured, policy-denied, or failing. Callers never have to try/catch provider errors inline.
- **Env wins over stored config.** You can deploy the same store to a local machine (using stored config) and a cloud environment (using env vars) without changing code.
- **Audit is structured, not free-form.** The per-call audit is machine-readable jsonl; build Grafana / Datadog / Splunk dashboards directly against it.
- **Sanitize before send.** The engine calls `sanitizeProfileForProvider` internally before every request, and surfaces the redacted field list in the operation audit.

## Related docs

- [Privacy Model](../privacy/privacy-model.md) — the scope / policy logic wrapped by this package.
- [Modeling Engine](./modeling-engine.md) — `deriveInferredProfileWithProvider` entry point.
- [Simulation Contract](../simulation/simulation-contract.md) — uses the simulation insight.
- [AI Provider Guide](./ai-provider.md) — hands-on setup with env + file config.
