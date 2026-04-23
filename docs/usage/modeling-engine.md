# @pson5/modeling-engine

> Derives inferred traits, heuristics, and cross-domain patterns from observed answers. Always attaches confidence, evidence, and a decay policy.

## Install

```bash
npm install @pson5/modeling-engine
```

## What this package does

The modeling engine is called once per learning submission (by the acquisition engine) to convert the `layers.observed` state into `layers.inferred`. It runs rule-based derivation first, then optionally augments with a provider-backed insight when a provider is configured and policy allows.

Critical design rule: nothing the modeling engine emits is ever promoted to observed fact. Every derived trait or heuristic carries:

- a `score` (0 → 1 confidence)
- an `evidence[]` array of source answer references
- a `last_validated_at` timestamp
- a `decay_policy` (default `time_decay, half_life_days: 30`)

## Exports

```ts
import {
  deriveInferredProfile,
  deriveInferredProfileWithProvider,
  getModeledFieldPaths,
  modelingEngineStatus
} from "@pson5/modeling-engine";
```

| Export | Returns | Purpose |
| --- | --- | --- |
| `deriveInferredProfile(profile)` | `PsonProfile` | Rule-based pass. Derives traits + heuristics from observed answers. |
| `deriveInferredProfileWithProvider(profile, options?)` | `Promise<PsonProfile>` | Runs the rule-based pass, then asks the provider for a structured insight and applies it when policy allows. |
| `getModeledFieldPaths(profile)` | `string[]` | List of dot-paths the modeling engine owns (used by callers to know which fields are "theirs"). |

## Usage

```ts
import { deriveInferredProfile } from "@pson5/modeling-engine";

const inferred = deriveInferredProfile(profile);

// inferred.layers.inferred.core.traits
//   -> [{ key, value, domain, source_question_ids, confidence: { score, evidence, ... } }, ...]
// inferred.layers.inferred.heuristics
//   -> [{ id, domain, description, when, outcome, confidence }, ...]
// inferred.metadata.confidence
//   -> overall profile confidence (average of traits + heuristics)
```

### Provider-backed modeling

```ts
import { deriveInferredProfileWithProvider } from "@pson5/modeling-engine";

const enriched = await deriveInferredProfileWithProvider(profile, {
  rootDir: ".pson5-store"
});

// When a provider is configured and policy allows, the profile gains:
//   enriched.layers.inferred.ai_model.summary
//   enriched.layers.inferred.ai_model.trait_candidates
//   enriched.layers.inferred.ai_model.heuristic_candidates
//   enriched.layers.inferred.ai_model.caveats
// Sensitive candidates are filtered by @pson5/privacy.filterSensitiveProviderCandidates
// before being applied.
```

## Built-in heuristics

The rule-based derivation emits these heuristics when the observed evidence supports them:

| Heuristic id | Trigger | Outcome |
| --- | --- | --- |
| `deadline_driven_activation` | `task_start_pattern = delay_start` AND `deadline_effect` is `helps_focus` or `mixed` | "Likely to start late then increase effort." |
| `structured_workflow_preference` | `planning_style = structured` | "Prefers structured plans." |
| `last_minute_study_pattern` | `study_start_pattern = last_minute` | "Likely to delay exam preparation." |

Traits are extracted per domain from the `information_targets` of each question. See `buildDomainTraits` in the source for the mapping. Adding a new heuristic is a code change — this engine is intentionally transparent rather than configurable, so every inference is reviewable.

## Contradiction signals

The modeling engine inspects traits across domains. When it detects a split — for example, `task_start_pattern = start_immediately` at the core level but `study_start_pattern = last_minute` at the education level — it emits a contradiction object with `status: "needs_more_context"` into `layers.inferred.contradictions`. Acquisition surfaces these via `session.contradiction_flags`; consumers should treat them as "ask the user again" signals rather than as a hard error.

## Key concepts

- **Traits are typed, not opaque.** Each `InferredTraitRecord` has a `key` (information target), a `value` (normalized), a `domain`, and a `source_question_ids` list tying it back to the answers that produced it.
- **Confidence is a whole record, not just a number.** `{ score, method, last_validated_at, decay_policy, evidence }`. State-engine decays this at query time.
- **The AI layer is additive.** Provider-derived candidates land in `layers.inferred.ai_model`; they never overwrite `layers.inferred.<domain>.traits`. Rule-based derivation is always the anchor.
- **Restricted candidates are filtered.** Before the provider output is applied, `@pson5/privacy.filterSensitiveProviderCandidates` drops anything whose textual content matches the sensitive-hint list.

## Related docs

- [PSON Profile Schema](../schemas/pson-schema.md) — shape of the trait / heuristic records.
- [Acquisition Engine](./acquisition-engine.md) — where `deriveInferredProfile` is called from.
- [State Engine](./state-engine.md) — reads modeling output to derive active states.
- [Graph Engine](./graph-engine.md) — reads traits and heuristics to build the knowledge graph.
- [Privacy Model](../privacy/privacy-model.md) — the filter applied to provider output.
