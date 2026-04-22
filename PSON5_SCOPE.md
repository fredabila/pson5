# PSON5 Scope

## 1. Purpose

PSON5 is a personalization infrastructure standard for collecting user signals, converting them into structured models, simulating likely behavior, and persisting the result in a portable `.pson` profile format.

This document is the build reference for the full system. It is intentionally implementation-oriented so an agent can use it to plan and ship the platform without having to reinterpret the concept from scratch.

## 2. Product Definition

### 2.1 Core Statement

PSON5 is a cognitive simulation infrastructure layer that sits between a user and an AI-powered product.

Baseline flow:

`User -> PSON Profile -> AI System -> Personalized Output`

### 2.2 What PSON5 Must Do

PSON5 must:

- collect explicit and behavioral user signals
- build structured user models from those signals
- estimate confidence for each learned trait or pattern
- simulate likely user responses, actions, and decision tendencies
- persist profiles in a standardized `.pson` format
- enforce privacy, consent, and access control boundaries
- expose the system through API, CLI, and SDK interfaces

### 2.3 What PSON5 Is Not

PSON5 is not:

- a claim of consciousness replication
- a general-purpose surveillance system
- a guarantee of correct prediction
- a system allowed to infer sensitive traits without explicit policy support

## 3. Build Goals

### 3.1 Primary Goals

- define a portable personalization standard
- support probabilistic user modeling
- enable explainable simulation outputs
- support local-first, cloud, and hybrid deployment
- allow domain-specific extensions without changing the core model

### 3.2 Non-Goals for v1

- full autonomous agent orchestration
- unrestricted sensitive trait inference
- identity replication or "digital clone" claims
- perfect prediction across all contexts
- consumer-grade growth features unrelated to modeling infrastructure

## 4. System Boundaries

### 4.1 In Scope

- profile acquisition
- adaptive questioning
- domain module activation
- structured modeling
- simulation engine
- state tracking
- knowledge graph persistence
- `.pson` serialization
- CLI
- HTTP API
- SDK
- privacy and access control
- evaluation metrics
- deployment scaffolding

### 4.2 Out of Scope for Initial Build

- billing
- team admin systems
- marketplace for third-party modules
- mobile apps
- advanced graph visualization polish beyond functional usability
- production-scale multi-tenant ops automation

## 5. Guiding Principles

- probabilistic over absolute
- consent-first data collection
- minimal data necessary for the use-case
- modular domain expansion
- explainability for predictions
- portability of stored profiles
- strict separation between observed and inferred data
- reversible or decaying confidence as user behavior changes

## 6. Core Architecture

### 6.1 Top-Level Components

1. Client Layer
2. API Gateway
3. Acquisition Engine
4. Modeling Engine
5. Simulation Engine
6. State Engine
7. Knowledge Graph Engine
8. Serialization Engine
9. Storage Layer
10. SDK / Agent Integration Layer

### 6.2 Component Responsibilities

#### Client Layer

Interfaces for CLI and web app.

Responsibilities:

- onboarding flows
- profile inspection
- simulation requests
- transparency display
- privacy controls

#### API Gateway

Single entry point for all external clients.

Responsibilities:

- request validation
- authentication
- rate limiting
- routing
- versioning
- audit logging hooks

#### Acquisition Engine

Collects user data through direct input, adaptive prompts, scenario probing, and optional behavior signals.

Responsibilities:

- core profile collection
- domain module question delivery
- adaptive follow-up generation
- fatigue detection
- confidence-gap targeting
- contradiction probing

#### Modeling Engine

Transforms raw input into structured user intelligence.

Subsystems:

- Trait Extractor
- Pattern Miner
- Heuristic Builder

Responsibilities:

- create stable and dynamic attributes
- detect repeated decisions and action patterns
- assign confidence per derived claim
- separate observed vs inferred facts

#### Simulation Engine

Predicts likely behavior in new contexts.

Responsibilities:

- decision simulation
- response simulation
- action likelihood estimation
- counterfactual comparison
- reasoning trace generation

#### State Engine

Tracks temporary user conditions and their behavioral effects.

Responsibilities:

- define states
- infer active state candidates
- track transitions
- attach triggers and duration tendencies

#### Knowledge Graph Engine

Stores relationships between learned entities.

Responsibilities:

- maintain node and edge models
- support causal and correlational links
- expose traversal queries
- support explainability lookups

#### Serialization Engine

Writes and reads `.pson` profiles.

Responsibilities:

- schema validation
- export and import
- profile versioning
- compression hooks
- encryption hooks
- access tagging

#### Storage Layer

Persists structured profile data.

Responsibilities:

- graph storage
- document storage
- vector retrieval support
- audit-safe data separation

#### SDK / Agent Layer

