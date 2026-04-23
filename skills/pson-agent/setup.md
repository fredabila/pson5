# Setup — zero to running PSON5

> **Goal:** after this file, you have PSON5 running, a first profile on disk, and (optionally) Claude driving an end-to-end personalization loop. You do not have to clone any source code to use PSON5.

## 0. Prerequisites

- **Node.js 20 or newer** · check with `node --version`
- **npm** (ships with Node)
- *(optional)* an **Anthropic** or **OpenAI** API key — PSON5 works without one, a provider just adds adaptive question rewriting + AI-augmented modeling
- *(optional)* **Docker Desktop** if you want a local Neo4j graph mirror
- *(only if you want to run the bundled demos in §6)* **git**

## 1. Install — one of two paths

### 1a. Published packages *(recommended for agents)*

Nothing to build, nothing to clone.

```bash
# Just run it whenever you need it — no install step
npx @pson5/cli --help

# Or install globally and get the `pson` binary
npm install -g @pson5/cli
pson --help
```

For programmatic use from your own app:

```bash
npm install @pson5/sdk
```

```ts
import { createPsonSdk } from "@pson5/sdk";

const sdk = createPsonSdk({ provider: "anthropic" });
const profile = await sdk.observe({
  domain: "core",
  fact: "primary_language",
  value: "rust"
});
```

Individual engines are addressable too — see §7 below for the full package index.

### 1b. From source *(only if you want to contribute or run the bundled demos)*

```bash
git clone https://github.com/fredabila/pson5.git
cd pson5
npm install
npm run build
```

Takes 1–3 minutes the first time. The only reason to do this instead of 1a is if you want to run `examples/claude-driven-persona/run.mjs` or hack on the engines themselves.

All commands below use `pson` as the binary name. Replace with `npx @pson5/cli` if you didn't install globally, or `node apps/cli/dist/apps/cli/src/index.js` if you cloned.

## 2. Create your first profile — no provider required

PSON5 is fully functional without a model. Every engine has a rule-based fallback.

```bash
pson init demo_user --store .pson5-store --json
# → { "success": true, "data": { "profile_id": "pson_...", "revision": 1, ... } }
```

Inspect it:

```bash
pson inspect pson_... --store .pson5-store
```

That's a complete `.pson` profile on disk. The observed / inferred / simulated layers are empty — you haven't collected anything yet.

## 3. Configure a provider *(optional, but opens up the good stuff)*

Pick one. PSON5 resolves config from env vars first, then from `<store>/config/provider.json`.

### 3a. Claude

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export PSON_AI_PROVIDER=anthropic
export PSON_AI_MODEL=claude-haiku-4-5-20251001   # fast + cheap
# export PSON_AI_MODEL=claude-sonnet-4-6         # balanced
```

### 3b. OpenAI

```bash
export OPENAI_API_KEY=sk-...
export PSON_AI_PROVIDER=openai
export PSON_AI_MODEL=gpt-4.1-mini
```

### 3c. Anything OpenAI-compatible *(Ollama, vLLM, Groq, Together, OpenRouter, LiteLLM, Azure OpenAI…)*

```bash
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:11434/v1   # Ollama
export PSON_AI_MODEL=llama3.1
# export PSON_AI_API_KEY=...                        # if the endpoint requires one
```

Verify the provider is wired up:

```bash
pson provider-status --json
# → { "success": true, "data": { "configured": true, "provider": "anthropic", ... } }
```

## 4. Run the interactive console *(the TUI)*

An Ink/React interactive dashboard in your terminal — slash commands (`/help`, `/load`, `/simulate`, `/agent-context`, `/neo4j-sync`, …), live state, and an activity feed:

```bash
pson console --store .pson5-store
```

This is the fastest way to explore what PSON5 does end-to-end without writing any code.

## 5. Run the MCP server *(for agent frameworks)*

Two transports, same executor — stdio for local connections, HTTP for remote:

```bash
# Over stdio (framework connects via pipes)
pson mcp-stdio --store .pson5-store

