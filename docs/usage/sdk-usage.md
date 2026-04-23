# SDK Usage

## Purpose

This document shows how to use the current PSON5 SDK from application or agent code.

For remote agent access and API-side auth, also see:

- [agent-tools.md](/C:/Users/user/pson5/docs/usage/agent-tools.md)
- [agent-auth.md](/C:/Users/user/pson5/docs/usage/agent-auth.md)

## Current Package

- `@pson5/sdk`

Implementation:

- [sdk/src/index.ts](/C:/Users/user/pson5/packages/sdk/src/index.ts)

## What The SDK Does Today

The SDK currently wraps the local file-backed profile lifecycle and the acquisition, modeling, simulation, state, graph, provider-status, and Neo4j sync layers.

It now also supports saving configurable domain modules into the store so acquisition is not limited to the built-in registry.

It does not currently:

- authenticate remote users
- call Claude
- enforce production-grade privacy policy

## Important Clarification About LLMs

The SDK itself is not the model runtime.

Current split:

- `@pson5/sdk` orchestrates profile lifecycle, learning, simulation, and projection
- `@pson5/provider-engine` is the optional provider bridge
- provider-backed cognition only runs when provider config exists and policy allows it

So if you are looking for where OpenAI or Anthropic is actually invoked, that does not happen in `PsonClient` directly. It happens under the provider layer.

## Basic Flow

1. Create a profile
2. Ask the next question
3. Submit learning answers
4. Load the updated profile
5. Run simulation
6. Inspect graph support or state snapshot

## Example

```ts
import { PsonClient } from "@pson5/sdk";

const client = new PsonClient();

const profile = await client.createAndSaveProfile(
  {
    user_id: "user_123",
    domains: ["core", "education"],
    depth: "deep"
  },
  { rootDir: ".pson5-store" }
);

const next = await client.getNextQuestions(
  profile.profile_id,
  { limit: 1 },
  { rootDir: ".pson5-store" }
);

const question = next.questions[0];

await client.learn(
  {
    profile_id: profile.profile_id,
    session_id: next.session.session_id,
    answers: [
      {
        question_id: question.id,
        value: "last_minute"
      }
    ]
  },
  { rootDir: ".pson5-store" }
);

const loaded = await client.loadProfile(profile.profile_id, {
  rootDir: ".pson5-store"
});

const simulation = await client.simulate(
  {
    profile_id: profile.profile_id,
    context: {
      task: "study for exam",
      deadline_days: 2,
      difficulty: "high"
    },
    domains: ["education"],
    options: {
      include_reasoning: true,
      include_evidence: true,
      explanation_level: "detailed"
    }
  },
  { rootDir: ".pson5-store" }
);

const support = await client.getGraphSupport(
  profile.profile_id,
  simulation.prediction,
  { rootDir: ".pson5-store" }
);

const state = await client.getStateSnapshot(profile.profile_id, {
  rootDir: ".pson5-store"
});

const safeExport = await client.exportById(profile.profile_id, {
  rootDir: ".pson5-store",
  redaction_level: "safe"
});
```

## Custom Domain Modules

```ts
import { PsonClient } from "@pson5/sdk";

const client = new PsonClient();
const store = { rootDir: "C:/Users/user/pson5/.pson5-store" };

await client.saveDomainModules(
  [
    {
      id: "identity",
      version: "1.0.0",
      description: "Basic identity and communication fields.",
      questions: [
        {
          id: "identity_preferred_name",
          domain: "identity",
          prompt: "What name would you like the system to use for you?",
          type: "free_text",
          depth: "light",
          sensitivity: "standard",
          information_targets: ["preferred_name"],
          follow_up_rules: []
        }
      ]
    }
  ],
  store
);

const registry = await client.getResolvedQuestionRegistry(store);
console.log(registry.map((question) => question.id));
```

## Resolve Profiles By App User Id

If your application already has a stable user id, use that as `user_id` when the profile is created. The SDK can then resolve the latest mapped profile directly from that user id:

```ts
const profile = await client.createAndSaveProfile(
  {
    user_id: "app_user_42",
    domains: ["core"]
  },
  store
);

const latest = await client.loadProfileByUserId("app_user_42", store);
const profileIds = await client.findProfilesByUserId("app_user_42", store);
```

## Agent Tool Examples

Examples in this repo:

- [examples/agent-tools/sdk-agent-loop.ts](/C:/Users/user/pson5/examples/agent-tools/sdk-agent-loop.ts)
- [examples/agent-tools/pson-sdk-tools.ts](/C:/Users/user/pson5/examples/agent-tools/pson-sdk-tools.ts)
- [examples/agent-tools/openai-function-tools.ts](/C:/Users/user/pson5/examples/agent-tools/openai-function-tools.ts)

## Current SDK Methods

- `createProfile(input)`
- `createAndSaveProfile(input, options)`
- `loadProfile(profileId, options)`
- `loadProfileByUserId(userId, options)`
- `findProfilesByUserId(userId, options)`
- `import(document, options)`
- `getQuestionRegistry()`
- `getNextQuestions(profileId, input, options)`
- `learn(input, options)`
- `simulate(request, options)`
- `getGraphSupport(profileId, prediction, options)`
- `getStateSnapshot(profileId, options)`
- `buildAgentContext(profile, options)`
- `getAgentContext(profileId, options, storeOptions)`
- `getProviderStatus()`
- `getNeo4jConfig()`
- `getNeo4jStatus()`
- `saveNeo4jConfig(input, options)`
- `clearNeo4jConfig(options)`
- `syncProfileGraph(profileId, options)`
- `getProviderPolicy(profileId, operation, options)`
- `validate(document)`
- `export(profile)`
- `exportById(profileId, options)`
- `getPreference(profile, key)`

