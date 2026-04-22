# AI Provider Integration

PSON5 now supports a first-pass model-provider layer for profile augmentation and scenario simulation.

## Current State

- Implemented providers: `openai`, `anthropic`
- OpenAI transport: `POST /v1/responses`
- Anthropic transport: `POST /v1/messages`
- Output mode:
  - OpenAI: strict structured JSON
  - Anthropic: best-effort JSON with strict post-parse validation
- Fallback behavior: if no provider is configured, policy blocks it, or the provider call fails, PSON5 uses the existing rules-based modeling and simulation path

## Environment Variables

```bash
PSON_AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
PSON_AI_TIMEOUT_MS=20000
```

These env vars still work, but they should no longer be treated as the default operator workflow for local use.

## Recommended Local Setup

Use the CLI to save provider config into the active store:

```powershell
npm run dev --workspace @pson5/cli -- provider-set openai --api-key YOUR_KEY --model gpt-4.1-mini --store C:\Users\user\pson5\.pson5-store
```

Inspect it:

```powershell
npm run dev --workspace @pson5/cli -- provider-config --store C:\Users\user\pson5\.pson5-store
npm run dev --workspace @pson5/cli -- provider-status --store C:\Users\user\pson5\.pson5-store
```

Clear it:

```powershell
npm run dev --workspace @pson5/cli -- provider-clear --store C:\Users\user\pson5\.pson5-store
```

The stored config lives under:

```text
.pson5-store/config/provider.json
```

Current precedence:

1. environment variables
2. stored provider config file
3. rules-only fallback

Anthropic:

```bash
PSON_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
PSON_AI_TIMEOUT_MS=20000
```

## Consent Requirements

Provider usage is not enabled by API key alone.

The profile must also satisfy:

- `consent.granted=true`
- `privacy.local_only=false`
- `ai:use` scope
- `ai:modeling` scope for profile augmentation
- `ai:simulation` scope for provider-backed simulation

Without those scopes, PSON5 falls back to local rules and reports the denial reason through provider policy inspection.

## What The Provider Does

### Modeling

During `learn(...)`, PSON5 still derives rule-based traits and heuristics first.

If the provider is configured, it then adds:

- `layers.inferred.ai_model`
- `cognitive_model.processing_patterns.provider_summary`

The provider does not replace the core rule-derived traits yet. It augments them.

### Simulation

During `simulate(...)`, PSON5:

1. Generates the rules-based prediction
2. Requests a provider prediction from the active model provider
3. Merges both into a hybrid response when the provider succeeds
4. Falls back to rules-only when the provider is unavailable

The simulation response includes:

- `provider.mode`
- `provider.provider`
- `provider.model`

## Audit Logging

Provider usage is now appended to:

```text
.pson5-store/audit/provider.jsonl
```

Each record includes:

- timestamp
- profile id
- operation (`modeling` or `simulation`)
- allowed / denied
- provider and model
- denial reason when present
- redacted field paths
- success flag

## SDK Usage

```ts
import { PsonClient } from "@pson5/sdk";

const client = new PsonClient();

await client.configureProvider(
  {
    provider: "openai",
    api_key: process.env.OPENAI_API_KEY ?? "",
    model: "gpt-4.1-mini"
  },
  { rootDir: "C:/Users/user/pson5/.pson5-store" }
);

const status = client.getProviderStatus({ rootDir: "C:/Users/user/pson5/.pson5-store" });
console.log(status);
```

## API Usage

```http
GET /v1/pson/provider/status
```

Profile-specific policy inspection:

```http
GET /v1/pson/provider/status?profile_id=pson_123&operation=simulation
```

## CLI Usage

```bash
pson provider-status
pson provider-config
pson provider-set openai --api-key ... --model gpt-4.1-mini
pson provider-clear
pson provider-policy <profileId> simulation
```

## Important Limits

- OpenAI and Anthropic are wired
- Anthropic is not live-tested in this repo unless you provide an Anthropic key
- The provider layer is advisory and hybrid, not the sole source of truth
- Privacy redaction now strips restricted fields and blocks obvious sensitive candidate outputs, but audit depth is still incomplete
