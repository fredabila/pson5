# @pson5/schemas

> Canonical Zod-based validator for `.pson` profiles. Used by the serialization engine and the `/v1/pson/validate` API endpoint.

## Install

```bash
npm install @pson5/schemas
```

## What this package does

`@pson5/schemas` is the single source of truth for the `.pson` document shape at runtime. It expresses the canonical schema as a [Zod](https://zod.dev) schema, produces a strongly-typed `PsonProfile` from it, and exposes two helpers:

- `validatePsonProfile(document)` — returns a typed `ValidationResult` with the parsed profile or the list of issues.
- `pson5Schema` — the raw Zod schema, exported for callers that want to compose it with their own validations.

Every write path in PSON5 goes through this package. Imports fail with `ProfileStoreError("validation_error", ...)` if the document doesn't match.

## Exports

```ts
import {
  validatePsonProfile,
  pson5Schema,
  schemasStatus,
  type ValidationIssue
} from "@pson5/schemas";
```

## Usage

### Validate an unknown document

```ts
import { validatePsonProfile } from "@pson5/schemas";

const result = validatePsonProfile(untrustedJson);
if (!result.success) {
  for (const issue of result.issues) {
    console.error(`${issue.path}: ${issue.message}`);
  }
} else {
  // result.value is now typed as PsonProfile
}
```

### Compose with your own schema

```ts
import { pson5Schema } from "@pson5/schemas";
import { z } from "zod";

const tenantProfileSchema = pson5Schema.extend({
  tenant_id: z.string().min(1) // require tenant_id at your app boundary
});
```

## What's validated

The schema enforces:

- **Structural shape** — `pson_version`, `profile_id`, `user_id`, `consent`, `domains`, `layers.observed | inferred | simulated`, `cognitive_model`, `behavioral_model`, `state_model`, `knowledge_graph`, `simulation_profiles`, `privacy`, `metadata`.
- **Consent fields** — `granted: boolean`, `scopes: string[]`, `policy_version: string`, `updated_at: ISO 8601`.
- **Depth enum** — `"light" | "standard" | "deep"`.
- **Metadata** — `confidence: 0..1`, `revision: int ≥ 1`, `source_count: int ≥ 0`, `created_at` / `updated_at` ISO 8601.
- **Graph node + edge types** — node types constrained to `trait | decision_rule | state | preference | behavior | skill | trigger | domain_fact`; edge types to `causes | correlates_with | depends_on | overrides | reinforces | contradicts`.
- **Privacy** — `access_levels` is a `Record<string, "public" | "private" | "restricted">`.

Confidence records, evidence references, state definitions, and simulation scenarios are validated against their own nested schemas.

## Validation result shape

```ts
interface ValidationResult<T> {
  success: boolean;
  issues: Array<{ path: string; message: string }>;
  value?: T;
}
```

- `success: true` — `value` is the parsed `PsonProfile`. `issues` is `[]`.
- `success: false` — `value` is `undefined`. `issues` is the full list of Zod error paths and messages.

The API endpoint `POST /v1/pson/validate` returns this shape verbatim.

## Key concepts

- **`pson_version` is checked but not acted on.** The schema accepts any version string today. When PSON5 moves to a 5.1 / 6.0 split, migration logic will go into this package.
- **Every engine calls `validatePsonProfile` on import, not on save.** Saves are validated via in-memory typing plus internal invariants. Imports cross a trust boundary, so they always validate explicitly.
- **The schema is not generated from core-types.** Today it is manually kept in sync. A future refactor will generate `@pson5/core-types` from the Zod schema using `zod-to-ts`.

## Related docs

- [PSON Profile Schema](../schemas/pson-schema.md) — design-level discussion of the `.pson` document.
- [Serialization Engine](./serialization-engine.md) — the primary caller.
- [API Quickstart](./api-quickstart.md) — `/v1/pson/validate` wraps this package.
