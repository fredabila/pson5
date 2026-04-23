# Agent Integration

## Purpose

This document explains how AI agents should integrate with PSON5 and what role PSON5 plays in the agent stack.

## Current Integration Model

Today, PSON5 is best understood as:

- a structured personalization memory
- a rules-first inference layer with optional OpenAI augmentation
- a simulation and explainability layer
- an agent-context projection layer for safe, relevance-filtered agent consumption

It is not yet:

- an autonomous reasoning model
- an LLM orchestration framework
- a replacement for Claude or OpenAI

## Why A Skill File Matters

An agent will not reliably infer the right PSON operating pattern just because the SDK exists.

So yes: a PSON skill or tool contract is strongly recommended.

The skill should teach the agent to:

- use `getAgentContext(...)` by default
- use `getNextQuestions(...)` only when uncertainty matters
- store answers through `learn(...)`
- treat simulation as probabilistic support
- avoid reading the full raw profile unless explicitly required

Reference:

- [pson-agent-skill.md](/C:/Users/user/pson5/docs/usage/pson-agent-skill.md)
- [skills/pson-agent/SKILL.md](/C:/Users/user/pson5/skills/pson-agent/SKILL.md)
- [agent-tools.md](/C:/Users/user/pson5/docs/usage/agent-tools.md)
- [agent-auth.md](/C:/Users/user/pson5/docs/usage/agent-auth.md)

## Agent Pattern

Recommended current pattern:

`User -> Agent -> PSON5 SDK/API -> Profile / Simulation -> Agent Response`

The agent should:

1. load the profile
2. use the agent-context projection for bounded personalization context
3. inspect or update the profile via learning flows
4. run simulation for scenario support
5. use PSON5 outputs as bounded context, not as absolute truth

## Example Agent Usage

An agent can:

- initialize a profile for a new user
- fetch the next question to reduce uncertainty
- submit an answer from user input
- read a filtered agent context
- ask PSON5 for a likely response tendency
- inspect structural support before using a prediction in an answer

## Runtime Boundaries

Use the transport that matches where the agent actually lives:

- direct SDK when the agent runs in your backend or worker
- HTTP tools when the agent runs remotely
- MCP over HTTP when the framework expects MCP-style JSON-RPC
- local stdio MCP when the agent runs on the same machine

PSON does not require one transport. It provides a shared tool contract across those boundaries.

## Important Safety Rule

An agent should distinguish:

- direct user facts
- system inferences
- simulation predictions

PSON5 preserves this split explicitly. Agents should not collapse them in downstream prompts or UI.

## Current Best Use Cases

- personalization memory for an agent
- explainable user modeling
- scenario prediction support
- domain-specific profiling for education/productivity prototypes

## Current Non-Ideal Use Cases

- high-stakes autonomous decisioning
- production personalization at scale
- sensitive-trait inference
- long-horizon behavioral forecasting with real accountability

## How LLMs Should Fit

The right direction is:

- PSON5 stores structured personalization state
- OpenAI or Claude performs language reasoning
- PSON5 constrains the personalization context and stores results in structured form
- acquisition domains are configurable, so products can register their own question modules instead of relying only on built-in ones
- free-form user answers can now be normalized into structured choices during learning when the provider is configured

That means agent integration should use:

1. PSON5 for profile retrieval, agent-context projection, and simulation
2. the current OpenAI provider adapter when configured
3. prompt construction that only exposes allowed profile fields
4. post-processing that validates generated outputs before writing anything back

## Where The LLM Actually Lives Today

The SDK itself does not instantiate or own the model runtime.

Today:

- the SDK orchestrates profile, learning, simulation, and projection calls
- the provider engine is the optional bridge to OpenAI or Anthropic
- provider-backed cognition only happens when provider config exists and policy permits it

That provider path lives in:

- [packages/provider-engine/src/index.ts](/C:/Users/user/pson5/packages/provider-engine/src/index.ts)

## What Is Missing Before Deeper Agent Integration

- deeper provider-led acquisition and writeback control
- prompt and tool contracts for profile-aware generation
- privacy-aware prompt filtering
- writeback validation for model-generated profile updates
- audit logging around model usage
