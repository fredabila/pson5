# `@pson5/sdk`

The primary TypeScript SDK for building with PSON5.

## Install

```bash
npm install @pson5/sdk
```

## Usage

```ts
import { PsonClient } from "@pson5/sdk";

const client = new PsonClient();

const profile = await client.createAndSaveProfile({
  user_id: "user_123",
  domains: ["core", "education"],
  depth: "standard"
});

const next = await client.getNextQuestions(profile.profile_id, { limit: 1 });
```

## What It Exposes

- profile creation and loading
- question flow and learning
- simulation
- agent-context projection
- framework-consumable agent tool definitions and executor helpers
- provider config and policy inspection
- domain module registration
- user-id based profile lookup

## Agent Examples

- `examples/agent-tools/sdk-agent-loop.ts`
- `examples/agent-tools/pson-sdk-tools.ts`
- `examples/agent-tools/openai-function-tools.ts`

## Important Clarification

The SDK is not the model runtime itself.

`@pson5/sdk` orchestrates PSON operations. Optional provider-backed language reasoning lives under the provider engine when configured and allowed by policy.
