# Simulation Contract

## Purpose

This document defines how PSON5 predicts likely user behavior and how those predictions must be represented, constrained, and explained.

## Simulation Principle

Simulation is probabilistic estimation based on observed facts, inferred patterns, and current context. It is not identity replication and must never be represented as certainty.

## Supported Simulation Types

- decision simulation
- response simulation
- action likelihood estimation
- counterfactual comparison

## Input Contract

A simulation request must include:

- profile identifier or profile snapshot
- context object
- active domains or domain hints
- privacy scope

Optional inputs:

- assumed state
- requested explanation level
- requested evidence inclusion
- scenario label

Example:

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
    "explanation_level": "standard"
  }
}
```

## Output Contract

Every simulation response must include:

- `prediction`
- `confidence`
- `caveats`

It should also include when requested:

- `reasoning`
- `evidence`
- `assumed_state`
- `alternatives`

Example:

```json
{
  "prediction": "delayed_start",
  "confidence": 0.74,
  "reasoning": [
    "Observed task-initiation delays under low urgency.",
    "Deadline proximity increases action likelihood."
  ],
  "evidence": [
    {
      "source_id": "answer_123",
      "source_type": "answer"
    }
  ],
  "caveats": [
    "Sparse evidence for exam-specific scenarios."
  ]
}
```

## Prediction Semantics

### Prediction

The top outcome or generated response estimate.

### Confidence

Bounded number from `0` to `1`.

### Reasoning

Human-readable explanation derived from evidence-backed profile structures.

### Evidence

Pointers to supporting profile records, not raw unrestricted data dumps.

### Caveats

Explicit limitations such as sparse evidence, contradictory inputs, or low domain coverage.

## Confidence Rules

- low evidence must reduce confidence
- contradictions must reduce confidence until resolved
- outdated evidence should decay
- confidence should reflect calibration goals, not optimism

## Explanation Levels

### Minimal

- prediction
- confidence
- short caveat summary

### Standard

- prediction
- confidence
- reasoning bullets
- major evidence references
- caveats

### Detailed

- standard output
- alternative outcomes
- evidence weights
- state assumptions

## Counterfactual Contract

Counterfactual requests should support:

- base context
- changed variable set
- optional comparison explanation

Response should include:

- original prediction
- counterfactual prediction
- changed factors
- explanation of why the outcome shifted

## Safety Rules

- never present simulation as certainty
- never expose restricted evidence without scope
- never write simulation output into observed facts
- never fill missing evidence with fabricated justifications

## Persistence Rules

Simulation outputs may be cached under `layers.simulated` or `simulation_profiles.scenarios`, but cached results must include:

- originating context hash or identifier
- generation timestamp
- profile revision used
- expiration or staleness policy

## Initial Implementation Strategy

The first implementation should use a deterministic or hybrid rules-first system with clear evidence references. Generative reasoning text can be layered on later if it remains constrained by evidence and privacy policy.

## Minimum Tests

- confidence bounds
- sparse-data behavior
- restricted-field redaction in reasoning
- deterministic output for identical inputs in rules-first mode
- counterfactual output integrity
