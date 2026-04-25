# Connecting LLMs to PSON5

PSON5 is not an LLM runtime. It is the personalization substrate your LLM runtime calls.

The standard loop is:

1. Resolve user identity.
2. Ensure/load profile.
3. Get agent context for the current task.
4. Send the agent context to the LLM as bounded personalization context.
5. Let the LLM call PSON tools when it needs to learn, remember, or simulate.
6. Store only user-volunteered facts and structured answers.

## Recommended System Prompt Contract

```text
You have access to PSON5, a user personalization profile system.

Rules:
- Use pson_ensure_profile once when a user session starts.
- Use pson_get_agent_context before personalizing tone, content, difficulty, or recommendations.
- Use pson_observe_fact only for facts the user explicitly states or confirms.
- Use pson_get_next_questions only when the user opts into profile setup or when the next question materially improves the task.
- Use pson_learn only to submit answers to PSON-generated questions.
- Use pson_get_provider_policy before pson_simulate.
- Treat pson_simulate output as probabilistic, not fact.
- Never invent user_id. The app/server supplies identity.
- Never expose raw profile JSON to the user unless they request export/download.
```

## OpenAI-Style Function Tool Adapter

```ts
import {
  PsonClient,
  getPsonAgentToolDefinitions,
  createPsonAgentToolExecutor
} from "@pson5/sdk";

const pson = new PsonClient();
const executor = createPsonAgentToolExecutor(pson, { rootDir: ".pson5-store" });

export const openAiTools = getPsonAgentToolDefinitions().map((tool) => ({
  type: "function",
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema
}));

export async function runPsonTool(name: string, args: Record<string, unknown>) {
  return executor.execute({
    name: name as never,
    arguments: args
  });
}
```

## Generic Agent Loop

```ts
const profile = await pson.ensureProfile(
  {
    user_id: appUser.id,
    tenant_id: appUser.tenantId,
    domains: ["core", "education"],
    depth: "standard"
  },
  store
);

const agentContext = await pson.getAgentContext(
  profile.profile_id,
  {
    intent: userMessage,
    domains: ["core", "education"],
    include_predictions: true,
    max_items: 16
  },
  store
);

const messages = [
  {
    role: "system",
    content: [
      "Personalize using the provided PSON agent context.",
      "Do not treat inferred or simulated data as certainty.",
      "Ask before storing sensitive information."
    ].join("\n")
  },
  {
    role: "developer",
    content: JSON.stringify({ pson_agent_context: agentContext })
  },
  {
    role: "user",
    content: userMessage
  }
];

// Send messages + tools to your LLM provider.
```

## When to Call Each Tool

| Tool | Use when | Do not use when |
| --- | --- | --- |
| `pson_ensure_profile` | Session startup | Every message unless your runtime is stateless |
| `pson_get_agent_context` | Before personalization | You only need to store a fact |
| `pson_observe_fact` | User explicitly states a fact/preference | You inferred it from behavior |
| `pson_get_next_questions` | User opts into setup or calibration | Casual conversation |
| `pson_learn` | Answering a PSON question | Storing arbitrary chat facts |
| `pson_get_provider_policy` | Before AI-backed modeling/simulation | After policy already denied |
| `pson_simulate` | Predicting likely preference/behavior under a scenario | Asking for factual profile data |

## MCP Deployment

Use MCP when the LLM product owns the tool runtime, for example ChatGPT Apps or desktop agents.

Server URL:

```text
https://your-api.example.com/v1/mcp
```

ChatGPT-specific notes:

- The server supports `_meta["openai/subject"]` when ChatGPT supplies it.
- If no subject is supplied, the server can fall back to bearer/API-key hash or MCP session hash.
- A shared fallback credential creates a shared profile; use per-user tokens or subject metadata for true per-user persistence.
- Refresh/reconnect the ChatGPT app after changing tool schemas.

## Backend-Owned Deployment

Use the SDK directly when your application owns authentication:

```ts
app.post("/chat", async (req, res) => {
  const user = await requireUser(req);
  const profile = await pson.ensureProfile({
    user_id: user.id,
    tenant_id: user.tenantId,
    domains: ["core"],
    depth: "light"
  });

  const context = await pson.getAgentContext(profile.profile_id, {
    intent: req.body.message
  });

  const answer = await runYourLlm({ message: req.body.message, context });
  res.json({ answer });
});
```

This is the most reliable architecture for production apps because your app controls user identity and tenancy.

## Writing Memory Safely

Good writes:

```ts
await pson.observeFact({
  profile_id,
  domain: "education",
  key: "prefers_visual_examples",
  value: true,
  confidence: 1,
  note: "User said visual examples help them understand."
});
```

Bad writes:

```ts
// Do not store model guesses as observed facts.
await pson.observeFact({
  profile_id,
  domain: "core",
  key: "has_adhd",
  value: true,
  note: "Model guessed from behavior."
});
```

Model guesses belong in inferred/simulated layers through the modeling/simulation engines, not observed facts.

