# The seven PSON5 tools

Every transport (SDK, HTTP, MCP) exposes the same seven tools. They're defined in one place — `@pson5/sdk/src/agent-tools.ts` — and re-exported with identical request/response shapes from each surface.

Canonical source: [packages/sdk/src/agent-tools.ts](https://github.com/fredabila/pson5/blob/main/packages/sdk/src/agent-tools.ts)

## Tool index

| Tool | Role · scopes | Writes? |
| --- | --- | --- |
| [`pson_load_profile_by_user_id`](#pson_load_profile_by_user_id) | viewer · `profiles:read` | no |
| [`pson_create_profile`](#pson_create_profile) | editor · `profiles:write` | yes |
| [`pson_get_agent_context`](#pson_get_agent_context) | viewer · `profiles:read`, `agent-context:read` | no |
| [`pson_get_next_questions`](#pson_get_next_questions) | editor · `profiles:write` | session only |
| [`pson_learn`](#pson_learn) | editor · `profiles:write` | yes (full pipeline) |
| [`pson_simulate`](#pson_simulate) | editor · `profiles:write`, `simulation:run` | cache only |
| [`pson_get_provider_policy`](#pson_get_provider_policy) | viewer · `profiles:read` | no |

---

## `pson_load_profile_by_user_id`

Resolve the latest profile for a known application user id.

**Request**
```json
{ "user_id": "user_123" }
```

**Response** — the full `PsonProfile`. Non-admin callers receive a `safe`-redacted variant: observed facts listed in `privacy.restricted_fields` are stripped, `layers.inferred.ai_model` is dropped, `user_id` is anonymised to `"redacted"`.

---

## `pson_create_profile`

Create a new profile shell.

**Request**
```json
{
  "user_id": "user_123",
  "tenant_id": "tenant_acme",
  "domains": ["core"],
  "depth": "light"
}
```

`depth` is one of `"light" | "standard" | "deep"`. Domains default to `["core"]`.

**Response** — the full freshly-created `PsonProfile` with `revision: 1`.

---

## `pson_get_agent_context`

Return the agent-safe projection for a profile. **This is the read path you should use by default.**

**Request**
```json
{
  "profile_id": "pson_123",
  "intent": "help the user plan a deadline-sensitive task",
  "domains": ["core", "education"],
  "max_items": 6,
  "include_predictions": true,
  "min_confidence": 0.6,
  "task_context": { "task": "exam prep", "deadline_days": 2 }
}
```

**Response** — `PsonAgentContext`:

```jsonc
{
  "profile_id": "pson_123",
  "pson_version": "5.0",
  "context_version": "1.0",
  "intent": "help the user plan a deadline-sensitive task",
  "generated_at": "2026-04-23T08:00:00.000Z",
  "personal_data": {
    "preferences": [
      { "key": "planning_style", "value": "structured", "domain": "core",
        "category": "preferences", "source": "observed",
        "confidence": 0.95, "relevance": 0.65, "rationale": "Directly observed user fact." }
    ],
    "communication_style": [ /* ... */ ],
    "behavioral_patterns": [ /* ... */ ],
    "learning_profile": [ /* ... */ ],
    "current_state": [ /* ... */ ],
    "predictions": [ /* ... */ ]
  },
  "constraints": {
    "restricted_fields": [],
    "local_only": false,
    "allowed_for_agent": ["layers.observed", "layers.inferred", ...]
  },
  "reasoning_policy": {
    "treat_as_fact": ["personal_data.preferences", "personal_data.communication_style"],
    "treat_as_inference": ["personal_data.behavioral_patterns", "personal_data.learning_profile", "personal_data.current_state"],
    "treat_as_prediction": ["personal_data.predictions"]
  },
  "redaction_notes": [
    {
      "path": "layers.observed.core.facts.health_condition",
      "reason": "restricted_field",
      "category": "behavioral_patterns",
      "detail": "Field is listed in profile.privacy.restricted_fields."
    }
  ]
}
```

Reason codes: `restricted_field`, `low_confidence`, `consent_not_granted`, `local_only`. When `consent.granted === false`, `personal_data` is empty and `redaction_notes` contains a single `consent_not_granted` entry.

---

## `pson_get_next_questions`

Ask PSON5 to choose the next adaptive question(s). In registry mode (domain module is loaded), this picks from the candidate set; in generative mode (no registry), use the generative helper — see [../reference/domain-briefs.md](domain-briefs.md).

**Request**
```json
{
  "profile_id": "pson_123",
  "session_id": "learn_1776913414584",
  "domains": ["core", "education"],
  "depth": "standard",
  "limit": 1
}
```

Omit `session_id` to open a new session.

**Response**
```jsonc
{
  "session_id": "learn_...",
  "session": {
    "session_id": "learn_...",
    "profile_id": "pson_123",
    "domains": ["core"],
    "depth": "standard",
    "asked_question_ids": [...],
    "answered_question_ids": [...],
    "generated_questions": [...],
    "contradiction_flags": [],
    "confidence_gaps": ["deadline_effect", "learning_mode"],
    "fatigue_score": 0.12,
    "stop_reason": null,
    "status": "active",
    "created_at": "...",
    "updated_at": "..."
  },
  "questions": [
    {
      "id": "core_deadline_effect",
      "domain": "core",
      "prompt": "How do deadlines affect you? ...",
      "type": "single_choice",
      "depth": "deep",
      "sensitivity": "low",
      "information_targets": ["deadline_effect"],
      "choices": [
        { "value": "helps_focus", "label": "Helps me focus" },
        { "value": "causes_stress", "label": "Stresses me" },
        { "value": "mixed", "label": "Both" }
      ],
      "generated_by": "provider",
      "answer_style_hint": "...",
      "generation_rationale": "..."
    }
  ]
}
```

`session.stop_reason` being set means **stop asking**. Don't try to be thorough.

---

## `pson_learn`

Persist one or more answers. Runs the full pipeline: modeling → state → graph → save, atomically. Revision bumps by one.

**Request**
```json
{
  "profile_id": "pson_123",
  "session_id": "learn_1776913414584",
  "domains": ["core"],
  "depth": "standard",
  "answers": [
    { "question_id": "core_deadline_effect", "value": "mixed" }
  ],
  "options": {
    "return_next_questions": true,
    "next_question_limit": 1
  }
}
```

`answers[].value` can be a string, number, boolean, or string array — PSON5 normalizes to the question's `choices` when `type === "single_choice"` (free text goes through the provider's `normalizeAnswerWithProvider` when configured).

**Response**
```jsonc
{
  "session": { /* updated LearningSessionState */ },
  "profile": { /* updated PsonProfile */ },
  "updated_fields": [
    "layers.observed.core.answers.core_deadline_effect",
    "layers.observed.core.facts",
    "layers.inferred.core",
    "state_model",
    "knowledge_graph"
  ],
  "next_questions": [ /* QuestionDefinition[] if return_next_questions */ ]
}
```

If a new answer **contradicts** an existing observed fact for the same `information_target`, a contradiction flag is recorded in `session.contradiction_flags` — the new value still wins, but the conflict is logged so your agent can surface it.

---

## `pson_simulate`

Predict likely user behavior under a scenario. Rule-based by default, augmented by the provider when configured and policy-allowed.

**Request**
```json
{
  "profile_id": "pson_123",
  "context": {
    "task": "study for exam",
    "deadline_days": 2,
    "difficulty": "high"
  },
  "domains": ["core", "education"],
  "options": {
    "include_reasoning": true,
    "include_evidence": true,
    "explanation_level": "standard",
    "scenario_label": "exam_preparation_under_pressure"
  }
}
```

**Response**
```jsonc
{
  "prediction": "delayed_start",
  "confidence": 0.72,
  "reasoning": [
    "Observed task_start_pattern = delay_start",
    "Inferred heuristic: deadline_driven_activation"
  ],
  "evidence": [{ "source_type": "answer", "source_id": "answer_...", "weight": 1 }],
  "caveats": ["Limited exam-specific evidence."],
  "alternatives": ["compressed_preparation"],
  "context_hash": "ab12cd34…",
  "cached": false,
  "provider": { "mode": "hybrid", "provider": "anthropic", "model": "claude-haiku-..." }
}
```

`provider.mode` is `"rules"` when no model ran, `"hybrid"` when both rules and provider contributed. **Never** promote `prediction` to a fact in downstream UI.

---

## `pson_get_provider_policy`

Is provider-backed augmentation allowed for this profile and this operation?

**Request**
```json
{ "profile_id": "pson_123", "operation": "simulation" }
```

`operation` is `"modeling" | "simulation"`.

**Response**
```jsonc
{
  "allowed": false,
  "operation": "simulation",
  "reason": "Profile is marked local_only, so remote AI providers are disabled.",
  "required_scopes": ["ai:use", "ai:simulation"],
  "missing_scopes": [],
  "redacted_fields": [],
  "provider_status": {
    "configured": true,
    "provider": "anthropic",
    "model": "claude-haiku-4-5-20251001",
    "source": "env",
    "enabled": true,
    "capabilities": ["modeling", "simulation", "structured_json"]
  }
}
```

When `allowed: false`, fall back to rule-based behavior. The `reason` string is stable and safe to match against.

## Transport notes

- **SDK (in-process):** `const executor = createPsonAgentToolExecutor(client, storeOptions); await executor.execute({ name, arguments })`
- **HTTP:** `POST /v1/pson/tools/execute` with `{ name, arguments }` body. Standard auth headers (API key / JWT / tenant / caller) apply.
- **MCP (stdio or /v1/mcp):** `tools/call` JSON-RPC method, same `{ name, arguments }` shape.

See [transports.md](transports.md) for when to use which.
