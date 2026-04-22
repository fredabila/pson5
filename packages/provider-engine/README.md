# `@pson5/provider-engine`

Provider integration and provider-policy helpers for PSON5.

## Install

```bash
npm install @pson5/provider-engine
```

## What It Covers

- provider status resolution
- provider policy evaluation
- local stored provider config
- OpenAI and Anthropic integration
- provider-backed modeling and simulation support

## Usage

```ts
import { getProviderStatusFromEnv, getProviderPolicyStatus } from "@pson5/provider-engine";

const status = getProviderStatusFromEnv();
const policy = getProviderPolicyStatus(profile, "simulation");
```