Gives external agents and apps a safe interface to personalization data.

Responsibilities:

- load profile
- inspect preferences
- run simulation
- enforce privacy scopes
- expose confidence-aware reads

## 7. Data Model

### 7.1 Data Layers

PSON5 stores data in explicit layers:

- `observed`: direct user statements or direct behavioral evidence
- `inferred`: model-derived traits, tendencies, and heuristics
- `simulated`: scenario-specific predictions and generated estimates

### 7.2 Core Modeling Domains

The base profile should support these domains:

- identity metadata
- consent
- cognitive model
- behavioral model
- state model
- knowledge graph
- simulation profiles
- privacy metadata
- system metadata

### 7.3 Domain Module System

PSON5 must support a `core + optional domains` model.

Required built-in domains:

- `core`
- `cognitive`
- `behavioral`

Recommended first-party optional domains:

- `productivity`
- `education`
- `finance`
- `health`
- `social`

Custom domains must be allowed under a namespace like:

- `developer_custom:<name>`

Each domain module must define:

- schema fragment
- question set
- supported depth levels
- sensitivity classification
- simulation relevance
- confidence rules

## 8. `.pson` File Standard

### 8.1 Canonical Shape

```json
{
  "pson_version": "5.0",
  "profile_id": "uuid",
  "user_id": "hashed_or_tokenized",
  "consent": {
    "granted": true,
    "scopes": [],
    "policy_version": "string",
    "updated_at": "ISO-8601"
  },
  "domains": {
    "active": ["core"],
    "depth": "light"
  },
  "layers": {
    "observed": {},
    "inferred": {},
    "simulated": {}
  },
  "cognitive_model": {
    "thinking_style": {},
    "learning_style": {},
    "processing_patterns": {}
  },
  "behavioral_model": {
    "decision_functions": [],
    "action_patterns": [],
    "motivation_model": {}
  },
  "state_model": {
    "states": [],
    "transitions": []
  },
  "knowledge_graph": {
    "nodes": [],
    "edges": []
  },
  "simulation_profiles": {
    "scenarios": []
  },
  "privacy": {
    "encryption": true,
    "access_levels": {},
    "local_only": false,
    "restricted_fields": []
  },
  "metadata": {
    "confidence": 0.0,
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601",
    "source_count": 0,
    "revision": 1
  }
}
```

### 8.2 Required Rules

- the file must be versioned
- observed and inferred fields must remain distinguishable
- each inferred claim should support confidence metadata
- simulation outputs must be separable from durable profile facts
- privacy flags must travel with the profile
- encrypted fields must declare their encryption state

### 8.3 Schema Strategy

Use JSON Schema for validation of `.pson` documents.

Deliverables:

- core schema
- per-domain schema fragments
- schema composition strategy
- migration rules between minor versions

## 9. Learning and Questioning Model

### 9.1 Learning Modes

#### Core Profile

Always on, lightweight, cross-product.

Captures:

- thinking style
- learning style
- action patterns
- motivation
- interaction preferences

#### Domain Modules

Optional, app-controlled expansions.

Examples:

- education app loads `education`
- task manager loads `productivity`
- finance app loads `finance`

### 9.2 Adaptive Question Engine

Question selection must be based on:

- information gain
- confidence gaps
- contradiction detection
- domain priority
- fatigue signals

### 9.3 Question Types

- direct preference questions
- scenario-based behavioral probes
- follow-up clarification questions
- contradiction resolution questions
- optional passive signal interpretation prompts

### 9.4 Stopping Conditions

The engine should stop or pause when:

- confidence reaches the configured threshold
- user fatigue is detected
- privacy policy blocks deeper probing
- domain scope has been sufficiently covered

## 10. Modeling Engine Requirements

### 10.1 Trait Extractor

Produces stable characteristics from observed signals.

Examples:

- prefers planning vs improvisation
- summary vs depth preference
- logic vs instinct tendency

### 10.2 Pattern Miner

Extracts repeated behaviors.

Examples:

- delayed task initiation under low urgency
- last-minute performance spikes
- deadline-triggered engagement

### 10.3 Heuristic Builder

Produces decision shortcuts and conditional rules.

Examples:

- if deadline is near and difficulty is high, start late but intensify effort
- if explanation is long and user is stressed, prefer summary first

### 10.4 Confidence Model

Every derived trait, pattern, and heuristic should have:

- confidence score
- evidence references
- last validated timestamp
- decay policy

## 11. Simulation Engine Requirements

### 11.1 Simulation Types

- decision simulation
- response simulation
- action likelihood
- counterfactual simulation

### 11.2 Input Contract

Simulation requests must accept:

- context object
- active domain hints
- optional state assumptions
- privacy scope
- explanation level

### 11.3 Output Contract

