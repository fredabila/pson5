# Privacy Model

## Purpose

This document defines the privacy, consent, and access model for PSON5.

## Core Principle

PSON5 should learn only what is necessary for the active use-case and only within the limits of explicit consent and policy.

## Privacy Objectives

- preserve user agency
- minimize unnecessary data capture
- separate identity from behavioral modeling
- enforce access limits across API, CLI, SDK, and exports
- make restricted inference visible and controllable

## Consent Model

Consent records must include:

- granted status
- scopes
- policy version
- timestamp
- source of consent

Example scopes:

- `core:read`
- `core:write`
- `education:read`
- `education:write`
- `simulation:run`
- `export:full`

## Access Levels

### Public

Low-risk fields suitable for broad product use.

### Private

Fields available only to authorized product logic or the user.

### Restricted

Fields requiring explicit higher-trust access and stronger justification.

## Restricted Inference Policy

By default, PSON5 must not infer sensitive traits unless all of the following are true:

- the deployment policy allows it
- the active domain explicitly supports it
- the user granted the necessary scope
- stored outputs are tagged as restricted

Sensitive inference categories should be configurable, but examples include:

- health conditions
- mental health status
- political beliefs
- sexuality
- religion
- highly sensitive financial vulnerability

## Data Separation Rules

- identity data belongs in a secure vault or tokenized identity layer
- behavioral data belongs in the graph/document model with access tags
- simulation output belongs in a separable layer and must not silently become fact

## Retention and Decay

Privacy policy should define:

- retention windows for raw answers
- retention windows for passive signals
- decay schedules for inferred claims
- hard delete workflow for user-requested erasure

## Redaction Rules

When caller scope is insufficient:

- restricted fields must be omitted or masked
- reasoning traces must not cite blocked evidence
- export should apply the selected redaction profile

Redaction must be explicit. Silent failure is not acceptable if it obscures policy behavior.

## Local-Only Mode

When `local_only=true`:

- no cloud persistence is allowed
- remote simulation helpers must be disabled unless explicitly approved by policy
- exports remain possible to local storage

## Audit Requirements

The system should log:

- who accessed a profile
- which scopes were evaluated
- whether redaction occurred
- whether a restricted operation was denied

Audit logs must avoid storing unnecessary raw sensitive data.

## User Rights Model

PSON5 should support:

- inspect data
- inspect inferred traits
- inspect reasoning for predictions
- correct profile facts
- revoke consent
- export profile
- request deletion subject to deployment policy

## Operational Rules

- privacy enforcement must happen server-side, not just in clients
- every export must declare the redaction level used
- every restricted field must carry an access tag
- policy changes must not retroactively broaden exposure without re-evaluation

## Minimum Implementation Deliverables

- scope evaluation module
- field access tagging model
- redaction utility
- consent persistence model
- export redaction profiles
- privacy integration tests

## Current Implementation Status

The current codebase now includes:

- provider scope evaluation for `ai:use`, `ai:modeling`, and `ai:simulation`
- provider denial when `local_only=true`
- provider payload redaction based on `privacy.restricted_fields`
- filtering of obvious sensitive AI-generated candidates before they are stored
- provider audit logs in `.pson5-store/audit/provider.jsonl`
- API access audit logs in `.pson5-store/audit/api-access.jsonl`
- `safe` export redaction for profile sharing
- optional API key auth at the API boundary
- optional tenant-bound profile access
- optional caller identity, subject-user binding, and route-level role/scope authorization in the API
- optional signed JWT identity for caller, tenant, subject user, role, and scopes
- optional asymmetric JWT verification through a PEM public key or JWKS
- optional remote JWKS lookup with in-process cache refresh

Still missing:

- export redaction profiles
- field-level access tags applied across all model outputs
- production-grade remote JWKS rotation strategy and external trust-provider integration
