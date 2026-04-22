# `@pson5/simulation-engine`

Scenario simulation runtime for PSON5 profiles.

## Install

```bash
npm install @pson5/simulation-engine
```

## Usage

```ts
import { simulateStoredProfile } from "@pson5/simulation-engine";

const result = await simulateStoredProfile({
  profile_id: "pson_123",
  context: {
    task: "study for exam",
    deadline_days: 2
  }
});
```

This package is used when you want prediction, confidence, evidence, caveats, and provider-backed hybrid simulation behavior.
