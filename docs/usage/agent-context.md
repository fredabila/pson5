# Agent Context Layer

This document defines the agent-standardized personalization view for PSON5.

## Purpose

Agents should not consume the full `.pson` document by default.

They should consume a filtered, relevance-scored projection that:

- keeps direct user facts and inferred patterns separate
- excludes raw answer history
- excludes low-confidence noise
- respects restricted fields
- returns only task-relevant personal data

## Current SDK Surface

- `buildAgentContext(profile, options)`
- `getAgentContext(profileId, options, storeOptions)`

## Current API Surface

- `POST /v1/pson/agent-context`

Implementation:

- [agent-context/src/index.ts](/C:/Users/user/pson5/packages/agent-context/src/index.ts)

## Agent Context Shape

```ts
{
  profile_id: string;
  pson_version: string;
  context_version: "1.0";
  intent: string;
  generated_at: string;
  personal_data: {
    preferences: AgentContextEntry[];
    communication_style: AgentContextEntry[];
    behavioral_patterns: AgentContextEntry[];
    learning_profile: AgentContextEntry[];
    current_state: AgentContextEntry[];
    predictions: AgentContextEntry[];
  };
  constraints: {
    restricted_fields: string[];
    local_only: boolean;
    allowed_for_agent: string[];
  };
  reasoning_policy: {
    treat_as_fact: string[];
    treat_as_inference: string[];
    treat_as_prediction: string[];
  };
}
```

## Selection Rules

The current implementation:

1. starts from observed facts and inferred traits
2. ignores raw answer records
3. removes restricted observed facts
4. removes low-confidence entries below `min_confidence`
5. deduplicates overlapping items by key and prefers observed facts
6. ranks remaining entries by intent relevance and confidence
7. groups the result into agent-facing categories

## Relevance Model

Relevance is currently rules-based.

It uses:

- the agent `intent`
- optional `task_context`
- known key-to-topic mappings

Example:

- `learning_mode` becomes more relevant for intents like `tutoring`, `study planning`, or `education support`
- `task_start_pattern` becomes more relevant for intents like `task planning`, `coaching`, or `deadline support`

## Example

```ts
import { PsonClient } from "@pson5/sdk";

const client = new PsonClient();

const context = await client.getAgentContext(
  "pson_123",
  {
    intent: "help the user study for an exam",
    domains: ["core", "education"],
    max_items: 4,
    include_predictions: true,
    min_confidence: 0.6,
    task_context: {
      task: "study for exam",
      deadline_days: 2
    }
  },
  { rootDir: ".pson5-store" }
);
```

## What Agents Should Use

Agents should primarily use:

- `personal_data.preferences`
- `personal_data.communication_style`
- `personal_data.behavioral_patterns`
- `personal_data.learning_profile`

They should treat:

- `current_state` as dynamic and provisional
- `predictions` as scenario support, not user fact

## What Agents Should Avoid

Agents should not default to:

- raw `layers.observed.<domain>.answers`
- full `knowledge_graph`
- full internal heuristics
- provider audit details
- unrestricted ingestion of every profile field

## Current Limits

- relevance ranking is still rules-based
- domain-specific ranking plugins are not implemented yet
