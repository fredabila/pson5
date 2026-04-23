# Josh — tech-employment persona

End-to-end PSON5 demo. Creates a synthetic user (Josh, 21, self-taught systems engineer), registers a custom **tech-employment** domain, drives a real adaptive learning loop against a live Claude model, and then builds an agent-context projection plus a recruiting-scenario simulation.

## What this demonstrates

- **A custom domain.** `tech-employment-domain.json` ships seven questions covering years of experience, primary focus, favourite language, company stage, comp priority, work arrangement, and a free-text growth-signal probe.
- **The full pipeline on a real model.** `run.mjs` sends real requests to Claude for answer normalization, adaptive question selection, modeling insight, and simulation. Every call is audited to `<store>/audit/provider-call.jsonl`.
- **Agent-safe projection.** The recruiting agent only sees a filtered, relevance-ranked view of Josh — not the raw profile.
- **The observed / inferred / simulated boundary.** Colourised output keeps the three layers visibly distinct.

## Prerequisites

```bash
# Build the workspace first — this script imports from the compiled dist folders.
npm install
npm run build
```

## Run it

```bash
# With an Anthropic key (recommended — fast + cheap with Haiku):
ANTHROPIC_API_KEY=sk-ant-... \
PSON_AI_PROVIDER=anthropic \
PSON_AI_MODEL=claude-haiku-4-5-20251001 \
node examples/josh-tech-persona/run.mjs

# With an OpenAI key:
OPENAI_API_KEY=sk-... \
PSON_AI_PROVIDER=openai \
PSON_AI_MODEL=gpt-4.1-mini \
node examples/josh-tech-persona/run.mjs

# With a local Ollama or any OpenAI-compatible endpoint (no key needed for local):
PSON_AI_PROVIDER=openai-compatible \
PSON_AI_BASE_URL=http://localhost:11434/v1 \
PSON_AI_MODEL=llama3.1 \
node examples/josh-tech-persona/run.mjs
```

The script creates a fresh temp store under `$TMPDIR/pson5-josh-*`, writes the profile + audit trails there, and prints the location at the end so you can inspect it. It never writes your API key to disk.

## What the script outputs

1. **Provider** — which adapter was selected, the model, and which config source won (env vs file).
2. **Domain registration** — confirmation that the `tech-employment` module is loaded.
3. **Adaptive learning loop** — turn by turn: the question, whether it was registry-sourced or provider-rewritten, Josh's answer, and the revision after each submission.
4. **Observed facts** — what Josh explicitly told the system.
5. **Inferred traits** — what PSON5 derived from those facts (with confidence).
6. **State snapshot** — active states, their decayed confidence, matched triggers, and trigger boost.
7. **Agent-context projection** — what a recruiting agent would see, grouped by category, with relevance and confidence scores. `redaction_notes` surface anything that was filtered.
8. **Simulation** — a concrete recruiting scenario with prediction, confidence, reasoning, caveats, and alternatives.
9. **Graph explanation** — path-formatted support strings for the prediction.
10. **Audit trails** — number of revision-audit entries and the last few per-provider-call metrics.
11. **Safe export preview** — what a `safe`-level export looks like (user_id anonymised, ai_model dropped).

## Josh's answers

Hardcoded in `run.mjs` under `JOSH_ANSWERS` and `CORE_ANSWERS`. The profile is intentionally strong:

- 4–6 years, systems focus, Rust primary
- Wants early-stage startups, equity-over-base
- Full-remote, built-in-public style
- Growth signals: hard problems, staff-level mentorship, shipping founders, no process tax

Edit those dicts to play with different personas.

## Files

| File | Purpose |
| --- | --- |
| `tech-employment-domain.json` | Custom domain module loaded via `saveDomainModules(...)`. |
| `run.mjs` | The end-to-end script. |
| `README.md` | This doc. |

## Related docs

- [Quickstart](../../docs/usage/quickstart.md)
- [Provider adapters](../../docs/usage/provider-adapters.md)
- [Domain module spec](../../docs/domains/domain-module-spec.md)
- [Agent context](../../docs/usage/agent-context.md)