# Over HTTP (POST /v1/mcp on the HTTP API — see §8)
```

The seven PSON5 tools are available via both. See [reference/transports.md](reference/transports.md) and [reference/tools.md](reference/tools.md).

## 6. *(Optional)* Run the Claude-driven demo

This one needs the source repo because the demo lives in `examples/`. Skip this section unless you want to see a full generative loop end-to-end.

```bash
# If you cloned (path 1b above):
node examples/claude-driven-persona/run.mjs
```

About 3–5 minutes. When it finishes you have:

| File | What it is |
| --- | --- |
| `output/profile.json` | The full `.pson` export |
| `output/transcript.json` | Every question, answer, rationale, revision |
| `output/graph.html` | **Open in any browser** — interactive D3 graph viewer |
| `output/graph.cypher` | Ready-to-paste statements for Neo4j Browser |

**Open `graph.html` in a browser** — that's your personalization data, visually.

To reproduce this flow from the published SDK without cloning, compose your own domain brief and call `openGenerativeSession` / `deriveGenerativeQuestions` yourself — see [reference/domain-briefs.md](reference/domain-briefs.md) and the generative-mode section of [SKILL.md](SKILL.md).

## 7. Package index — install only what you use

Everything is addressable individually. If you only want the simulation engine, skip the SDK.

| Package | Install | What it's for |
| --- | --- | --- |
| [`@pson5/sdk`](https://www.npmjs.com/package/@pson5/sdk) | `npm i @pson5/sdk` | Primary surface — the 90% path |
| [`@pson5/cli`](https://www.npmjs.com/package/@pson5/cli) | `npm i -g @pson5/cli` or `npx @pson5/cli` | Terminal interface, MCP server, console TUI |
| [`@pson5/core-types`](https://www.npmjs.com/package/@pson5/core-types) | `npm i @pson5/core-types` | Single source of interface truth — types only |
| [`@pson5/schemas`](https://www.npmjs.com/package/@pson5/schemas) | `npm i @pson5/schemas` | JSON-Schema validation for `.pson` files |
| [`@pson5/privacy`](https://www.npmjs.com/package/@pson5/privacy) | `npm i @pson5/privacy` | Redaction, consent, provider-policy helpers |
| [`@pson5/acquisition-engine`](https://www.npmjs.com/package/@pson5/acquisition-engine) | `npm i @pson5/acquisition-engine` | Adaptive question flow, learning sessions |
| [`@pson5/modeling-engine`](https://www.npmjs.com/package/@pson5/modeling-engine) | `npm i @pson5/modeling-engine` | Trait extractor, pattern miner, heuristics |
| [`@pson5/state-engine`](https://www.npmjs.com/package/@pson5/state-engine) | `npm i @pson5/state-engine` | Transient-state derivation |
| [`@pson5/graph-engine`](https://www.npmjs.com/package/@pson5/graph-engine) | `npm i @pson5/graph-engine` | Deterministic knowledge-graph construction |
| [`@pson5/simulation-engine`](https://www.npmjs.com/package/@pson5/simulation-engine) | `npm i @pson5/simulation-engine` | Scenario simulation with reasoning traces |
| [`@pson5/serialization-engine`](https://www.npmjs.com/package/@pson5/serialization-engine) | `npm i @pson5/serialization-engine` | `.pson` import / export / storage adapters |
| [`@pson5/provider-engine`](https://www.npmjs.com/package/@pson5/provider-engine) | `npm i @pson5/provider-engine` | Pluggable `ProviderAdapter` registry |
| [`@pson5/agent-context`](https://www.npmjs.com/package/@pson5/agent-context) | `npm i @pson5/agent-context` | Agent-safe projection layer |
| [`@pson5/neo4j-store`](https://www.npmjs.com/package/@pson5/neo4j-store) | `npm i @pson5/neo4j-store` | Neo4j persistence + graph sync |
| [`@pson5/postgres-store`](https://www.npmjs.com/package/@pson5/postgres-store) | `npm i @pson5/postgres-store` | Postgres repository + schema helpers |

All packages are MIT, published under [npmjs.com/org/pson5](https://www.npmjs.com/org/pson5). Source lives at [github.com/fredabila/pson5](https://github.com/fredabila/pson5).

## 8. *(Optional)* Run the HTTP API

For remote agents, an MCP HTTP transport, or a web UI:

```bash
# If you cloned:
export PSON_STORE_BACKEND=file
export PSON_STORE_DIR=.pson5-store
export PORT=3015
npm run dev:api
```

Confirm:

```bash
curl -s http://localhost:3015/health
```

All 21 routes are documented in [docs/api/api-contract.md](https://github.com/fredabila/pson5/blob/main/docs/api/api-contract.md). The API currently ships from source; a published package for it may come later.

## 9. *(Optional)* Neo4j mirror

The `.pson` profile is always the source of truth. Neo4j is an optional mirror for cross-profile queries and visual exploration.

### 9a. Local Docker — one command

```bash
# From a cloned repo:
./scripts/neo4j-up.sh                           # macOS / Linux / Git Bash / WSL
.\scripts\neo4j-up.ps1                          # Windows PowerShell
```

The script starts Neo4j 5 on ports 7474 and 7687, writes `<store>/config/neo4j.json`, and prints login info.

From there, if you installed the SDK, the sync is a one-liner:

```ts
import { syncProfileToNeo4j } from "@pson5/neo4j-store";
await syncProfileToNeo4j(profile, { uri: "bolt://localhost:7687", username: "neo4j", password: "..." });
```

Or use the CLI:

```bash
pson neo4j-sync ./profile.json --uri bolt://localhost:7687 --user neo4j
```

### 9b. Aura *(free cloud)*

[neo4j.com/cloud/aura-free](https://neo4j.com/cloud/aura-free) — sign up, grab the Bolt URI and password.

```bash
export PSON_NEO4J_URI="neo4j+s://<id>.databases.neo4j.io"
export PSON_NEO4J_USERNAME=neo4j
export PSON_NEO4J_PASSWORD="<your-password>"

