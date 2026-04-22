# System Architecture

## Purpose

This document defines the runtime architecture for PSON5, the boundaries between subsystems, and the data flow that must remain stable as the platform is implemented.

## Architectural Principle

PSON5 is a layer between user input and AI behavior. Its job is to transform raw user interaction into structured, confidence-aware personalization artifacts that can be safely reused across products.

Canonical flow:

`User -> Acquisition -> Modeling -> State/Graph -> Serialization/Storage -> API/SDK -> AI Consumer`

## Runtime Layers

### 1. Interface Layer

Components:

- CLI
- Web app
- SDK consumers

Responsibilities:

- collect user input
- display profile state
- submit simulation requests
- surface privacy controls
- show transparency and confidence data

### 2. Gateway Layer

Component:

- HTTP API gateway

Responsibilities:

- authenticate requests
- validate payloads
- resolve consent scope
- route to internal services
- enforce versioned contracts

### 3. Intelligence Layer

Components:

- Acquisition engine
- Modeling engine
- Simulation engine
- State engine
- Knowledge graph engine

Responsibilities:

- collect signals
- derive structured user models
- estimate confidence
- predict likely behavior in context
- maintain explainability links

### 4. Persistence Layer

Components:

- Serialization engine
- Document store
- Graph store
- Vector store
- Secure identity vault

Responsibilities:

- persist `.pson` documents
- store graph structure
- support semantic retrieval
- isolate sensitive identity data

## Service Boundaries

### Acquisition Engine

Inputs:

- direct answers
- session context
- enabled domains
- sensitivity policy
- optional passive signals

Outputs:

- normalized observations
- question session state
- contradiction flags
- fatigue indicators

### Modeling Engine

Inputs:

- observed facts
- behavioral events
- question answers
- prior inferred traits

Outputs:

- inferred traits
- behavior patterns
- heuristics
- confidence records

### Simulation Engine

Inputs:

- profile snapshot
- current context
- active domains
- optional assumed states

Outputs:

- prediction
- confidence
- reasoning trace
- caveats

### State Engine

Inputs:

- event stream
- recent profile updates
- passive signals when allowed

Outputs:

- candidate states
- active state likelihoods
- transitions

### Knowledge Graph Engine

Inputs:

- observed facts
- inferred traits
- state relations
- evidence links

Outputs:

- nodes
- edges
- explainability traversals

### Serialization Engine

Inputs:

- profile aggregate
- schema version
- privacy policy

Outputs:

- validated `.pson` documents
- migrations
- encrypted or tagged fields

## Data Ownership Rules

- Acquisition owns raw session answers and normalized observations.
- Modeling owns inferred traits, heuristics, and confidence calculations.
- State owns transient conditions and transition probabilities.
- Graph owns relationship structure and evidence links.
- Serialization owns the portable profile document.
- Privacy owns consent enforcement, field restrictions, and access policy evaluation.

No component may silently overwrite another component's source-of-truth fields.

## Mandatory Data Separation

PSON5 must preserve three distinct categories:

- observed facts
- inferred claims
- simulated outputs

These categories may reference one another but must not collapse into one undifferentiated profile blob.

## Deployment Topologies

### Local-First

Characteristics:

- document store on local machine
- optional local graph/vector backends
- strongest privacy posture
- limited collaboration

### Cloud

Characteristics:

- centralized API and storage
- easier scaling
- shared SDK/API access
- more demanding compliance controls

### Hybrid

Characteristics:

- split storage model
- local sensitive data with cloud simulation helpers where allowed
- best fit for high-control deployments

## Request Lifecycles

### Profile Initialization

1. Client submits `POST /pson/init`.
2. Gateway validates payload and consent bootstrap.
3. Serialization creates minimal profile shell.
4. Storage persists revision `1`.
5. Response returns profile metadata and next recommended action.

### Learning Session

1. Client requests next question set.
2. Acquisition selects questions based on confidence gaps and domain priority.
3. User answers are normalized into observed facts.
4. Modeling updates traits and heuristics.
5. State and graph engines update dependent structures.
6. Serialization writes a new profile revision.

### Simulation Request

1. Client submits context and options.
2. Gateway checks profile access scope.
3. Simulation engine loads profile snapshot.
4. Reasoning uses observed facts, inferred claims, states, and graph support.
5. Response returns prediction, confidence, reasoning, and caveats.

## Failure Modes To Design For

- contradictory user answers
- sparse data causing low-confidence simulations
- stale traits that should decay
- restricted fields leaking into explanations
- domain modules defining conflicting schema fragments
- profile version mismatches across SDK/API consumers

## Implementation Guidance

- Start as a modular monolith, not microservices.
- Keep package boundaries strong enough that engines can be extracted later.
- Store reasoning evidence references, not just text explanations.
- Version every external contract from the start.
