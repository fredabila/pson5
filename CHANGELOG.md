# Changelog

All notable changes to PSON5 will be documented in this file.

## Unreleased

### Agent-observation API (new)

- **`observeFact()`** on the `@pson5/sdk` `PsonClient` and as a standalone function in `@pson5/serialization-engine`. Records a free-form observed fact volunteered by the user, without requiring a registered question id. Writes to `layers.observed[domain]` only — the three-layer invariant is preserved; `observation_type: "agent_observation"` + `source_question_id: null` distinguish these from `pson_learn` answers in downstream code.
- **`pson_observe_fact`** agent tool exposed by `getPsonAgentToolDefinitions()` and executed by `createPsonAgentToolExecutor()`. Takes `{ profile_id, domain, key, value, note?, confidence? }`. Unblocks open-conversation personalization where the agent can't realistically funnel every volunteered fact through a pre-registered question.
- **New `AgentObservationRecord` type** in `@pson5/core-types`. Lives alongside `ObservedAnswerRecord`; both share the `facts` map within each observed domain, but their provenance buckets are distinct (`observations` vs. `answers`).
- **Integration test** `tests/integration/observe-fact.mjs` locks the contract: revision + source_count bumping, key sanitization, confidence default, layer-separation enforcement, error paths. Wired into `npm run ci` and the GitHub Actions CI workflow.

### Security

- **API request-body size cap.** `apps/api` now enforces a configurable body-size limit (default 1 MB, max 50 MB via `PSON_MAX_REQUEST_BYTES`) and returns `413 payload_too_large` with a structured error instead of accumulating unbounded memory. Invalid JSON now returns `400 invalid_json`.
- **MCP `ping` is now authenticated.** `POST /v1/mcp { method: "ping" }` was previously reachable without a caller check; it now requires the same `system:read` scope as the rest of the MCP surface and emits an audit record on denial.
- **Stored credentials are written with `0600` permissions** on POSIX systems (`@pson5/neo4j-store`, `@pson5/provider-engine`). Silent no-op on Windows where POSIX modes don't apply — rely on platform ACLs there.
- **API refuses to bind to a non-loopback address without auth configured.** Set `PSON_API_KEY`, `PSON_JWT_SECRET`, `PSON_JWT_PUBLIC_KEY`, or `PSON_JWKS_URL` — or opt out explicitly with `PSON_ALLOW_UNAUTHED_BIND=true` for deliberate local-network tests. Exits with code 78 (`EX_CONFIG`) on misconfiguration.
- **`.gitignore` expanded with secret patterns** (`.env*`, `*.key`, `*.pem`, `credentials.json`, `service-account*.json`, `sk-ant-*`, etc.) to protect against accidental credential commits.

### API

- **New `PsonError` hierarchy in `@pson5/core-types`.** Base class plus `PsonValidationError`, `PsonNotFoundError`, `PsonConflictError`, `PsonUnauthorizedError`, `PsonForbiddenError`, `PsonProviderError`, `PsonInvariantViolation`. Every error carries a stable `.code` (of type `PsonErrorCode`) and optional `.details`. `serializePsonError(err)` turns any error into the HTTP error-envelope shape. `ProfileStoreError` (in `@pson5/serialization-engine`) now extends `PsonError` — old `err.code === "profile_not_found"` checks move to `err.storeCode`; broader `instanceof PsonError` tests are preferred for new code.
- **Behavioural model types tightened in `@pson5/core-types`.** `PsonProfile.behavioral_model` is now `BehavioralModel` with `decision_functions: HeuristicRecord[]`, `action_patterns: InferredTraitRecord[]`, and `motivation_model: MotivationModel` (extensible via index signature). Previously all three were `unknown[]` / `Record<string, unknown>`. This is an additive refinement — existing callers continue to work.

### Release hygiene

- **CI now runs every integration test.** Previous workflow silently skipped `test:core-flow`, `test:provider-retry`, and `test:cli-json`. Now matrix-tested on Node 20 and Node 22.
- **Publish workflow includes `@pson5/neo4j-store`** (previously missing, which would have broken SDK installs after next publish). Packages ship in dependency order, use `--provenance`, and auth via OIDC `id-token: write` with the classic `NPM_TOKEN` preserved as a fallback.
- **Permissions scoped on every workflow** (`permissions: contents: read` on CI; explicit `id-token: write` on publish).

### Documentation

- Top-level README now reflects v0.2.0 and the single-landing-page surface — removed stale `/access → /console` navigation references.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md` — removed Windows absolute paths that leaked from an authoring environment; all internal links are now relative.
- Three sparse package READMEs rewritten with end-to-end examples: `@pson5/neo4j-store`, `@pson5/postgres-store`, `@pson5/provider-engine`.

### Planned for v0.3 (breaking)

These are intentionally deferred because they change the public API surface and deserve their own release:

- **Uniform async SDK surface.** Some `@pson5/sdk` methods are currently sync (`getQuestionRegistry`, `getNeo4jConfig`) while their counterparts are async. v0.3 will make every I/O method async by default and expose explicit `*Sync` variants only where they make sense.
- **Consistent HTTP response envelope.** Most routes return `{ data, meta }`; a few routes return bare objects. v0.3 will normalise every route to the envelope under a `/v2/` prefix, keeping `/v1/` stable for a deprecation window.

## 0.2.0 - 2026-04-23

- **Landing page redesign.** Replaced the console/access surfaces with a single focused landing page. Full package inventory with npm + GitHub links, three-lane hero visual, pipeline, agent-integration example, principles grid, and a dark-editorial aesthetic shared with the teaser.
- Added `@pson5/neo4j-store` package with env/file configuration, connection status, and knowledge-graph sync via Cypher.
- Added an agent tool contract layer: `getPsonAgentToolDefinitions()` and `createPsonAgentToolExecutor()` in the SDK, remote `/v1/pson/tools/{definitions,openai,execute}` and `/v1/mcp` JSON-RPC routes in the API, and a local `pson mcp-stdio` transport in the CLI.
- Extended the learning session state with provider-generated questions, contradiction flags, confidence gaps, fatigue score, and stop reason.
- Made the provider layer pluggable via the `ProviderAdapter` registry (OpenAI, Anthropic, and OpenAI-compatible ship built-in; custom adapters require three methods).
- Zero-registry acquisition: the SDK can build a profile from a one-line brief, with provider-proposed follow-up questions and AI-derived trait candidates promoted into the inferred layer.
- Replaced the interactive CLI console with an Ink/React UI (legacy readline is preserved as `pson console-legacy`) and added Clack wizards for provider and Neo4j setup.
- Added the Remotion teaser at `examples/remotion-teaser/` — ~74-second product film with Lyria-generated music bed, Google TTS voiceover, and a reproducible benchmark scene.
- Published the `pson-agent` skill, an agent-tools example suite, and new usage docs for agent tools, agent auth, and the PSON agent skill.
- Bumped every `@pson5/*` package and cross-dependency to `0.2.0` in lockstep via `scripts/bump-versions.mjs`.

## 0.1.0 - 2026-04-22

- Established the open-source monorepo structure for the PSON5 profile standard, engines, SDK, CLI, API, web surfaces, and docs site.
- Published the first public npm packages under the `@pson5` scope, including the SDK, CLI, storage, privacy, simulation, acquisition, and agent-context layers.
- Added GitHub-ready project files, package READMEs, CI workflows, package publishing workflow, and docs deployment workflow.
- Added the first docs-site application for public documentation and package/reference navigation.
