# @pson5/privacy

> Consent evaluation, redaction, and provider-use policy. The single source of truth for "is this allowed to leave the profile?"

## Install

```bash
npm install @pson5/privacy
```

## What this package does

`@pson5/privacy` is the policy layer every other engine calls before letting data out of the profile. Four responsibilities:

1. **Scope evaluation** — is the user's consent granted, and does it cover the required scopes?
2. **Provider policy** — for a given profile + operation (`modeling` or `simulation`), is the provider allowed to run? Returns a structured `ProviderPolicyDecision` with reason codes.
3. **Profile sanitization** — strip `restricted_fields` before handing the profile to the provider.
4. **Export redaction** — produce a `safe` variant of the profile for external hand-off.

The package ships no state. Every function is pure and takes the profile explicitly.

## Exports

```ts
import {
  evaluateScopes,
  getRequiredProviderScopes,
  getProviderPolicyDecision,
  sanitizeProfileForProvider,
  isSensitiveProviderCandidate,
  filterSensitiveProviderCandidates,
  redactProfileForExport,
  privacyStatus,
  type ScopeEvaluationResult
} from "@pson5/privacy";
```

## Usage

### Scope evaluation

```ts
import { evaluateScopes } from "@pson5/privacy";

const check = evaluateScopes(profile, ["ai:use", "ai:modeling"]);
// { allowed: boolean, missing_scopes: string[] }
```

`allowed` requires `profile.consent.granted === true` AND every required scope to be in `profile.consent.scopes`.

### Provider policy decision

```ts
import { getProviderPolicyDecision } from "@pson5/privacy";

const decision = getProviderPolicyDecision(profile, "simulation");
// {
//   allowed: false,
//   operation: "simulation",
//   reason: "Profile is marked local_only, so remote AI providers are disabled.",
//   required_scopes: ["ai:use", "ai:simulation"],
//   missing_scopes: [],
//   redacted_fields: []
// }
```

Denial reasons (each one uses a fixed phrase so callers can string-match or parse):

- `"User consent is not granted."`
- `"Profile is marked local_only, so remote AI providers are disabled."`
- `"Required AI consent scopes are missing."`

### Sanitize before sending to a provider

```ts
import { sanitizeProfileForProvider } from "@pson5/privacy";

const { sanitized_profile, redacted_fields } = sanitizeProfileForProvider(profile);
// sanitized_profile: compact object with observed.*.facts filtered,
//   inferred traits flattened by domain, state transitions preserved but
//   state descriptions simplified, and a lean privacy block attached.
// redacted_fields: mirror of profile.privacy.restricted_fields for the caller
//   to record in its own audit.
```

### Filter AI-generated candidates

```ts
import { filterSensitiveProviderCandidates } from "@pson5/privacy";

const { allowed, removed_count } = filterSensitiveProviderCandidates(
  candidates,
  (c) => `${c.key} ${c.value}`
);
// Drops anything whose text matches the hardcoded sensitive keyword list:
//   "health", "mental", "medical", "relig", "politic",
//   "sexual", "race", "ethnic", "income", "debt"
```

### Export redaction

```ts
import { redactProfileForExport } from "@pson5/privacy";

const safe = redactProfileForExport(profile, "safe");
// - observed.*.facts: restricted_fields keys dropped
// - user_id: "redacted"
// - layers.inferred.ai_model: undefined
// - privacy.access_levels: {} (restricted_fields themselves still travel
//   so a downstream consumer can see which fields were filtered)

const full = redactProfileForExport(profile, "full");
// Returns the profile unchanged. Only admin callers should see this.
```

## Key concepts

- **Restricted fields are dot-path strings.** `profile.privacy.restricted_fields = ["layers.observed.core.facts.deadline_effect"]`. Sanitizers and exporters check exact matches, not globs, today.
- **Sanitize is for providers; redact is for export.** `sanitizeProfileForProvider` returns a lean object for LLM consumption. `redactProfileForExport` returns a full `PsonProfile` shape fit for writing back to disk or shipping to another system.
- **Sensitive-hint filtering is a regex-over-keywords safety net.** Do not rely on it alone for compliance. Source the real policy from `restricted_fields` on the profile.
- **Every decision is auditable.** The API layer records `redaction_applied`, `redaction_level`, and the missing-scope list in its jsonl access audit — all fields this package returns.

## Related docs

- [Privacy Model](../privacy/privacy-model.md) — design-level discussion of the layered policy.
- [Provider Engine](./provider-engine.md) — the caller that wraps provider requests in policy decisions.
- [Serialization Engine](./serialization-engine.md) — uses `redactProfileForExport` inside `exportProfile`.
- [Agent Context](./agent-context.md) — honors `restricted_fields` at projection time.
