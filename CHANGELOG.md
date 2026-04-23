# Changelog

All notable changes to PSON5 will be documented in this file.

## Unreleased

- Added `@pson5/neo4j-store` package with env/file configuration, connection status, and knowledge-graph sync via Cypher.
- Added an agent tool contract layer: `getPsonAgentToolDefinitions()` and `createPsonAgentToolExecutor()` in the SDK, remote `/v1/pson/tools/{definitions,openai,execute}` and `/v1/mcp` JSON-RPC routes in the API, and a local `pson mcp-stdio` transport in the CLI.
- Extended the learning session state with provider-generated questions, contradiction flags, confidence gaps, fatigue score, and stop reason.
- Replaced the interactive CLI console with an Ink/React UI (legacy readline is preserved as `pson console-legacy`) and added Clack wizards for provider and Neo4j setup.
- Published the `pson-agent` skill, an agent-tools example suite, and new usage docs for agent tools, agent auth, and the PSON agent skill.
- Refreshed landing, console, and docs-site content for the new agent and Neo4j surfaces.

## 0.1.0 - 2026-04-22

- Established the open-source monorepo structure for the PSON5 profile standard, engines, SDK, CLI, API, web surfaces, and docs site.
- Published the first public npm packages under the `@pson5` scope, including the SDK, CLI, storage, privacy, simulation, acquisition, and agent-context layers.
- Added GitHub-ready project files, package READMEs, CI workflows, package publishing workflow, and docs deployment workflow.
- Added the first docs-site application for public documentation and package/reference navigation.