Simulation responses must include:

- prediction
- confidence
- reasoning trace
- evidence references
- caveats

Example:

```json
{
  "prediction": "delayed_start",
  "confidence": 0.74,
  "reasoning": [
    "Observed tendency to delay difficult tasks",
    "Deadlines increase action probability close to due date"
  ],
  "caveats": [
    "Confidence limited by sparse data for exam-related scenarios"
  ]
}
```

### 11.4 Hard Rules

- simulation outputs must not be written back as observed facts
- low-confidence predictions must be explicitly marked
- privacy-restricted fields must not appear in reasoning output without permission

## 12. State Engine Requirements

### 12.1 Core State Model

Each state record should include:

- state id
- label
- trigger patterns
- behavior shifts
- duration tendencies
- recovery signals
- confidence

### 12.2 Initial Built-In States

- focused
- distracted
- stressed
- motivated
- fatigued

### 12.3 Transition Model

Transitions should support:

- source state
- target state
- probable triggers
- transition likelihood
- typical duration window

## 13. Knowledge Graph Requirements

### 13.1 Node Types

- preference
- behavior
- skill
- trigger
- state
- decision_rule
- domain_fact

### 13.2 Edge Types

- `causes`
- `correlates_with`
- `depends_on`
- `overrides`
- `reinforces`
- `contradicts`

### 13.3 Minimum Graph Capabilities

- create and update nodes and edges
- retrieve neighborhood around a fact
- retrieve evidence supporting a prediction
- support explainability queries for simulation output

## 14. Storage Architecture

### 14.1 Storage Types

#### Graph Database

Recommended use:

- nodes
- edges
- traversals for reasoning support

#### Document Store

Recommended use:

- `.pson` profile documents
- revision history
- exports

#### Vector Store

Recommended use:

- embedding-based retrieval
- semantic recall for memories and user statements

### 14.2 Data Separation Rules

- identity data goes to secure vault or equivalent isolated store
- graph data stores relationships and non-secret derived structure
- serialized profiles hold portable state with privacy metadata
- vector store must not become the only source of truth

## 15. API Scope

### 15.1 Required Endpoints

- `POST /pson/init`
- `POST /pson/learn`
- `POST /pson/simulate`
- `PATCH /pson/update`
- `GET /pson/export`
- `GET /pson/profile/:id`
- `GET /pson/schema`

### 15.2 Recommended Additional Endpoints

- `POST /pson/import`
- `GET /pson/graph/:id`
- `POST /pson/validate`
- `POST /pson/question/next`
- `POST /pson/feedback`

### 15.3 API Design Rules

- all writes validated against schema
- explicit versioning
- idempotency where appropriate
- typed error responses
- auth and privacy scope enforced at gateway

## 16. CLI Scope

### 16.1 Required Commands

- `pson init`
- `pson learn`
- `pson simulate`
- `pson inspect`
- `pson update`
- `pson export`
- `pson encrypt`
- `pson validate`

### 16.2 CLI Features

- interactive onboarding
- resume prior session
- local-only mode
- no-sensitive mode
- depth selection
- domain selection
- explain output mode

Example flags:

- `--local-only`
- `--no-sensitive`
- `--depth=light|standard|deep`
- `--domains=core,education`
- `--explain`

## 17. Web App Scope

### 17.1 Required Screens

- dashboard
- profile inspector
- knowledge graph viewer
- simulation playground
- transparency panel
- privacy controls

### 17.2 Functional Requirements

- inspect observed vs inferred data separately
- show confidence values
- show why a prediction was made
- allow enabling and disabling domain modules
- allow export and import of `.pson`

## 18. SDK Scope

### 18.1 Required SDK Methods

```ts
pson.load(profileId)
pson.getProfile(profileId)
pson.getPreference(key)
pson.learn(input)
pson.simulate(context)
pson.export(profileId)
pson.validate(document)
```

### 18.2 SDK Behavior Rules

- always expose confidence where applicable
- never hide privacy failures behind null values without reason codes
- allow host agents to request explanation traces
- reject access outside consent scope

## 19. Security and Privacy Scope

### 19.1 Required Controls

- encryption at rest
- encryption in transit
- access level tagging
- consent tracking
- auditability
- tokenization of identifiers

### 19.2 Access Levels

- public
- private
- restricted

### 19.3 Optional High-Privacy Mode

Support a zero-knowledge-oriented configuration where raw data is unreadable to the hosting system, subject to deployment constraints.

### 19.4 Policy Rules

- no unauthorized inference of sensitive traits
- no simulation beyond consent scope
- no silent retention of blocked data classes

## 20. Continuous Learning

### 20.1 Feedback Loop

`prediction -> user action -> correction -> model update`

### 20.2 Update Rules

