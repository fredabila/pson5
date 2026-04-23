# PSON Agent Skill

## Purpose

This document defines the standard operating pattern an agent should follow when using PSON5.

It is the practical bridge between:

- the SDK
- the API
- the agent-context projection
- adaptive acquisition
- simulation

## Why A Skill Helps

An agent will not infer the correct PSON usage pattern automatically just because the SDK exists.

Without a stable skill or tool contract, agents tend to:

- read too much raw profile data
- skip the agent-context layer
- treat predictions as facts
- write arbitrary data back instead of using `learn(...)`
- ask unnecessary questions

So yes: a skill file is strongly recommended.

## What The Skill Should Teach

The agent should learn these rules:

1. Resolve the user profile through `user_id` or `profile_id`.
2. Use `getAgentContext(...)` by default.
3. Ask the next question only when uncertainty matters.
4. Submit answers with `learn(...)`.
5. Use simulation as a bounded prediction layer.
6. Respect confidence, privacy, and policy constraints.

## Default Tool Set

Recommended tool names:

- `pson_load_profile_by_user_id`
- `pson_create_profile`
- `pson_get_agent_context`
- `pson_get_next_questions`
- `pson_learn`
- `pson_simulate`
- `pson_get_provider_policy`

These are shown in working form in:

- [examples/agent-tools/pson-sdk-tools.ts](/C:/Users/user/pson5/examples/agent-tools/pson-sdk-tools.ts)

## Canonical Agent Flow

```text
User -> Agent -> PSON tools -> PSON profile/session/context -> Agent reply
```

Recommended sequence:

1. `loadProfileByUserId(...)`
2. `getAgentContext(...)`
3. answer or plan using that context
4. if important uncertainty remains: `getNextQuestions(...)`
5. ask the user the question naturally
6. `learn(...)`
7. refresh `getAgentContext(...)`
8. optionally `simulate(...)`

## Where The LLM Actually Sits

PSON5 is not itself the language model.

Current reality:

- the SDK is an orchestration layer
- the provider engine is the optional LLM bridge
- the acquisition/modeling/simulation packages implement shared behavior
- provider-backed cognition only runs when provider config exists and policy allows it

So if you did not see the SDK instantiating an LLM directly, that is because it does not.

The LLM path currently lives behind:

- [packages/provider-engine/src/index.ts](/C:/Users/user/pson5/packages/provider-engine/src/index.ts)

## Cloud Use

In cloud environments:

- run the SDK inside your backend or agent runtime
- back it with a storage adapter
- expose tool wrappers or HTTP routes to agents

Do not put the SDK directly in the browser as the primary data/runtime boundary.

## Current Honest Assessment

PSON5 is promising as a personalization architecture because it:

- separates observed, inferred, simulated, and projected data
- adds a real agent-safe context layer
- supports configurable domains
- has a credible path from local to cloud storage

But today it is still an early platform, not a proven standard at scale.

So the right claim is:

PSON5 has breakthrough potential in personalization infrastructure, but it is not yet a proven industry breakthrough in deployment reality.

## Related Files

- [skills/pson-agent/SKILL.md](/C:/Users/user/pson5/skills/pson-agent/SKILL.md)
- [docs/usage/agent-integration.md](/C:/Users/user/pson5/docs/usage/agent-integration.md)
- [docs/usage/sdk-usage.md](/C:/Users/user/pson5/docs/usage/sdk-usage.md)
- [docs/usage/agent-context.md](/C:/Users/user/pson5/docs/usage/agent-context.md)
