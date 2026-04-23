# @pson5/state-engine

> Derives transient user states, applies confidence decay over time, and evaluates triggers against observed facts at query time.

## Install

```bash
npm install @pson5/state-engine
```

## What this package does

The state engine is the runtime layer of PSON5. It answers "what is the user's current state given what the profile knows today?" — not just what it knew when the profile was last written.

Three responsibilities:

1. **Derive states** from modeling output. `deriveStateProfile(profile)` writes `state_model.states` and `state_model.transitions` based on inferred traits and heuristics.
2. **Apply time decay at query time.** `getActiveStateSnapshot(profile)` reduces the stored `confidence.score` based on elapsed time since `last_validated_at` and the decay policy's `half_life_days`. Yesterday's inference weighs less than today's.
3. **Evaluate triggers against current facts.** The same call checks which declared triggers on each state are active right now (derived from observed facts and inferred traits), and applies a bounded boost to that state's likelihood.

## Exports

```ts
import {
  deriveStateProfile,
  getActiveStateSnapshot,
  applyConfidenceDecay,
  getProfileTriggerContext,
  stateEngineStatus,
  type StateSnapshot,
  type StateSnapshotEntry,
  type StateEvaluationOptions
} from "@pson5/state-engine";
```

| Export | Returns | Purpose |
| --- | --- | --- |
| `deriveStateProfile(profile)` | `PsonProfile` | Returns a new profile with `state_model` populated from current inferred traits. |
| `getActiveStateSnapshot(profile, options?)` | `StateSnapshot` | Decay-aware, trigger-evaluated snapshot of active states right now. |
| `applyConfidenceDecay(confidence, now?)` | `number` | Returns the decayed `score` given a `ConfidenceRecord` and an anchor date. |
| `getProfileTriggerContext(profile)` | `Set<string>` | Set of trigger keys currently active given the profile's observed facts. |

## Usage

### Snapshot with decay + trigger boost (default)

```ts
import { getActiveStateSnapshot } from "@pson5/state-engine";

const snapshot = getActiveStateSnapshot(profile);
//
// {
//   profile_id: "pson_123",
//   generated_at: "2026-04-23T08:00:00.000Z",
//   evaluated_triggers: ["clear_structure", "deadline_pressure", ...],
//   decay_applied: true,
//   active_states: [
//     {
//       state_id: "stressed",
//       likelihood: 0.82,
//       base_confidence: 0.72,
//       decayed_confidence: 0.69,
//       trigger_boost: 0.13,
//       matched_triggers: ["deadline_pressure"]
//     },
//     ...
//   ]
// }
```

### Snapshot with decay disabled (historical comparison)

```ts
const frozen = getActiveStateSnapshot(profile, {
  apply_decay: false,
  apply_trigger_boost: false
});
// returns scores as they were stored at derivation time
```

### Decay at a specific time

```ts
const score = applyConfidenceDecay(trait.confidence, new Date("2026-06-01"));
```

## Built-in state derivation

`deriveStateProfile` emits up to four states from the rule-based modeling output:

| State | Trigger keys | When it appears |
| --- | --- | --- |
| `stressed` | `deadline_pressure` | `deadline_effect = causes_stress \| mixed` |
| `motivated` | `clear_urgency`, `near_deadline` | `deadline_effect = helps_focus` or `deadline_driven_activation` heuristic |
| `focused` | `clear_plan`, `structured_tasks` | `planning_style = structured` or `structured_workflow_preference` |
| `distracted` | `open_interruptions`, `attention_competition` | `main_distraction` has a value |

Each state carries a `confidence` record with `half_life_days: 14` by default. State transitions are emitted when supporting heuristics are present (e.g., `stressed → focused` on `clear_structure`).

## Trigger evaluation at query time

`getProfileTriggerContext(profile)` looks at `layers.observed` and returns the set of active trigger keys:

- `deadline_effect = "causes_stress" | "mixed"` → `deadline_pressure`
- `deadline_effect = "helps_focus" | "mixed"` → `clear_urgency`, `near_deadline`
- `task_start_pattern = "delay_start"` → `near_deadline`
- `planning_style = "structured"` → `clear_plan`, `structured_tasks`, `clear_structure`
- `main_distraction` present → `open_interruptions`, `attention_competition`
- `study_start_pattern = "last_minute"` → `deadline_now_salient`

A state's `likelihood` is `clamp(decayed_confidence + min(matched_triggers.length * 0.05, 0.15))`. Trigger boost is capped so base confidence remains dominant.

## Key concepts

- **State confidence is not static.** If you stored a profile six weeks ago with a `stressed` state at 0.72, today's snapshot will show a `decayed_confidence` around 0.37 given the default 14-day half-life. The raw score stays in the profile; the engine only decays at read time.
- **Triggers are evaluated from observed facts, not free-form input.** If you want to signal a real-time event (e.g., "deadline now"), surface it as an observed fact first so `getProfileTriggerContext` picks it up.
- **The snapshot always returns the same entries regardless of likelihood.** The agent context layer filters by `likelihood >= 0.6`; the state engine itself does not.
- **`deriveStateProfile` is deterministic per input.** Calling it twice on the same profile yields the same states (as long as `last_validated_at` comes from the underlying evidence).

## Related docs

- [Modeling Engine](./modeling-engine.md) — produces the traits the state engine reads.
- [Agent Context](./agent-context.md) — the consumer that filters low-likelihood states.
- [Simulation Contract](../simulation/simulation-contract.md) — uses the state snapshot as one of its inputs.
- [PSON Profile Schema](../schemas/pson-schema.md) — shape of `state_model` in the profile.
