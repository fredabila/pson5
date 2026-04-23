# Quickstart

> Get a real PSON5 profile running end-to-end in about five minutes. Three paths: local SDK, HTTP API, or the CLI. Pick whichever matches your runtime.

## Prerequisites

- **Node.js 20 or newer** (`node --version`)
- **npm** (ships with Node)
- **Optional**: a Claude or OpenAI API key if you want provider-backed augmentation. PSON5 runs fully without one — every engine has a rule-based path.

## Install

```bash
npm install @pson5/sdk @pson5/acquisition-engine @pson5/agent-context @pson5/serialization-engine
```

Or clone the monorepo and use workspace linking:

```bash
git clone https://github.com/fredabila/pson5.git
cd pson5
npm install
npm run build
```

## The 4-line starter

```ts
import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();
const profile = await pson.createAndSaveProfile({ user_id: "user_123" });
console.log(profile.profile_id, profile.metadata.revision); // pson_... 1
```

That's a complete PSON5 profile on disk under `.pson5-store/`. No provider needed.

## Path A — SDK (same process)

Best when your agent runs in the same Node process as PSON5.

```ts
import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();
const store = { rootDir: ".pson5-store" };

// 1. Create a profile
const profile = await pson.createAndSaveProfile(
  { user_id: "user_123", domains: ["core", "productivity"], depth: "standard" },
  store
);

// 2. Ask the next adaptive question
const session = await pson.getNextQuestions(profile.profile_id, { limit: 1 }, store);
const question = session.questions[0];
console.log(question.prompt);

// 3. Record the user's answer (runs modeling → state → graph → save)
const learn = await pson.learn(
  {
    profile_id: profile.profile_id,
    session_id: session.session.session_id,
    answers: [{ question_id: question.id, value: "plan_first" }],
    options: { return_next_questions: true, next_question_limit: 1 }
  },
  store
);

// 4. Project agent-safe context
const context = await pson.getAgentContext(
  profile.profile_id,
  { intent: "help the user plan a study session", include_predictions: true },
  store
);
// context.personal_data is relevance-ranked. context.redaction_notes tells you
// exactly why any field is missing (restricted_field | low_confidence |
// consent_not_granted). constraints.restricted_fields is still honoured.

// 5. Run a scenario simulation (rule-based when no provider, richer with one)
const sim = await pson.simulate(
  {
    profile_id: profile.profile_id,
    context: { task: "study for exam", deadline_days: 2, difficulty: "high" },
    options: { include_reasoning: true, include_evidence: true }
  },
  store
);
```

## Path B — HTTP API

Best when your agent runs remotely or in a different runtime.

Start the API:

```bash
PSON_STORE_BACKEND=file PSON_STORE_DIR=.pson5-store PORT=3015 npm run dev:api
```

Then:

```bash
# Create a profile
curl -s -X POST http://localhost:3015/v1/pson/init \
  -H 'content-type: application/json' \
  -H 'x-pson-role: editor' -H 'x-pson-scopes: profiles:write' \
  -d '{"user_id":"user_123","domains":["core"],"depth":"light"}'

# Fetch next question
curl -s -X POST http://localhost:3015/v1/pson/question/next \
  -H 'content-type: application/json' \
  -H 'x-pson-role: editor' -H 'x-pson-scopes: profiles:write' \
  -d '{"profile_id":"pson_…","limit":1}'

# Agent context
curl -s -X POST http://localhost:3015/v1/pson/agent-context \
  -H 'content-type: application/json' \
  -H 'x-pson-role: viewer' -H 'x-pson-scopes: profiles:read,agent-context:read' \
  -d '{"profile_id":"pson_…","intent":"help the user plan"}'
```

Every response carries `x-pson-request-id` for correlation. See
[API Contract](../api/api-contract.md) for auth (API key / JWT / JWKS),
scopes, redaction semantics, and the full route surface.

## Path C — CLI

Best for local workflows, scripts, and quick inspection.

```bash
# Create
pson init user_123 --store .pson5-store --json
# => {"success":true,"data":{"profile_id":"pson_…","revision":1,...}}

# Learn
pson question-next pson_… --limit 1 --store .pson5-store --json
pson learn pson_… core_deadline_effect mixed --session learn_… --store .pson5-store --json

# Agent context
pson agent-context pson_… --intent "study plan" --include-predictions --json

# Simulate
pson simulate pson_… \
  --context '{"task":"study","deadline_days":2,"difficulty":"high"}' \
  --domains core --json

# Inspect
pson inspect pson_… --store .pson5-store
pson state pson_… --store .pson5-store
pson graph pson_… --store .pson5-store
```

Every CLI command prints JSON (default pretty-printed; single-line with `--json`).
Errors carry a typed `error.code` in the JSON envelope.

## Adding a model provider (optional)

PSON5 is fully functional without a provider. Add one to enable adaptive
question rewriting, answer normalization for free-form text, AI-augmented
modeling, and provider-backed simulation.

### Claude (Anthropic)

```bash
export PSON_AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export PSON_AI_MODEL=claude-haiku-4-5-20251001     # fast + cheap
# export PSON_AI_MODEL=claude-sonnet-4-6           # balanced
```

Or persist to the store:

```bash
pson provider-set anthropic --api-key sk-ant-... --model claude-haiku-4-5-20251001 \
  --store .pson5-store
```

### OpenAI

```bash
export PSON_AI_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export PSON_AI_MODEL=gpt-4.1-mini
```

### Any OpenAI-compatible endpoint (Ollama, vLLM, LiteLLM, Groq, Together, …)

```bash
# Ollama
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:11434/v1
export PSON_AI_MODEL=llama3.1
# No API key required for local Ollama.

# Groq
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=https://api.groq.com/openai/v1
export PSON_AI_API_KEY=gsk_...
export PSON_AI_MODEL=llama-3.1-70b-versatile
```

And anyone can write their own adapter — see [Provider Adapters](./provider-adapters.md).

## Check the provider policy before relying on it

```ts
const policy = await pson.getProviderPolicy(profile.profile_id, "simulation", store);
if (!policy.allowed) {
  console.log(`Fallback to rules: ${policy.reason}`);
}
```

Reason codes are stable:
- `"User consent is not granted."`
- `"Profile is marked local_only, so remote AI providers are disabled."`
- `"Required AI consent scopes are missing."`
- `"Provider is not configured."`
- `"Provider integration is disabled."`

## Storage backends

The default is a file store at `.pson5-store/`. Swap it without changing your code.

```ts
import { createDocumentProfileStoreAdapter } from "@pson5/serialization-engine";
import { createPostgresProfileStoreRepository } from "@pson5/postgres-store";

const repository = await createPostgresProfileStoreRepository({
  connectionString: process.env.DATABASE_URL,
  schema: "pson5"
});
const adapter = createDocumentProfileStoreAdapter(repository);

const profile = await pson.createAndSaveProfile({ user_id: "user_123" }, { adapter });
```

See [Serialization Engine](./serialization-engine.md) for every adapter.

## What to read next

- [Agent integration](./agent-integration.md) — the recommended pattern for agents.
- [Agent context](./agent-context.md) — the projection layer and redaction notes.
- [Provider adapters](./provider-adapters.md) — plug any model in via one interface.
- [CLI reference](./cli-reference.md) — every command and flag.
- [API contract](../api/api-contract.md) — every route, every auth scope.
- [PSON profile schema](../schemas/pson-schema.md) — the `.pson` file format.
