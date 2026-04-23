# pson-agent — the PSON5 agent skill

This directory is a self-contained agent skill for PSON5. Drop it into any agent framework's `skills/` directory and the agent will be able to install, configure, and operate PSON5 end-to-end — collecting user signal, building agent-safe context, running simulations, and (optionally) starting a Neo4j mirror.

## Layout

```
pson-agent/
├── SKILL.md                    ← entry point; read this first
├── setup.md                    ← zero-to-running via `npx @pson5/cli` (no clone)
├── README.md                   ← this file
├── reference/
│   ├── transports.md           ← SDK · API · CLI · MCP side by side
│   ├── tools.md                ← the seven tools, full request/response shapes
│   ├── domain-briefs.md        ← how to compose a good brief
│   ├── providers.md            ← provider adapters, env vars, custom models
│   ├── neo4j.md                ← start + sync
│   └── safe-prompting.md       ← prompt-construction rules
└── examples/
    ├── quickstart.ts           ← four-line starter
    ├── generative-loop.ts      ← zero-registry flow in <80 lines
    └── agent-loop.ts           ← one full agent turn using the seven tools
```

## Reading order

1. **[SKILL.md](SKILL.md)** — behavioral contract and when to use what
2. **[setup.md](setup.md)** — install, configure a provider, run the demo
3. **[reference/tools.md](reference/tools.md)** — the seven tools
4. **[reference/domain-briefs.md](reference/domain-briefs.md)** when you hit generative mode
5. **[reference/neo4j.md](reference/neo4j.md)** when you want a graph mirror

## External canonical source

- [github.com/fredabila/pson5](https://github.com/fredabila/pson5)

When a file here disagrees with the repo, the repo wins.