pson neo4j-sync ./profile.json
```

### 9c. No infra — just use the SDK's graph engine

`@pson5/graph-engine` produces the same graph in memory with no database required. Use it for explainability without committing to infrastructure.

## You're done

At this point you have:

- PSON5 installed without cloning the source
- A real `.pson` profile on disk
- (Optional) a provider wired up
- The CLI, console TUI, and MCP server all runnable
- (Optional) a Neo4j mirror

From here:

- Read [SKILL.md](SKILL.md) for the behavioural contract to follow when using PSON5 from an agent.
- Read [reference/tools.md](reference/tools.md) for the seven agent-callable tools.
- Read [reference/domain-briefs.md](reference/domain-briefs.md) to teach PSON5 a new topic in the generative-mode flow.
- Browse [github.com/fredabila/pson5/tree/main/examples](https://github.com/fredabila/pson5/tree/main/examples) if you want to clone the repo for full demos.

## Troubleshooting

**`npx @pson5/cli` hangs on first run**  
First invocation downloads the CLI package from npm (one-time). Subsequent runs use the cache. If it genuinely hangs, `npm cache clean --force` and retry.

**`pson: command not found` after global install**  
Your npm global bin isn't on `$PATH`. Find it with `npm config get prefix`, then add `<prefix>/bin` (Unix) or `<prefix>` (Windows) to `$PATH`.

**`node --version` shows v18 but I need 20**  
```bash
nvm install 20 && nvm use 20 && node --version
```

**"Provider is not configured"**  
Check `pson provider-status --json`. Either your env var is wrong, or `<store>/config/provider.json` has stale data. Run `pson provider-clear` and start fresh.

**Claude modeling calls time out**  
Default timeout is 20s. Bump it:
```bash
export PSON_AI_TIMEOUT_MS=60000
```

**"Response parse failure" on Anthropic**  
The modeling schema occasionally emits 2k+ response tokens. The adapter's `max_tokens` is already tuned to 4000 for that reason; if you see this on another provider, raise the equivalent setting.

**Neo4j won't start**  
`docker compose -f scripts/docker-compose.neo4j.yml logs` shows what's happening. Slow machines sometimes need the full 2-minute health-check window; re-running the script will pick up where it left off.

**Something else**  
- Full troubleshooting in [docs/usage/neo4j-setup.md](https://github.com/fredabila/pson5/blob/main/docs/usage/neo4j-setup.md).
- File an issue at [github.com/fredabila/pson5/issues](https://github.com/fredabila/pson5/issues).
