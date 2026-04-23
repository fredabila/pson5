---
name: pson-agent
description: Use when an AI agent needs to personalize behavior with PSON5 profiles, ask adaptive user questions, store structured answers, retrieve agent-safe context, or simulate likely user behavior through the PSON5 SDK or API.
---

# PSON Agent Skill

Use this skill when an agent needs user-specific personalization through PSON5.

## Default Rule

Do not read the full raw `.pson` profile by default.

Use the PSON agent-context projection first.

## Runtime Choice

- If the agent runs inside the same backend/service as PSON5, use the SDK.
- If the agent runs remotely or in another runtime, use the HTTP API.
- Do not use the browser as the primary PSON runtime.

## Required Concepts

- `observed`: direct user facts or normalized answers
- `inferred`: modeled traits and heuristics
- `simulated`: predictions, not facts
- `agent-context`: filtered personalization view for agent consumption

Never collapse these categories together in prompts or UI.

## Core Workflow

1. Resolve the user profile.
2. Get agent context.
3. Respond using that bounded context.
4. If important uncertainty remains, ask PSON for the next question.
5. Ask the user naturally.
6. Write the answer back through learning.
7. Recompute agent context.
8. Simulate when behavior-sensitive planning matters.

## Tool Pattern

Expose PSON operations as tools with names similar to:

- `pson_load_profile_by_user_id`
- `pson_create_profile`
- `pson_get_agent_context`
- `pson_get_next_questions`
- `pson_learn`
- `pson_simulate`
- `pson_get_provider_policy`

Do not expose raw profile mutation as a tool.

## Behavioral Rules

- Use `getAgentContext(...)` for normal personalization.
- Use `getNextQuestions(...)` only when uncertainty matters.
- Use `learn(...)` to store user answers.
- Use `simulate(...)` as probabilistic support, not truth.
- If the returned provider policy blocks modeling or simulation, continue with rules-based behavior.

## Question Handling

- Ask the returned question naturally.
- If `answer_style_hint` exists, follow it.
- If the question is provider-generated, it is still mapped to an approved profile target underneath.
- Respect `stop_reason`, `fatigue_score`, `confidence_gaps`, and `contradiction_flags` from the learning session when deciding whether to ask more.

## Safe Prompting

When constructing an LLM prompt from PSON:

- prefer agent-context items
- keep observed, inferred, and simulated items labeled
- include confidence where relevant
- do not include restricted fields
- do not dump provider config, audit logs, or raw answer history unless explicitly needed

## Cloud Guidance

- Run the SDK in your backend with a storage adapter.
- Use the API for remote or browser-based clients.
- Treat `user_id` as your app's stable identity key.
- Treat `profile_id` as PSON's internal record id.

## Important Limitation

PSON5 is not itself the LLM.

The provider layer is optional and external. PSON constrains storage, acquisition, simulation, and projection. The connected model performs language reasoning when configured.
