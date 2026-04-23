# Safe prompting — constructing LLM prompts from PSON5 output

When your agent constructs a prompt using PSON5 data, follow these rules. They prevent silent privacy violations, keep the observed/inferred/simulated boundary intact, and make your prompts shorter and more effective.

## Rule 1 — use the agent context, not the raw profile

**Do:** `pson_get_agent_context` with a specific `intent`, pass the response into your prompt template.

**Don't:** `pson_load_profile_by_user_id` and dump the whole profile into the prompt.

The agent context is already relevance-ranked, confidence-filtered, redaction-aware, and consent-gated. The raw profile contains audit history, restricted fields, provider config, and the raw `answers` object — none of which belong in a prompt.

## Rule 2 — label each entry by its layer

Every `AgentContextEntry` has a `source` field: `"observed" | "inferred" | "simulation"`. Preserve that labelling in the prompt:

```
USER FACTS (observed, user said):
- planning_style = "structured"   (confidence 1.0)
- deadline_effect = "helps focus" (confidence 1.0)

USER MODEL (inferred, model derived with decay):
- motivated-when-clear-urgency (confidence 0.74, evidence: 2 answers)
- deadline_driven_activation   (confidence 0.78)

PREDICTED BEHAVIOR (simulated, hypothesis only):
- delayed_start (confidence 0.72 — do NOT present as fact)
```

The LLM will weight each section correctly when they're labelled. Without labels, it'll flatten inference into fact.

## Rule 3 — honor `redaction_notes`

If the context has `redaction_notes`, respect them. Don't invent a value to fill the gap. Tell the agent the field was filtered and why:

```
(One preference field was withheld — reason: restricted_field. The user's privacy
settings exclude it from the projection. Work around it.)
```

Reason codes:

- `restricted_field` — the user's profile explicitly excludes it
- `low_confidence` — evidence is too thin to cite
- `consent_not_granted` — the entire projection is empty; work without user data
- `local_only` — the profile is local-only and this field can't leave

## Rule 4 — never promote `simulated` to fact

If a simulation says `"delayed_start"`, the prompt should read *"the system predicts a delayed start"* — never *"the user will delay"*. Downstream responses must preserve this framing. If the user asks "will I procrastinate?", the safe answer is "the profile's prediction is X, with confidence Y, based on Z — here's what could move it".

## Rule 5 — include confidence where it affects behavior

For traits the agent plans against (e.g. "always explain in summary form"), include the confidence. A 0.95 confidence entry can drive deterministic behavior; a 0.62 entry should prompt the agent to ask a clarifying question instead of acting.

## Rule 6 — reasoning goes in the prompt, reasoning stays out of the user-facing response

When the agent calls `pson_simulate`, the response includes `reasoning[]`, `evidence[]`, `caveats[]`. Use them to construct the agent's internal prompt ("here's why you're proposing X"), but don't leak internal trait ids into the user-facing response unless asked. "You seem to prefer direct explanations" is fine; "trait:core:explanation_preference=direct with confidence 0.78" is not.

## Rule 7 — don't include audit or provider metadata in prompts

Avoid:

- provider config (`provider`, `model`, `base_url`, API keys)
- audit ids (`source_id`, `request_id`, `generated_at` timestamps)
- raw `answers` history
- `profile_id` internals in user-facing text (the user knows who they are)

These are internal bookkeeping. They pollute the prompt without adding decision value.

## Prompt templates

### For a recommendation agent

```
You are helping {{user_name}} with: {{user_intent}}.

You know the following about them:

## What they told you
{{for each entry in personal_data.preferences where source=="observed":}}
- {{entry.key}} = {{entry.value}}

## What we've inferred (use with care — every inference has a confidence)
{{for each entry in personal_data.behavioral_patterns where source=="inferred":}}
- {{entry.key}} = {{entry.value}} (confidence {{entry.confidence}})

## Predicted behavior for this situation (hypothesis only)
{{for each entry in personal_data.predictions:}}
- {{entry.value}} — do not state this as fact to the user

## Constraints we must respect
- Restricted fields: {{agent_context.constraints.restricted_fields}}
- Redacted entries: {{len(agent_context.redaction_notes)}} ({{they are: ...}})

Now {{do the task}}. When you refer to what you know about them, say "you told me"
for observed facts and "I get the sense that" or "based on what I've seen so far"
for inferences. Don't present predictions as statements of fact.
```

### For a question-asking agent

```
You're about to ask {{user_name}} one question to close a confidence gap.

The gap we're closing: {{question.information_targets}}
The confidence gap reason: {{question.generation_rationale}}

Here's the exact question to ask:
  "{{question.prompt}}"

{{if question.answer_style_hint:}}
  Answer style: {{question.answer_style_hint}}

{{if question.choices:}}
  The user should pick one of:
  {{for each choice in question.choices:}}
  - {{choice.label}} (system value: {{choice.value}})

Ask the question verbatim. After they answer, call pson_learn with their response.
```

## Anti-patterns

### ❌ Don't

```
You are helping a user. Here is everything I know about them:
{{dump full profile.layers.observed + profile.layers.inferred + profile.layers.simulated + profile.privacy + profile.metadata}}
```

This leaks restricted fields, confuses layers, blows up the context window, and misrepresents simulations as facts.

### ❌ Don't

```
"The user is delayed_start."
"The user has deadline_driven_activation."
```

Inferences aren't identities. They're hypotheses with confidence. Use verbs like "tends to", "seems to", "based on what we've seen so far" — not copulas.

### ❌ Don't

```
"Since you mentioned your family history of anxiety..."
```

If `family_history` was in `privacy.restricted_fields`, you shouldn't have seen it, and if you did leak it from the raw profile, rotating the boundary won't save you.

### ✓ Do

```
"You told me you prefer structured plans, and I've noticed you start tasks quickly.
The model thinks deadlines sharpen rather than stress you — though that's an inference
I haven't watched long enough to be sure about. Do you want me to lock in the plan
I'm proposing, or leave room to adjust?"
```

## Related

- [../SKILL.md](../SKILL.md) — the full behavioral contract
- [tools.md](tools.md) — `pson_get_agent_context` and the `redaction_notes` / `reasoning_policy` fields
- [github.com/pson5/pson5 · docs/usage/agent-context.md](https://github.com/pson5/pson5/blob/main/docs/usage/agent-context.md)
