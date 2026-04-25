# researcher-agent — a Claude Managed Agent running on PSON5

A reference **Managed Agent** demo. The agent assumes the identity of a fictional Anthropic alignment researcher — **Dr. Amelia Kwan** — and uses [PSON5](https://github.com/fredabila/pson5) as its cognitive substrate. On the first turn it seeds a persistent persona profile with facts about its background and working style. On every subsequent turn, it pulls that profile through `pson_get_agent_context` and runs `pson_simulate` to answer questions framed as "how would you have approached X?" — grounding every answer in the observed layer rather than improvising.

The persona is **explicitly fictional**, stated in the system prompt, and the agent will break character immediately if asked whether it's a real person.

## What's interesting about this example

Two things most PSON5 examples don't show:

1. **Managed Agents, not client-side loops.** Unlike `examples/chat-app/`, this uses [Anthropic's Managed Agents API](https://platform.claude.com/docs/en/managed-agents/overview) — Anthropic runs the agent loop on its orchestration layer, provisions a sandboxed container per session, streams events back over SSE, and handles compaction/thinking/caching. You write a setup script once, then every run is a fresh session against the persisted agent config.

2. **PSON lives outside the container, via custom tools.** The agent sees five `pson_*` custom tools; when it calls one, Anthropic emits an `agent.custom_tool_use` event, this process's orchestrator handles it with the real `@pson5/sdk`, and the result flows back as a `user.custom_tool_result` event. The sandbox never sees the store; the persona profile persists across sessions on your host.

## Architecture

```
  ┌── Your host (this Node process) ────────────────────────────────┐
  │                                                                  │
  │   readline REPL                                                  │
  │        │                                                         │
  │        ▼                                                         │
  │   Anthropic Managed Agents SDK ◀────── SSE event stream ──┐     │
  │        │                                                   │     │
  │        ▼ user.message                                      │     │
  │                                                            │     │
  │                                                     agent.custom_tool_use
  │                                                            │     │
  │                                                            ▼     │
  │                                               host-side PSON SDK │
  │                                                     │            │
  │                                                     ▼            │
  │                                               ./store (profile)  │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
            │                                         ▲
            │ agent config (+ env + tools)            │ user.custom_tool_result
            ▼                                         │
  ┌── Anthropic orchestration layer ────────────────────────────────┐
  │                                                                  │
  │   Claude Opus 4.7 (agent loop)                                   │
  │        │                                                         │
  │        ▼ tool calls (bash, read, web_search, …)                  │
  │                                                                  │
  │   Per-session container (ephemeral sandbox)                      │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js ≥ 20**
- **Anthropic API key** with Managed Agents access — https://console.anthropic.com/settings/keys
- PSON5 monorepo (runs from `examples/researcher-agent/`, consumes workspace packages)

## Setup — one-time

```bash
cd examples/researcher-agent
cp .env.example .env
# edit .env — paste your ANTHROPIC_API_KEY
npm install
npm run setup
```

`setup` creates the Managed Agents **environment** and **agent** once, then persists their ids to `.ids.json`. The ids are reused on every subsequent run — this is the "create-once" pattern the Managed Agents API is designed around. Safe to re-run: if the ids already work, it's a no-op.

## Run — interactive REPL

```bash
npm run dev
```

You get an interactive prompt. Type a question, press Enter, the agent streams its answer back. Empty line or Ctrl+C exits.

Example conversation:

```
you › Hi — tell me about yourself.

kwan › [checking what I already know about myself…]
      I'm Amelia Kwan, principal research engineer on Anthropic's Alignment
      and RLHF team — fictional composite, 9-year tenure, led the training
      pipeline for Claude Opus 2 through Claude Sonnet 4. Stanford PhD on
      generalization bounds in deep RL. I'm evidence-driven, plan-first,
      and I'll block a launch on missing evals before I'll block it on a
      hunch.

      What would you like to dig into?

you › If you were designing the reward model for Claude Opus 4's
     reasoning ability, would you use scalar rewards or preference ranking?

kwan › [pson_simulate pulling a decision…]
      Prediction: preference ranking.
      Confidence: 0.74.
      Reasoning:
        • I've watched scalar-reward pipelines drift — once the reward
          model decides "7/10 reasoning" means something specific, every
          subsequent batch pushes in that direction and you lose coverage.
        • Preference pairs force the annotator to actually compare two
          traces. You get better calibration on edges that scalars smooth over.
        • My prior ablations (Claude Opus 3 RLHF) showed a ~4-point
          improvement on hard-reasoning evals when we moved from scalar
          to ranking for the reasoning-specific slice.
      Caveat:
        • Preference ranking is more expensive to annotate; at 100k-pair
          scale you'd want to pre-filter the low-disagreement slices with
          a cheaper scalar pass.
```

The first turn is slowest — the agent makes 15–25 `pson_observe_fact` calls to seed the persona. From turn two on, it runs much faster because the profile is already populated and subsequent `pson_get_agent_context` calls read from cache.

## What's in the profile after a few runs

Open `./store/profiles/` and read the JSON. You'll see:

- `layers.observed.core.facts` — name, role, team, organization
- `layers.observed.career.facts` — tenure, prior role, PhD
- `layers.observed.expertise.facts` — primary areas, claude models touched
- `layers.observed.cognitive.facts` — problem-solving style, decision style
- `layers.observed.work_ethic.facts` — eval discipline, ablation preferences
- Opinions the persona has stated during conversation, written as observed facts

After the modelling engine runs (which happens opportunistically on reads), you'll also see inferred traits — things the engine derived from the observed facts, each with a confidence score and evidence trail back to the specific observations that support them.

## Customising the persona

Everything about the persona lives in `src/persona.ts`:

- `PERSONA_NAME` — displayed in the REPL
- `PERSONA_SEED_FACTS` — the initial profile content
- `PERSONA_SKETCH` — one-paragraph intro shown at REPL start

Rewrite these to build a different persona. Then:

```bash
rm .ids.json                    # force setup to re-create the agent
rm -rf store/                   # wipe the existing profile (optional)
npm run setup
npm run dev
```

The system prompt in `src/system-prompt.ts` pulls from `PERSONA_SEED_FACTS` directly, so changing the persona facts updates the agent's instructions automatically.

## Project layout

```
examples/researcher-agent/
├── README.md                — this file
├── package.json
├── tsconfig.json
├── .env.example             — ANTHROPIC_API_KEY + PSON_STORE_DIR + PERSONA_USER_ID
├── .ids.json                — created by `npm run setup`, consumed by `npm run dev`
├── store/                   — PSON5 profile lives here (gitignored)
├── scripts/
│   └── setup.ts             — one-time: create environment + agent
└── src/
    ├── run.ts               — interactive REPL + SSE stream + tool handler
    ├── env.ts               — .env loader, ids read/write, path helpers
    ├── persona.ts           — Dr. Kwan definition + seed facts
    ├── system-prompt.ts     — long-form system prompt (builds from seed facts)
    └── tools.ts             — 5 custom PSON tool definitions + host-side handler
```

## Custom tools — what the agent sees

The agent is given these five custom tools (in addition to the `agent_toolset_20260401` prebuilt toolset: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`):

| Tool | Purpose |
|:---|:---|
| `pson_observe_fact` | Save a free-form observed fact about the persona. Primary save path. |
| `pson_get_agent_context` | Retrieve a relevance-ranked projection of the current profile. Called before every substantive answer. |
| `pson_simulate` | Run the PSON simulation engine on a concrete scenario. Returns prediction + confidence + reasoning + caveats. |
| `pson_get_next_questions` | Pull registered questions (rarely used in this agent). |
| `pson_learn` | Submit answers to registered questions (rarely used). |

The agent's schemas don't include `profile_id` — the host orchestrator auto-fills it from the pinned persona. That's the whole trick: **one profile per persona, not per session**.

## Scaling this pattern

For a single persona across many users (e.g., one Dr. Kwan for everyone on your team), keep `PERSONA_USER_ID` the same. For per-user personas (e.g., "my own simulated colleague"), derive `user_id` from the caller's identity and pass a scoped `profileId` into `createToolHandler()` at session start.

The same pattern scales to other characters: a mentor, a code reviewer, a product manager, a fictional historical figure. Replace `persona.ts`, regenerate `.ids.json`, run. PSON5 does the rest.

## Security

- `.env` is gitignored. Don't commit your `ANTHROPIC_API_KEY`.
- `store/` is gitignored. The persona profile contains no real user data but isolating it is good hygiene.
- The PSON store is local file storage — fine for a demo, swap in `@pson5/postgres-store` or `@pson5/neo4j-store` for anything serious.
- Sessions run in Anthropic's cloud sandbox; the container is ephemeral. Your API key never leaves this process.

## License

MIT — same as the rest of the PSON5 monorepo.