- new evidence can strengthen or weaken existing traits
- older signals should decay in influence
- explicit user corrections should have high weight
- contradictions should trigger targeted re-evaluation

## 21. Evaluation Framework

### 21.1 Core Metrics

- prediction accuracy
- confidence calibration
- adaptability to behavior change
- profile completeness
- user burden / question fatigue

### 21.2 Minimum Evaluation Suite

- offline simulation tests
- schema validation tests
- API contract tests
- privacy boundary tests
- CLI workflow tests
- explainability integrity tests

## 22. Suggested Technical Stack

This is guidance, not a requirement.

### 22.1 Backend

- Node.js with TypeScript for API, CLI, SDK, and schema tooling
- optional Python services for experimental modeling or simulation pipelines

### 22.2 Storage

- graph database: Neo4j or equivalent
- document storage: object store or document DB
- vector database: Pinecone, Weaviate, pgvector, or equivalent

### 22.3 Frontend

- web app in React / Next.js or equivalent

### 22.4 Deployment Modes

- local-first
- cloud
- hybrid

## 23. Recommended Repository Structure

```text
pson5/
  apps/
    api/
    cli/
    web/
  packages/
    sdk/
    schemas/
    core-types/
    acquisition-engine/
    modeling-engine/
    simulation-engine/
    state-engine/
    graph-engine/
    serialization-engine/
    privacy/
  docs/
    architecture/
    api/
    schemas/
    domains/
  examples/
    education/
    productivity/
  tests/
    integration/
    fixtures/
```

## 24. Build Phases

### Phase 1: Foundation

Deliver:

- repo structure
- shared types
- `.pson` core schema
- API skeleton
- CLI skeleton
- profile init and export flow

Exit criteria:

- can create, validate, and export a minimal `.pson` profile

### Phase 2: Acquisition

Deliver:

- core question flows
- domain module loading
- adaptive question engine basics
- session persistence

Exit criteria:

- can collect core profile data and store observed facts

### Phase 3: Modeling

Deliver:

- trait extraction
- pattern mining
- heuristic builder
- confidence scoring

Exit criteria:

- can derive inferred model fields from observed inputs

### Phase 4: Simulation

Deliver:

- simulation request pipeline
- prediction output format
- explanation traces

Exit criteria:

- can run context-based predictions from stored profiles

### Phase 5: State + Graph

Deliver:

- state tracking
- graph persistence
- explanation queries via graph relationships

Exit criteria:

- can show structural relationships behind predictions

### Phase 6: Privacy + Hardening

Deliver:

- encryption hooks
- access control enforcement
- consent boundaries
- audit and validation hardening

Exit criteria:

- privacy restrictions are testable and enforced across interfaces

### Phase 7: UX Completion

Deliver:

- web dashboard
- graph view
- simulation playground
- transparency panel

Exit criteria:

- end-to-end use is possible without touching raw storage directly

## 25. Acceptance Criteria

PSON5 is considered minimally build-complete when:

- a user can initialize a profile
- the system can collect core and domain-specific inputs
- observed data is persisted distinctly from inferred data
- inferred traits include confidence
- simulations can be run against a stored profile
- predictions include reasoning and caveats
- `.pson` export validates against schema
- CLI, API, and SDK can all access the same underlying profile model
- privacy scopes are enforced consistently

## 26. Open Design Questions

These must be resolved early before heavy implementation:

1. What exact confidence model should be used across engines?
2. Which data should be stored durably vs derived on demand?
3. How much passive behavioral collection is acceptable in default policy?
4. What constitutes sensitive inference for policy enforcement?
5. Should simulation reasoning be fully deterministic, partially generated, or hybrid?
6. Which fields belong in the portable `.pson` export vs server-side internal state only?
7. How should custom domain modules be packaged and validated?

## 27. Immediate Next Documents to Create

After this scope file, the next build documents should be:

1. `docs/architecture/system-architecture.md`
2. `docs/schemas/pson-schema.md`
3. `docs/api/api-contract.md`
4. `docs/domains/domain-module-spec.md`
5. `docs/privacy/privacy-model.md`
6. `docs/simulation/simulation-contract.md`
7. `docs/roadmap/implementation-plan.md`

## 28. Build Order Recommendation for Agents

Agents should implement in this order:

1. shared types and schema foundation
2. `.pson` validation and serialization
3. profile initialization and storage
4. acquisition flows
5. modeling engine
6. simulation engine
7. state and graph engines
8. SDK
9. CLI
10. web app
11. privacy hardening
12. evaluation suite

## 29. Final Constraint

Agents building PSON5 must preserve this distinction throughout the codebase:

- what the user explicitly said
- what the system inferred
- what the simulator predicts

Collapsing those three layers into one data model will damage trust, explainability, and safety.
