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

## What Is Missing Before Deeper Agent Integration

- Claude provider support
- prompt and tool contracts for profile-aware generation
- privacy-aware prompt filtering
- writeback validation for model-generated profile updates
- audit logging around model usage
