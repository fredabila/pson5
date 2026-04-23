# PSON5

PSON5 is an open-source personalization infrastructure stack for AI systems. It gives you a portable profile format, a set of engines for learning and simulation, a TypeScript SDK, CLI and API surfaces, and an agent-safe context layer so personalization data can be used without dumping raw profile internals into every prompt.

## What PSON5 Ships

- `.pson` profile standard for observed, inferred, simulated, and privacy-tagged user data
- core engines for acquisition, modeling, simulation, state, graph, serialization, privacy, and provider integration
- TypeScript SDK for apps and agents
- CLI for local workflows and interactive profile operations
- Neo4j-backed graph sync and status tooling
- HTTP API for service integration
- web console and public landing page
- documentation site in `apps/docs-site`

## Why It Exists

Most agent systems handle user memory as free-form notes. That makes validation, redaction, simulation, and multi-agent reuse fragile. PSON5 turns personalization into a structured layer with:

- canonical profile contracts
- configurable domain modules
- probabilistic simulation instead of hard-coded certainty
- agent-safe projections instead of raw profile dumps
- storage and deployment boundaries that can scale from local files to cloud backends

## Monorepo Layout

```text
apps/
  api/        HTTP API
  cli/        publishable CLI package
  docs-site/  documentation experience
  web/        public site + internal console
packages/
  core-types/
  schemas/
  privacy/
  serialization-engine/
  provider-engine/
  modeling-engine/
  state-engine/
  graph-engine/
  neo4j-store/
  simulation-engine/
  acquisition-engine/
  agent-context/
  sdk/
  postgres-store/
docs/
  architecture/
  api/
  domains/
  privacy/
  roadmap/
  schemas/
  simulation/
  usage/
tests/
  integration/
skills/
  pson-agent/
examples/
  agent-tools/
```

## Publishable Packages

- `@pson5/core-types`
- `@pson5/schemas`
- `@pson5/privacy`
- `@pson5/serialization-engine`
- `@pson5/provider-engine`
- `@pson5/modeling-engine`
- `@pson5/state-engine`
- `@pson5/graph-engine`
- `@pson5/neo4j-store`
- `@pson5/simulation-engine`
- `@pson5/acquisition-engine`
- `@pson5/agent-context`
- `@pson5/sdk`
- `@pson5/postgres-store`
- `@pson5/cli`

## Quick Start

### Install

```bash
npm install
npm run check
npm run build
```

### Run the API

```powershell
$env:PSON_STORE_BACKEND='file'
$env:PSON_STORE_DIR='C:\Users\user\pson5\.pson5-store'
$env:PORT='3015'
npm run dev:api
```

### Run the CLI

```powershell
npm run dev:cli -- console --store C:\Users\user\pson5\.pson5-store
```

### Run the docs site

```powershell
npm run dev:docs
```

### Run the web app

```powershell
Set-Location C:\Users\user\pson5\apps\web
$env:API_ORIGIN='http://localhost:3015'
$env:PORT='4173'
npm run dev
```

## Docs

Repo docs:

- [PSON5_SCOPE.md](./PSON5_SCOPE.md)
- [docs/architecture/system-architecture.md](./docs/architecture/system-architecture.md)
- [docs/schemas/pson-schema.md](./docs/schemas/pson-schema.md)
- [docs/api/api-contract.md](./docs/api/api-contract.md)
- [docs/usage/sdk-usage.md](./docs/usage/sdk-usage.md)
- [docs/usage/api-quickstart.md](./docs/usage/api-quickstart.md)
- [docs/usage/agent-integration.md](./docs/usage/agent-integration.md)
- [docs/usage/agent-context.md](./docs/usage/agent-context.md)
- [docs/usage/pson-agent-skill.md](./docs/usage/pson-agent-skill.md)
- [docs/usage/agent-tools.md](./docs/usage/agent-tools.md)
- [docs/usage/agent-auth.md](./docs/usage/agent-auth.md)

Docs app:

- `apps/docs-site`

## Security And Deployment Status

The current API already supports:

- API key protection
- signed JWT identity
- HS256 and RS256 verification
- PEM public key and JWKS-based verification
- remote JWKS lookup with in-process cache refresh
- tenant enforcement
- subject-user binding
- route-level role and scope authorization
- API access audit logs

This is a strong early cloud boundary, but it is not the end state. Remaining hardening work includes:

- rate limits
- deeper policy modeling
- richer observability
- production-grade key rotation and trust-provider workflows

## Open Source Readiness

The repository now includes:

- [LICENSE](./LICENSE)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [SUPPORT.md](./SUPPORT.md)
- [PUBLISHING.md](./PUBLISHING.md)
- GitHub issue templates
- CI workflow
- manual publish workflow for npm packages

## Release Workflow

Validate the workspace:

```bash
npm run ci
```

Pack all publishable packages:

```bash
npm run pack:publishable
```

See [PUBLISHING.md](./PUBLISHING.md) for the current release checklist.
