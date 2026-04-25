# chat-app-pro — PSON5 + Claude + Neon Postgres + generative flow + live graph

The production-shape version of the `chat-app` example. Three things the simpler original doesn't do:

| Feature | Simple chat-app | chat-app-pro |
|:---|:---:|:---:|
| Chat UI with streaming + tool calls | ✅ | ✅ |
| Cloud-backed profile storage | ❌ file | ✅ **Neon Postgres** |
| LLM-driven generative question flow | ❌ | ✅ `pson_generate_domain_questions` |
| Live force-directed graph visualiser | ❌ | ✅ with provenance edges |
| Survives process restarts | ❌ | ✅ |

Same Claude-powered chat loop, same three-layer PSON5 invariant, same tool-use agent pattern — just backed by real infrastructure and with two new surfaces (generative flow + graph).

## Architecture

```
  ┌─ Browser ───────────────────────────────────────────────────┐
  │   React chat UI                                             │
  │   · messages stream via SSE                                 │
  │   · side panel toggles between Profile and Graph views      │
  │   · graph runs live physics (repulsion + springs + damping) │
  └──────────────────┬──────────────────────────────────────────┘
                     │ /api/chat (SSE) · /api/profile · /api/graph
                     ▼
  ┌─ Node backend ──────────────────────────────────────────────┐
  │   Anthropic Messages API · tool-use loop                    │
  │   PSON5 SDK with Postgres-backed store adapter              │
  │     ↓                                                        │
  │   Neon Postgres (pooled connection over TLS)                │
  │     · pson_profiles_current   — latest snapshot, JSONB      │
  │     · pson_profile_revisions  — append-only revision log    │
  │     · pson_user_profile_index — user → profile lookup       │
  └─────────────────────────────────────────────────────────────┘
```

## Three custom ideas worth noting

**1. The store adapter is the integration seam.** `server/db.ts` builds one `ProfileStoreAdapter` wrapping `pg.Pool` via `@pson5/postgres-store`, and every SDK call passes `storeOptions = { adapter, rootDir }`. Profile documents go to Postgres; learning-session JSON (ephemeral) stays on disk. You could swap Neon for self-hosted Postgres, swap `@pson5/postgres-store` for a custom repository, or layer Redis caching — the SDK never cares.

**2. `pson_generate_domain_questions` is a custom tool.** Not in the built-in SDK tool set — this app adds it locally in `server/chat-session.ts`. When Claude calls it with a domain brief (id, title, description, target_areas), the handler opens a `LearningSession`, calls `deriveGenerativeQuestions()` from `@pson5/provider-engine` (Claude authors the questions), and registers them via `appendGeneratedQuestions()`. The returned question ids are valid inputs for `pson_learn` on subsequent turns.

**3. The graph is built on the server.** `server/graph.ts` walks the profile and emits `{ nodes, edges }` with three edge kinds: `has_node` (root → layer entries), `evidence` (inferred traits ← observed facts that support them), `derivation` (simulated predictions ← inferred traits they cite). The browser just runs physics on what it receives; there's no PSON-internal knowledge leaking into the UI.

## Prerequisites

- **Node.js ≥ 20**
- **Anthropic API key** — https://console.anthropic.com/settings/keys
- **Neon Postgres database** — https://neon.tech (free tier is enough). You need the pooled connection string (ends `-pooler.<region>.aws.neon.tech`).

## Setup

```bash
cd examples/chat-app-pro
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://<user>:<pw>@ep-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require
PSON_AI_PROVIDER=anthropic
PSON_AI_MODEL=claude-sonnet-4-6
```

Install, then bootstrap the schema:

```bash
npm install
npm run db:init
```

`db:init` runs three `create table if not exists` statements against Neon — idempotent, safe to re-run.

## Run

```bash
npm run dev
```

- Backend on `http://localhost:3031`
- Vite dev server on `http://localhost:5174`

Visit `http://localhost:5174`. Say hi. Tell it something about yourself. Flip between the **Profile** and **Graph** tabs in the top right.

## Example conversation

```
you › My name is Frederick and I just moved to Berlin.
     [pson_observe_fact core/preferred_name = Frederick]
     [pson_observe_fact personal/current_city = Berlin]

you › Help me think about where to eat tonight.
     [pson_generate_domain_questions domain_id=dining_tonight …]
     → four questions generated on cuisine, noise level, party size, price tier
     The assistant asks the first one; you answer; pson_learn lands it;
     the assistant asks the next one; four questions later the flow stops.

you › Given what you know, where would I eat tonight?
     [pson_get_agent_context intent="restaurant recommendation"]
     [pson_simulate scenario=dining_tonight …]
     Prediction + confidence + reasoning + caveats, grounded in the facts
     just collected.
```

Open the **Graph** tab at any point to see the observed facts, inferred traits, and simulated predictions laid out as a force-directed graph — observed on the outer shells, inferred linked back to the observations that support them via amber evidence edges, simulations connected to the inferred traits they cite via cool-blue derivation edges.

## Production build

```bash
npm run build
npm start
```

One process on `PORT` serves both the API and the built frontend from `web/dist/`.

## Vercel deployment

The app is structured so the backend can run as a single Node service and the frontend as static files. To deploy on Vercel:

1. Push to a git repo.
2. Import into Vercel; set the root directory to `examples/chat-app-pro/`.
3. Environment variables: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `PSON_AI_PROVIDER=anthropic`, `PSON_AI_MODEL=claude-sonnet-4-6`.
4. Build command: `npm run build`.
5. Output directory: `web/dist/`.
6. For the backend API, add a Vercel Serverless Function (or run the server on Railway / Fly / Render and have the Vercel frontend proxy to it).

For your Neon pooled connection string, the important flags are `sslmode=require` and `channel_binding=require`. Keep the pooled endpoint for most traffic; only use `DATABASE_URL_UNPOOLED` if a library specifically needs it.

## Security posture (this is a demo, not a product)

- `.env` is gitignored. Don't commit it.
- Any credential you paste into `.env` is your responsibility to rotate if it leaks.
- Profile documents are not encrypted at rest — Neon's disk encryption is the floor; layer application-level crypto via `@pson5/privacy` if you store anything sensitive.
- No auth in this demo — anyone on `localhost:5174` sees the profile, anyone reaching `:3031` can create profiles. Put this behind real auth before exposing.
- The `user_id` comes from `localStorage` and is trivially spoofable; for multi-tenant deployments, derive `user_id` from a real identity provider.

## Project layout

```
examples/chat-app-pro/
├── README.md                    — this file
├── package.json
├── tsconfig.json
├── .env.example
├── scripts/
│   └── init-db.ts               — one-time schema bootstrap
├── server/
│   ├── index.ts                 — http + SSE + tool loop + /api/graph
│   ├── chat-session.ts          — session state + custom generative-flow tool
│   ├── graph.ts                 — profile → {nodes, edges}
│   ├── db.ts                    — pg.Pool + Postgres adapter singletons
│   └── tsconfig.json
└── web/
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx              — layout + SSE orchestration
        ├── api.ts               — SSE parser + REST helpers
        ├── styles.css
        └── components/
            ├── TopBar.tsx       — pills + Profile/Graph toggle + Reset
            ├── Composer.tsx
            ├── Message.tsx
            ├── ProfilePanel.tsx
            └── GraphPanel.tsx   — force-directed SVG visualiser
```

## License

MIT.
