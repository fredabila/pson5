---
name: pson-agent
description: Use when an AI agent needs user-specific personalization through PSON5 — collect user signal, store it structured, project it agent-safely, simulate likely behavior, or plug in any model. The skill also contains setup instructions so an agent can install and operate PSON5 end-to-end without touching application code. Works against the SDK, the HTTP API, the CLI, or MCP (stdio or HTTP).
---

# PSON Agent Skill

**Use this skill** when you need to personalize behavior for a specific end-user and want that personalization to be structured, explainable, portable, and safe for another agent to consume later.

**Don't use this skill** for one-shot chat memory, short ephemeral context, or situations where a raw JSON blob is already sufficient.

## What PSON5 is (one paragraph)

PSON5 is an open standard and infrastructure for cognitive user profiles. It keeps what the user said, what the model inferred, and what the simulator predicts as three separate things — so you can plan, explain, and fail gracefully on top of them. The pipeline is: **Acquisition → Modeling → State → Graph → Simulation → Projection**. The full source, demos, and docs live at [github.com/fredabila/pson5](https://github.com/fredabila/pson5).

## The core invariant — this is non-negotiable

Keep these three layers separate. Always.

- `observed` — direct user facts and normalized answers (written by acquisition only)
- `inferred` — modeled traits, heuristics, and states with confidence + decay
- `simulated` — scenario-specific predictions, never durable facts

Never collapse them in prompts, UI, or downstream outputs. When you cite a trait's value, name the layer it came from. When a simulation predicts behavior, tell the user it's a hypothesis.

## Default read rule

Do **not** read the raw `.pson` profile by default. Always prefer the projection: `pson_get_agent_context`. It is relevance-ranked against an intent you pass in, confidence-filtered, redaction-aware, and consent-gated. Every filtered field is surfaced in a `redaction_notes` array — branch on `reason` codes instead of silently falling back.

## Two workflows — pick the right one

### Registry mode — when you have or want pre-written questions

Use when the product already has a domain module registered (see `<store>/config/domains.json`) or when the set of questions is short, sensitive, and needs human authorship.

1. `pson_load_profile_by_user_id` to resolve the profile
2. `pson_get_agent_context` for the current state
3. Respond using the projection; if uncertainty matters, ask `pson_get_next_questions`
4. Pose the prompt verbatim to the user
5. `pson_learn` with their answer (runs the full pipeline atomically)
6. Recompute `pson_get_agent_context` before the next turn

### Generative / zero-registry mode — when you only have a description

Use when onboarding a new vertical, a new customer, or a new topic. **PSON5 does not need any pre-written questions.** Hand it a one-paragraph domain brief and Claude (or any configured model) invents every question adaptively.

1. Compose a **domain brief**: an id, title, one-paragraph description, 5–10 `target_areas`, a sensitivity level, and an optional `max_questions` cap. See [reference/domain-briefs.md](reference/domain-briefs.md) for composition rules.
2. `openGenerativeSession(profile_id)` to start an empty session with no candidates
3. Loop:
   - `deriveGenerativeQuestions({ profile, brief, strategy, session_state })` returns net-new questions
   - Respect `stop === true` / `stop_reason` — the engine decides when the brief is saturated
   - `appendGeneratedQuestions(session_id, questions)` to make them resolvable
   - Pose each question to the user
   - `pson_learn` with the answer
4. Cycle the `strategy` hint as the session matures:
   - `broad_scan` for the first 4–6 turns
   - `depth_focus` in the middle
   - `contradiction_probe` when `session.contradiction_flags` is non-empty
   - `follow_up` when an answer opened a rabbit hole

See [examples/generative-loop.ts](examples/generative-loop.ts) for a full working loop. See [the live demo](https://github.com/fredabila/pson5/tree/main/examples/claude-driven-persona) for an end-to-end run where both the questions and the user's answers come from Claude.

## Stop conditions

Stop asking when any of these is true:

- `session.stop_reason !== null`
- `session.confidence_gaps.length === 0` for the active domains
- `session.fatigue_score >= 0.78` and `confidence_gaps.length <= 1`
- The user explicitly declines to continue

Respect the engine's stop signal. Do not keep asking because you want to be thorough.

## Question handling

- Ask the returned `prompt` **verbatim** unless you have a clear reason to rewrite it. If you rewrite, set `generated_by: "provider"` / `generation_rationale` so the audit stays honest.
- If the question carries `answer_style_hint`, follow it.
- `source_question_id` is the canonical target — the id you send to `pson_learn` can be the follow-up id; PSON5 resolves both back to the same observed-fact writeback path.
- Respect `fatigue_score`, `confidence_gaps`, and `contradiction_flags` from `session_state`.

## Simulation output

A simulation result carries `prediction`, `confidence`, `reasoning[]`, `evidence[]`, `caveats[]`, `alternatives[]`, `provider.mode`. Use `reasoning` and `evidence` in your follow-up messages; let the user see what drove the prediction. Use `caveats` to hedge. **Never** promote a simulated prediction to a fact in downstream UI or API responses.

## Safe prompting

When you construct an LLM prompt from PSON5 output:

- Prefer `personal_data` entries from the agent context
- Keep `observed`, `inferred`, `simulated` items labelled in the prompt
- Include confidence where it affects agent behavior
- Do **not** include restricted fields, provider config, audit logs, or raw answer history unless you have an explicit reason
- Do **not** promote a `simulated` prediction to a fact

See [reference/safe-prompting.md](reference/safe-prompting.md) for templates and examples.

## Provider / model neutrality

PSON5 ships three built-in adapters — `openai`, `anthropic`, `openai-compatible` (Ollama, vLLM, LiteLLM, Groq, Together, etc.) — and `registerProviderAdapter(...)` for custom ones. Your agent code never cares which adapter is selected; it calls the same seven tools. If `pson_get_provider_policy` returns `{ allowed: false }`, fall back to rule-based behavior.

Stable denial reasons:

- `"User consent is not granted."`
- `"Profile is marked local_only, so remote AI providers are disabled."`
- `"Required AI consent scopes are missing."`
- `"Provider is not configured."`
- `"Provider integration is disabled."`
- `"Provider adapter '<name>' is not registered."`

See [reference/providers.md](reference/providers.md) for env-var setup.

## Never expose raw profile mutation as a tool

All writes go through `pson_learn`, which enforces the pipeline (modeling → state → graph → save) and the audit. Do not build custom tools that bypass it.

## Multi-tenancy

Treat `user_id` as your application's stable identity key. Treat `profile_id` as PSON5's internal record id. If your deployment is multi-tenant:

- Always pass `x-pson-tenant-id` (HTTP) or `tenant_id` (SDK) on every call
- The API enforces tenant binding; cross-tenant reads return `tenant_mismatch`
- Subject-user binding (`x-pson-user-id` or JWT `user_id` claim) scopes the caller to one end-user's profiles

## Setup

If you've just been given this skill and PSON5 isn't installed yet, follow **[setup.md](setup.md)**. It takes you from `git clone` to a running demo in about 10 minutes and covers: install, provider keys, running the zero-registry demo, optional Neo4j.

## Reference (skill-local)

Everything below is in this directory — relative links work regardless of where the skill is installed.

- **[setup.md](setup.md)** — zero-to-running walkthrough
- **[reference/transports.md](reference/transports.md)** — SDK · API · CLI · MCP side-by-side
- **[reference/tools.md](reference/tools.md)** — the seven tools with full request/response shapes
- **[reference/domain-briefs.md](reference/domain-briefs.md)** — how to compose good briefs for generative mode
- **[reference/providers.md](reference/providers.md)** — provider selection, env vars, custom adapters
- **[reference/neo4j.md](reference/neo4j.md)** — optional graph mirror (one-command local, Aura free, or zero-infra)
- **[reference/safe-prompting.md](reference/safe-prompting.md)** — prompt-construction rules
- **[examples/quickstart.ts](examples/quickstart.ts)** — four-line starter
- **[examples/generative-loop.ts](examples/generative-loop.ts)** — zero-registry flow in <80 lines
- **[examples/agent-loop.ts](examples/agent-loop.ts)** — a full agent turn using the seven tools

## External references

Canonical sources that this skill shadows. When the skill and the repo disagree, the repo wins — check there for the authoritative word.

- Repo: [github.com/fredabila/pson5](https://github.com/fredabila/pson5)
- Quickstart: [docs/usage/quickstart.md](https://github.com/fredabila/pson5/blob/main/docs/usage/quickstart.md)
- Agent integration: [docs/usage/agent-integration.md](https://github.com/fredabila/pson5/blob/main/docs/usage/agent-integration.md)
- Agent tools: [docs/usage/agent-tools.md](https://github.com/fredabila/pson5/blob/main/docs/usage/agent-tools.md)
- Agent context: [docs/usage/agent-context.md](https://github.com/fredabila/pson5/blob/main/docs/usage/agent-context.md)
- Provider adapters: [docs/usage/provider-adapters.md](https://github.com/fredabila/pson5/blob/main/docs/usage/provider-adapters.md)
- Privacy model: [docs/privacy/privacy-model.md](https://github.com/fredabila/pson5/blob/main/docs/privacy/privacy-model.md)
- API contract: [docs/api/api-contract.md](https://github.com/fredabila/pson5/blob/main/docs/api/api-contract.md)
- PSON5 scope (the constitution): [PSON5_SCOPE.md](https://github.com/fredabila/pson5/blob/main/PSON5_SCOPE.md)

## Limits

- PSON5 is **not** an LLM. The provider layer is optional. PSON5 owns storage, acquisition, modeling, state, graph, simulation, projection, privacy, and audit.
- PSON5 does **not** personalize your agent's behavior for you. It gives you a structured surface; your agent decides what to do with it.
- PSON5 does **not** guarantee correct prediction. Every inferred and simulated value carries caveats — use them.
