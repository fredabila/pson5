# `@pson5/agent-context`

Agent-safe projection layer for turning a full PSON profile into bounded personalization context.

## Install

```bash
npm install @pson5/agent-context
```

## Usage

```ts
import { buildAgentContext } from "@pson5/agent-context";

const context = buildAgentContext(profile, {
  intent: "tutoring",
  include_predictions: true,
  max_items: 10
});
```

Use this package when an agent should consume relevant personal data without reading the entire raw `.pson` profile.
