# `@pson5/core-types`

Shared TypeScript contracts for the PSON5 ecosystem.

## What It Contains

- `PsonProfile`
- `InitProfileInput`
- learning session contracts
- simulation contracts
- provider policy contracts
- agent-context contracts
- storage adapter interfaces

## Install

```bash
npm install @pson5/core-types
```

## Usage

```ts
import type { InitProfileInput, PsonProfile } from "@pson5/core-types";

const input: InitProfileInput = {
  user_id: "user_123",
  domains: ["core", "education"],
  depth: "standard"
};

let profile: PsonProfile;
```

Use this package when you need type-safe contracts without pulling in runtime engines.
