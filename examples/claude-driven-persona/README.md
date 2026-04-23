# Claude-driven persona — the zero-registry demo

PSON5 starts empty. No pre-registered questions, no domain module file. Everything — question generation and user-simulation — comes from Claude.

## What this demonstrates

Two concurrent Claude loops wrapped around the PSON5 pipeline:

1. **Question generator.** Given a single-paragraph domain brief and the current profile state, Claude proposes the next net-new questions (id, prompt, type, choices, information_targets, rationale). The generated questions are appended to the PSON5 session's `generated_questions` array and immediately become valid targets for `submitLearningAnswers`.
2. **Josh simulator.** A second Claude call answers each generated question as Josh would — in character, in his voice, using the choice values when the question is single-choice.

After every answered turn, PSON5's pipeline runs normally: observed answer → modeling → state → graph → save. The updated profile is fed back into the question generator's next turn, so Claude can ask increasingly specific, confidence-gap-closing questions.

## Scope

Domain brief covers **ten interlinked areas** of tech talent intelligence:

- tech stack depth
- engineering principles and taste
- career trajectory
- compensation philosophy
- work style
- learning and growth
- collaboration and leadership
- side projects
- industry interests
- values and tradeoffs

Default run is 24 turns, usually 12–15 distinct observed facts spanning all ten areas.

## Run

```bash
# build the workspace first
npm install && npm run build

# then run with Claude (Haiku recommended for speed + cost)
ANTHROPIC_API_KEY=sk-ant-... \
PSON_AI_PROVIDER=anthropic \
PSON_AI_MODEL=claude-haiku-4-5-20251001 \
node examples/claude-driven-persona/run.mjs
```

Any OpenAI-compatible model works too (swap to `PSON_AI_PROVIDER=openai` or `=openai-compatible` with a matching `PSON_AI_BASE_URL`). The Josh simulator hits Anthropic directly because its prompt is tuned to that API shape — adapting it to OpenAI is a few lines.

## Outputs

A fresh `output/` directory beside this README with:

| File | Contents |
| --- | --- |
| `profile.json` | Full `.pson` export (redaction level: full) |
| `transcript.json` | Every question, answer, Josh's internal reasoning, and the revision after each turn |
| `graph.cypher` | Cypher statements ready to paste into Neo4j Browser |
| `graph.html` | Self-contained D3 force-layout viewer of `profile.knowledge_graph` plus the three agent contexts and three simulations |

### `graph.html`

Open it directly in any modern browser. No server needed. Click-and-drag to reposition nodes; scroll to zoom. The sidebar shows:

- node-type distribution (observed = amber, inferred = phosphor green, simulated = cool blue)
- the three agent contexts produced during the run (recruiting-outreach, career-coaching, team-fit-check)
- the three scenario simulations (cold outreach, FAANG offer, indie launch)

### `graph.cypher`

If you do have a Neo4j instance running, paste the file into Neo4j Browser. The nodes become `:PsonNode`, each with `{id, type, label, data}`. Relationships use the edge type upper-cased (`CAUSES`, `REINFORCES`, `CORRELATES_WITH`, …). `pson neo4j-sync <profile_id>` is the production path — this file is for manual exploration.

## What the run looks like

```
══ Provider ══
  registered adapters     openai, anthropic, openai-compatible
  provider                anthropic
  model                   claude-haiku-4-5-20251001

══ Initialize profile (empty domain registry) ══
  profile_id              pson_...
  domains                 core, tech-talent-intelligence
  registered questions    0 (no domain module loaded)

══ Claude-driven question loop ══

  turn 1 [broad_scan]  When you're picking a stack for a genuinely hard infra problem, ...
      id=tech_primary_stack  type=single_choice  domain=...  targets=[primary_stack]
  Josh: rust
      rev→2  confidence=0.16  gaps=N

  turn 2 [broad_scan]  ...
  ...
```

Every question is authored by Claude. Every answer is Claude-as-Josh. PSON5 handles the bookkeeping, the layering boundary, decay, redaction, and audit.

## Extending

- Replace `josh-persona.json` to simulate a different user.
- Replace `domain-brief.json` to collect an entirely different kind of data (cooking preferences, financial risk profile, health routines, learning goals for a tutor agent — anything you can describe in one paragraph).
- Point `PSON_AI_PROVIDER` at `openai` or `openai-compatible` to use any OpenAI-family endpoint.

## Related

- [Provider adapters](../../docs/usage/provider-adapters.md)
- [Acquisition engine](../../docs/usage/acquisition-engine.md)
- [PSON profile schema](../../docs/schemas/pson-schema.md)
- The preceding [Josh tech-employment demo](../josh-tech-persona/) uses a hand-registered domain file — this demo is the inverse (zero-registry).
