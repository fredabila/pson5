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
- provider config and policy inspection
- domain module registration
- user-id based profile lookup