## Store Options

All persistent SDK operations accept:

```ts
{
  rootDir?: string;
  adapter?: ProfileStoreAdapter;
}
```

`rootDir` controls where the file-backed `.pson5-store` data lives.

`adapter` lets you swap the storage backend while keeping the same SDK methods.

## Neo4j Graph Sync

The SDK can now check Neo4j connectivity and sync a profile's `knowledge_graph` into a real Neo4j database.

```ts
await client.saveNeo4jConfig(
  {
    uri: "neo4j+s://example.databases.neo4j.io",
    username: "neo4j",
    password: process.env.NEO4J_PASSWORD ?? "",
    database: "neo4j"
  },
  store
);

const status = await client.getNeo4jStatus(store);
const sync = await client.syncProfileGraph(profile.profile_id, store);
```

## Custom Storage Adapter

The current built-in adapter is filesystem-backed, but the SDK surface now supports passing a custom adapter through store options:

```ts
import type { ProfileStoreAdapter } from "@pson5/core-types";

const cloudAdapter: ProfileStoreAdapter = {
  kind: "cloud",
  async saveProfile(profile) {
    return profile;
  },
  async loadProfile(profileId) {
    throw new Error(`Implement cloud load for ${profileId}`);
  },
  async profileExists(profileId) {
    return false;
  },
  async listProfileRevisions(profileId) {
    return [];
  },
  async findProfilesByUserId(userId) {
    return [];
  },
  async loadProfileByUserId(userId) {
    throw new Error(`Implement cloud lookup for ${userId}`);
  }
};

const store = {
  adapter: cloudAdapter
};
```

The serialization package also now includes a built-in in-memory adapter intended for tests and embedded agent runtimes where you want PSON behavior without filesystem persistence.

For cloud backends, the serialization layer now also exposes a document-store adapter factory. The intended shape is:

- your repository handles document reads and writes
- PSON handles profile validation, revision/index semantics, and the public SDK/API behavior

That is the bridge point for Firestore, DynamoDB, Postgres JSON/document tables, or similar stores.

The first concrete repository implementation is a document-style filesystem repository. It is still local, but it uses the same repository contract shape a cloud backend would implement.

```ts
import {
  createDocumentProfileStoreAdapter,
  createFileDocumentProfileStoreRepository
} from "@pson5/serialization-engine";

const store = {
  adapter: createDocumentProfileStoreAdapter(
    createFileDocumentProfileStoreRepository("C:/Users/user/pson5/.pson5-store-document")
  )
};
```

There is now also a Postgres-oriented repository package at `@pson5/postgres-store`. It does not force a specific client library; instead, you provide a query executor and PSON provides:

- schema SQL
- query set
- repository implementation

Conceptually:

```ts
import { Pool } from "pg";
import { createDocumentProfileStoreAdapter } from "@pson5/serialization-engine";
import {
  createPostgresProfileStoreArtifacts,
  createPostgresProfileStoreRepository,
  createPostgresQueryExecutor
} from "@pson5/postgres-store";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const executor = createPostgresQueryExecutor(pool);
const artifacts = createPostgresProfileStoreArtifacts();

// Run artifacts.schemaSql in your migration/bootstrap path.

const store = {
  adapter: createDocumentProfileStoreAdapter(
    createPostgresProfileStoreRepository(executor)
  )
};
```

## Integration Guidance

Use the SDK when:

- your agent runs on the same machine or service boundary
- you want local, direct access to the profile lifecycle
- you do not need HTTP transport

Use the API when:

- you need remote access
- you want a browser, another service, or a different runtime to call PSON5
- you need versioned request/response contracts

## Current Limitations

- local file persistence only
- no distributed locking
- no user auth
- no hosted PSON cloud service in this repo
- no real policy engine
- no external graph database

## Safe Export

`export()` and `exportById()` support:

```ts
{
  redaction_level?: "full" | "safe";
}
```

`safe` currently:

- redacts `user_id`
- removes restricted observed facts
- omits provider-generated `ai_model` payloads from the export

## Agent Standardization Layer

The SDK now includes an agent-facing projection layer so agents can use filtered personalization context instead of full `.pson` internals.

See:

- [agent-context.md](/C:/Users/user/pson5/docs/usage/agent-context.md)
- [agent-integration.md](/C:/Users/user/pson5/docs/usage/agent-integration.md)
- [pson-agent-skill.md](/C:/Users/user/pson5/docs/usage/pson-agent-skill.md)
- [agent-tools.md](/C:/Users/user/pson5/docs/usage/agent-tools.md)

## Framework-Consumable Tool Definitions

The SDK now also exports reusable tool contracts for agent frameworks:

- `getPsonAgentToolDefinitions()`
- `createPsonAgentToolExecutor(client, storeOptions)`

This gives you a stable set of tool names, JSON-schema inputs, and an execution layer without rebuilding the contract in every project.
