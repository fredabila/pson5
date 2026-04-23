# @pson5/graph-engine

> Builds the in-profile knowledge graph, supports k-hop traversal, and produces path-based explanations for predictions.

## Install

```bash
npm install @pson5/graph-engine
```

## What this package does

The graph engine lives entirely inside the profile. It converts traits, heuristics, and states into typed nodes plus typed edges, and exposes traversal primitives that the simulation engine and any caller can use to explain *why* a prediction holds.

Nodes and edges live in `profile.knowledge_graph`. They are plain JSON, validated by `@pson5/schemas`, and portable with the `.pson` file. `@pson5/neo4j-store` can optionally sync the same structure to an external Neo4j for cross-profile queries.

## Exports

```ts
import {
  deriveKnowledgeGraph,
  getNodeNeighborhood,
  explainPrediction,
  explainPredictionSupport,
  graphEngineStatus,
  type GraphPath,
  type NeighborhoodResult,
  type NeighborhoodOptions,
  type PredictionExplanation
} from "@pson5/graph-engine";
```

| Export | Returns | Purpose |
| --- | --- | --- |
| `deriveKnowledgeGraph(profile)` | `PsonProfile` | Returns a new profile with `knowledge_graph.nodes` and `knowledge_graph.edges` populated. |
| `getNodeNeighborhood(profile, nodeId, options?)` | `NeighborhoodResult` | k-hop expansion from a node, with optional direction and edge-type filters. |
| `explainPrediction(profile, prediction, options?)` | `PredictionExplanation` | Full explanation record: target nodes, paths, support strings, missing targets. |
| `explainPredictionSupport(profile, prediction)` | `string[]` | Path-formatted support strings (backward-compatible shim over `explainPrediction`). |

## Node types

| Type | Id format | Emitted when |
| --- | --- | --- |
| `trait` | `trait:<domain>:<key>` | The modeling engine emits an inferred trait. |
| `decision_rule` | `heuristic:<id>` | The modeling engine emits a heuristic. |
| `state` | `state:<id>` | The state engine emits a state. |

## Edge types

`causes`, `correlates_with`, `reinforces`, and (future) `overrides` / `depends_on` / `contradicts`. See [PSON Profile Schema](../schemas/pson-schema.md) for the full list.

## Usage

### k-hop traversal

```ts
import { getNodeNeighborhood } from "@pson5/graph-engine";

const neighbourhood = getNodeNeighborhood(profile, "heuristic:deadline_driven_activation", {
  depth: 2,
  direction: "both", // "in" | "out" | "both"
  edge_types: ["reinforces", "correlates_with"]
});

// {
//   center: { id, type, label, data },
//   nodes:  [ ...up to depth hops from center ],
//   edges:  [ ...every edge touched during the walk ]
// }
```

### Path-based prediction explanation

```ts
import { explainPrediction } from "@pson5/graph-engine";

const result = explainPrediction(profile, "delayed_start");

// {
//   prediction: "delayed_start",
//   target_node_ids: [
//     "heuristic:deadline_driven_activation",
//     "heuristic:last_minute_study_pattern"
//   ],
//   paths: [
//     {
//       nodes: [
//         { id: "trait:core:task_start_pattern", ... },
//         { id: "heuristic:deadline_driven_activation", ... }
//       ],
//       edges: [
//         { id: "edge:task_start_to_deadline_activation", type: "reinforces", ... }
//       ]
//     },
//     ...
//   ],
//   support: [
//     "Supports deadline_driven_activation: core.task_start_pattern -[reinforces]-> deadline_driven_activation",
//     ...
//   ],
//   missing_targets: []
// }
```

Adding a new prediction only requires adding a new entry to the `PREDICTION_TARGETS` map — the traversal itself is generic.

## Key concepts

- **The graph is derived, not authored.** Every node and edge is reconstructed from traits / heuristics / states on each save. The graph is a *view* of the modeling output, not an independent artifact.
- **Paths are directional.** `explainPrediction` walks *incoming* edges from the target, so the first node in each path is the supporting evidence (usually a trait) and the last node is the target the prediction hangs on.
- **Explanations are deterministic.** Given the same profile and prediction, you get the same paths in the same order. Good for building audit trails and snapshot tests.
- **`explainPredictionSupport` is a compatibility shim.** It exists so the HTTP `/v1/pson/explain` endpoint and older SDK callers keep their `string[]` contract. New callers should prefer `explainPrediction` and render paths themselves.

## Related docs

- [State Engine](./state-engine.md) — emits the state nodes.
- [Modeling Engine](./modeling-engine.md) — emits the trait and heuristic nodes.
- [Simulation Contract](../simulation/simulation-contract.md) — consumes graph explanations.
- [Neo4j Store](./neo4j-store.md) — optional external persistence for the same graph.
