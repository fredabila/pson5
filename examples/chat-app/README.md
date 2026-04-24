# PSON5 Chat — a reference chatbot with persistent user profiles

A small, elegant chatbot built on **Claude + the PSON5 SDK**. Every conversation builds a structured user profile the assistant can reason over — observed facts, inferred traits, and simulated predictions each live in their own layer, visible in real time in the side panel. Nothing about the user is stored as an unstructured blob.

This example is intentionally minimal: one backend process, one frontend bundle, one file-backed PSON store. It's the kind of shape you'd extract into its own repo the moment you want to ship something real.

## What it demonstrates

- **Claude tool-use loop** wired to PSON's seven agent tools via `createPsonAgentToolExecutor` from `@pson5/sdk`
- **SSE streaming** of assistant text + tool call transcripts
- **Live three-layer profile panel** that updates after every turn (observed / inferred / simulated)
- **Session continuity** via `localStorage` — the profile survives a page reload because the PSON store is on disk
- **Layer separation enforced by the SDK**, not by hope — the assistant never reads the raw profile, only the projected `pson_get_agent_context` output

## Prerequisites

- **Node.js ≥ 20** (the workspace requires it)
- **Anthropic API key** — https://console.anthropic.com/settings/keys
- Run from inside the PSON5 monorepo — this package consumes `@pson5/*` via npm workspaces, so a standalone install needs the published packages (0.2.0+).

## Setup

```bash
cd examples/chat-app
cp .env.example .env
# edit .env — paste your ANTHROPIC_API_KEY
npm install
```

First install pulls in Vite, React, the Anthropic SDK, `tsx`, and the workspace PSON packages — ~350 MB.

## Run

```bash
npm run dev
```

The `dev` script starts both processes concurrently:

- **Backend** on `http://localhost:3030` — the chat API + PSON store + tool loop
- **Vite dev server** on `http://localhost:5173` — the UI, with `/api/*` proxied to the backend

Open http://localhost:5173 and say something to the assistant. Try:

> *"I'm a systems engineer who turned down two FAANG offers last year. I'd rather work on something small that matters than big and stable."*

Watch the **observed** lane fill up. Over a few turns, the **inferred** lane will pick up traits. Ask:

> *"Given what you know about me, what would you predict about a Series A founding-engineer role?"*

…and watch the **simulated** lane populate with Claude's grounded prediction. The tool calls Claude made to get there are visible inline in the message.

## Production build

```bash
npm run build          # compiles the server + bundles the web app
npm start              # serves both from the one backend (reads web/dist/)
```

In production mode the backend serves the built frontend from `dist/` on the same port as the API, so a single process binds port 3030 (or whatever you set `PORT` to).

## Project layout

```
examples/chat-app/
├── package.json
├── .env.example
├── README.md
├── server/
│   ├── index.ts              — http server, SSE streaming chat endpoint
│   ├── chat-session.ts       — per-browser-tab session + PSON tool executor
│   └── tsconfig.json
└── web/
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx           — React entry
        ├── App.tsx            — layout + streaming orchestration
        ├── api.ts             — SSE parser + profile-snapshot fetch
        ├── styles.css         — dark-editorial aesthetic
        └── components/
            ├── TopBar.tsx
            ├── Composer.tsx
            ├── Message.tsx
            └── ProfilePanel.tsx
```

## Where Claude reads from / writes to

The backend sends Claude a system prompt telling it:

1. The user's application `user_id` and the resolved PSON `profile_id`
2. To call `pson_get_agent_context` before answering personal questions (redaction-aware, consent-scoped)
3. To call `pson_learn` whenever the user states a fact about themselves
4. To call `pson_simulate` for "what would I likely do?" questions
5. To be concise

On every user turn the server:

1. Ensures a PSON profile exists for the user (`initProfile` on first contact)
2. Makes a tool-capable `messages.create` call to Claude
3. Streams text blocks as `assistant-delta` SSE events
4. If Claude returns `stop_reason: "tool_use"`, executes each tool call through `createPsonAgentToolExecutor`, surfaces `tool-start` / `tool-end` events, and loops until Claude stops calling tools (up to 8 iterations)

## Env vars

| Variable | Default | Purpose |
|:---|:---|:---|
| `ANTHROPIC_API_KEY` | *(required)* | Claude auth |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Claude model id |
| `PORT` | `3030` | Backend port |
| `PSON_STORE_DIR` | `.pson5-store` | Where PSON writes `.pson` files |
| `CHAT_APP_LOG_TOOLS` | `false` | Log every tool call to stdout |

## Security posture (this is a demo)

- **No auth.** Anyone who can reach the server can speak to your Claude key. Do not expose this process to the internet without putting auth in front.
- **Per-browser userId.** The frontend generates a random `user_id` on first load and stores it in `localStorage`. Profiles are isolated by that id but it's trivially spoofable.
- **File storage.** `.pson5-store/` is a plain directory of JSON. Fine for local demo; swap in `@pson5/postgres-store` or `@pson5/neo4j-store` for anything serious.
- **Body-size cap.** The server caps request bodies at 1 MB to prevent OOM via large uploads.

See `docs/usage/agent-auth.md` in the root monorepo for the auth model to put in front of this.

## Troubleshooting

**`ANTHROPIC_API_KEY is not set`** — copy `.env.example` to `.env` and paste your key.

**Tool call fails with `provider is not configured`** — the PSON modeling engine tries to call the configured provider for AI-augmented modeling. Set `PSON_AI_PROVIDER=anthropic` and `PSON_AI_MODEL` (or run with the rule-based fallback — modeling still works, just with fewer AI-derived traits).

**The profile panel says "No profile for session yet"** — send at least one message. The profile is created lazily on first turn.

**Cross-session chaos** — click "Reset session" in the top bar to wipe localStorage and start fresh. The old profile stays in `.pson5-store/` under its original id.

## License

MIT — same as the rest of the PSON5 monorepo.
