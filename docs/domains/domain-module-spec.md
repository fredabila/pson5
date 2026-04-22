# Domain Module Specification

## Purpose

This document defines how optional domains extend the PSON5 core without breaking portability or privacy guarantees.

## Domain Model

PSON5 uses:

`core + optional domain modules`

The core domain is always active. Optional domains add schema, questions, modeling rules, and simulation relevance for a specific product context.

Examples:

- `education`
- `productivity`
- `finance`
- `health`
- `social`
- `developer_custom:<name>`

## Domain Module Contract

Every module must provide:

- stable domain id
- version
- summary
- supported depth levels
- sensitivity classification
- schema fragment
- question definitions
- normalization rules
- inference hooks
- simulation hooks
- access policy tags

## Example Manifest

```json
{
  "domain": "education",
  "version": "1.0.0",
  "summary": "Learns study behavior, comprehension patterns, and exam response tendencies.",
  "depth_levels": ["light", "standard", "deep"],
  "sensitivity": "standard",
  "questions": [],
  "schema_fragment": {},
  "policies": {
    "allow_sensitive": false
  }
}
```

## Reserved Behaviors

A domain module may:

- add domain-specific questions
- add namespaced observed and inferred structures
- register heuristics for simulation
- define domain-specific profile views

A domain module may not:

- redefine core semantics
- override root privacy policy
- bypass consent or access checks
- infer blocked sensitive traits without explicit platform policy support

## Namespacing Rules

Domain-specific fields should live under namespaced branches such as:

- `layers.observed.education`
- `layers.inferred.education`
- `simulation_profiles.domains.education`

Built-in cross-domain summaries may write into shared models only when the mapping is explicitly defined and documented.

## Question Model

Each question definition should include:

- `id`
- `domain`
- `prompt`
- `type`
- `choices` when applicable
- `depth`
- `sensitivity`
- `information_targets`
- `follow_up_rules`

## Depth Levels

### Light

- low-burden
- broad signal gathering
- suitable for onboarding

### Standard

- balanced coverage
- follow-ups for uncertainty reduction

### Deep

- scenario probing
- contradiction handling
- higher confidence targeting

## Sensitivity Classes

- `low`
- `standard`
- `restricted`

Restricted questions or fields require:

- explicit policy support
- explicit consent scope
- restricted access tags on stored outputs

## Normalization Requirements

Each domain must convert answers into stable normalized facts.

Example:

- raw answer: "I mostly cram the night before"
- normalized observation: `study_start_pattern = last_minute`

Normalization must preserve:

- original raw answer reference
- question id
- timestamp
- parser or rule source

## Inference Hooks

Domain modules may register:

- trait derivation rules
- pattern derivation rules
- confidence adjustments
- contradiction handlers

These hooks must be deterministic or auditable. If model-generated inference is used, the system must still store traceable evidence references.

## Simulation Hooks

Domain modules may contribute:

- scenario templates
- domain-specific predictors
- reasoning phrases
- caveat rules

The final simulation output must still pass through the platform-level simulation contract.

## Packaging Rules

Custom modules should be packageable as local packages or manifest-driven plugin bundles. Validation should run on install or registration, not only at runtime.

## Initial Built-In Domains

### Core

Focus:

- thinking style
- learning preference
- action patterns
- motivation
- interaction preference

### Education

Focus:

- study habits
- revision patterns
- exam behavior
- focus barriers

### Productivity

Focus:

- planning style
- distraction triggers
- time-of-day effectiveness
- task initiation patterns

## Acceptance Criteria

A domain module is platform-ready when:

- its schema fragment validates cleanly
- questions are namespaced and versioned
- normalization rules produce structured observations
- inference hooks produce confidence-aware outputs
- privacy tags are declared for restricted fields
- simulation hooks comply with the global response contract
