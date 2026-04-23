# Changelog

All notable changes to PSON5 will be documented in this file.

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
