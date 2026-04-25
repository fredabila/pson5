# PSON5 SDK Full Setup

This guide is the operator-level setup path for teams building personalized applications with PSON5.

PSON5 can run in four deployment shapes:

- In-process TypeScript SDK for your backend.
- HTTP API for remote services and web/mobile clients.
- MCP server for ChatGPT, Claude Desktop, and MCP-aware agents.
- CLI/stdio MCP for local development and automation.

## Install

```bash
npm install @pson5/sdk
```

For a monorepo checkout:

```bash
npm install
npm run check
npm run build
```

## Minimal SDK Boot

```ts
import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();

const profile = await pson.ensureProfile(
  {
    user_id: "user_123",
    tenant_id: "tenant_acme",
    domains: ["core"],
    depth: "light"
  },
  { rootDir: ".pson5-store" }
);

console.log(profile.profile_id);
```

Use `ensureProfile` for product onboarding. It loads the user's profile if it exists and creates one if not.

## Store Options

Most SDK methods accept an optional `ProfileStoreOptions` object.

```ts
type ProfileStoreOptions = {
  rootDir?: string;
  adapter?: ProfileStoreAdapter;
};
```

Common choices:

```ts
// Filesystem, good for local dev and single-node deployments.
const store = { rootDir: ".pson5-store" };

// Adapter-backed, good for Postgres, memory, tests, and custom stores.
const store = { adapter };
```

## Full User Lifecycle

```ts
import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();
const store = { rootDir: ".pson5-store" };

const profile = await pson.ensureProfile(
  {
    user_id: "user_123",
    tenant_id: "tenant_acme",
    domains: ["core", "education"],
    depth: "standard"
  },
  store
);

await pson.observeFact(
  {
    profile_id: profile.profile_id,
    domain: "core",
    key: "preferred_name",
    value: "Fred",
    confidence: 1,
    note: "User stated their preferred name."
  },
  store
);

const questions = await pson.getNextQuestions(
  profile.profile_id,
  {
    domains: ["education"],
    depth: "standard",
    limit: 2
  },
  store
);

await pson.learn(
  {
    profile_id: profile.profile_id,
    session_id: questions.session.session_id,
    answers: questions.questions.slice(0, 1).map((question) => ({
      question_id: question.id,
      value: "I prefer worked examples before independent practice."
    })),
    options: {
      return_next_questions: true,
      next_question_limit: 1
    }
  },
  store
);

const context = await pson.getAgentContext(
  profile.profile_id,
  {
    intent: "Personalize an algebra lesson for this learner.",
    domains: ["education", "core"],
    max_items: 12,
    include_predictions: true,
    min_confidence: 0.35,
    task_context: {
      product_surface: "lesson_planner",
      current_unit: "linear equations"
    }
  },
  store
);

console.log(context.personal_data);
```

## Agent Context Options

```ts
await pson.getAgentContext(profileId, {
  intent: "Explain photosynthesis to this learner.",
  domains: ["education", "core"],
  max_items: 12,
  include_predictions: true,
  min_confidence: 0.4,
  task_context: {
    grade_band: "middle_school",
    surface: "chat_tutor"
  }
});
```

Fields:

- `intent`: Required. What the downstream agent is trying to do.
- `domains`: Optional domain filters.
- `max_items`: Maximum projected facts/preferences/patterns.
- `include_predictions`: Include simulated/current-state predictions when available.
- `min_confidence`: Drop low-confidence inferred/simulated entries.
- `task_context`: Arbitrary object used for relevance scoring.

## Provider Setup Through SDK

```ts
await pson.configureProvider(
  {
    provider: "openai",
    api_key: process.env.OPENAI_API_KEY!,
    model: "gpt-4.1-mini",
    enabled: true,
    timeout_ms: 20000
  },
  store
);

const status = pson.getProviderStatus(store);
console.log(status);
```

Supported provider names in the public API:

- `openai`
- `anthropic`
- `openai-compatible`

## Simulation

Always check policy first:

```ts
const policy = await pson.getProviderPolicy(profile.profile_id, "simulation", store);

if (policy.allowed) {
  const simulation = await pson.simulate(
    {
      profile_id: profile.profile_id,
      domains: ["education"],
      context: {
        scenario: "The learner is stuck on a two-step equation.",
        question: "What intervention is likely to help them persist?",
        constraints: ["Keep response under 120 words", "Avoid giving the final answer"]
      },
      options: {
        include_reasoning: true,
        include_evidence: true,
        explanation_level: "standard"
      }
    },
    store
  );

  console.log(simulation.prediction);
}
```

Provider-backed simulation requires:

- Provider configured.
- `profile.consent.granted === true`.
- `privacy.local_only === false`.
- Consent scopes: `ai:use` and `ai:simulation`.

## Tool Executor for Any LLM Runtime

```ts
import {
  PsonClient,
  createPsonAgentToolExecutor,
  getPsonAgentToolDefinitions
} from "@pson5/sdk";

const pson = new PsonClient();
const executor = createPsonAgentToolExecutor(pson, { rootDir: ".pson5-store" });
const tools = getPsonAgentToolDefinitions();

async function callPsonTool(name: string, args: Record<string, unknown>) {
  return executor.execute({
    name: name as never,
    arguments: args
  });
}
```

Use this when your LLM runtime has its own tool-calling format. Convert `tools` into that provider's schema, route tool calls back into `executor.execute`, then pass results back to the model.

## Operational Checklist

For production:

- Use stable application user IDs, not display names.
- Set `tenant_id` for every multi-tenant deployment.
- Use Postgres or a custom adapter for multi-node deployments.
- Configure provider credentials through environment variables or secure stored config.
- Enable audit logs unless you have an external equivalent.
- Do not expose raw profiles to LLMs; use `getAgentContext`.
- Check provider policy before modeling or simulation.
- Export safe-redacted profiles for user downloads.
- Run integration tests against your chosen store adapter.

