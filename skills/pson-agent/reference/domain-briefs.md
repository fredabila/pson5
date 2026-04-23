# Domain briefs — how to compose one

A **domain brief** is the only input PSON5 needs to enter zero-registry mode. Claude (or any configured model) uses it to invent every question from scratch, tuned to the current profile state. A good brief produces coherent, non-repetitive, confidence-gap-closing questions. A lazy brief produces vague ones.

## Shape

```ts
interface DomainBrief {
  id: string;           // snake-case, stable across runs
  title: string;        // short human-readable name
  description: string;  // one paragraph of intent
  target_areas: string[]; // 5-10 short identifiers
  sensitivity?: "low" | "standard" | "restricted";
  max_questions?: number;
}
```

## Writing rules

### `id`

- lowercase, snake-case or kebab-case
- stable (don't rename it between runs — it's how you scope analysis)
- meaningful: `tech-talent-intelligence`, `dietary-preferences`, `financial-risk-tolerance`
- not meaningful: `d1`, `my-domain`, `test`

### `title`

- 3–8 words
- human-readable (used in logs, UI, audit)

### `description` — the most important field

This is the paragraph the model reads to understand what to ask. Good descriptions explain:

1. **Who** the profile is for downstream (a recruiting agent? a coach? a tutor?)
2. **Why** the data matters — what decision will it drive?
3. **How** to probe — breadth vs depth, direct vs indirect
4. **What** to avoid — topics or framings that would be counterproductive

Rules of thumb:

- Write in plain English, not bullet-pointed specs. The model reads this as prose.
- 2–5 sentences. More than that and the model starts hallucinating extra targets.
- Reference the `target_areas` by name so the model knows which labels to use.
- Name the downstream agent — "recruiting assistant", "tutor agent" — so the model understands the output's purpose.

### `target_areas` — 5 to 10 of them

- Short, stable, lowercase identifiers (snake_case)
- Describe **what the data is about**, not what the data will be
- Good: `tech_stack_depth`, `compensation_philosophy`, `learning_and_growth`
- Bad: `knows_rust`, `has_120k_salary`, `likes_courses`

These become the dot-paths in `layers.observed` — Claude's generated questions map their `information_targets` field to subsets of this list.

### `sensitivity`

- `"low"` — default. Tech preferences, work style, general tastes.
- `"standard"` — most profile data. Career trajectory, compensation ranges.
- `"restricted"` — flags the model to be extra careful. Health, financial details, political views, anything you'd want redacted by default.

PSON5 enforces the Privacy model's sensitivity rules regardless of what the brief says, but the brief tells the question generator how to frame its probes.

### `max_questions`

Soft cap. The model can stop earlier when it detects saturation. Common values:

- `8` for a light onboarding
- `16` for moderate depth
- `24–32` for a rich profile (what the Josh demo uses)
- Going past 40 hits fatigue for most users

## Examples

### A tech-recruiting brief (from the Josh demo)

```json
{
  "id": "tech-talent-intelligence",
  "title": "Tech talent intelligence — recruiting / employment / career",
  "description": "Build a rich understanding of how this engineer works, what they want out of their career, where they thrive, what they avoid, and what signals would move them. The output will be used by a recruiting assistant plus a long-term career-coaching agent. We care about breadth across ten interlinked areas: technical depth and stack, engineering principles and taste, career trajectory and current role, compensation philosophy, work style and environment, learning and growth preferences, collaboration and leadership, side projects and public work, industry interests and thesis, and values / tradeoffs they refuse to make.",
  "target_areas": [
    "tech_stack_depth",
    "engineering_principles",
    "career_trajectory",
    "compensation_philosophy",
    "work_style",
    "learning_and_growth",
    "collaboration_and_leadership",
    "side_projects",
    "industry_interests",
    "values_and_tradeoffs"
  ],
  "sensitivity": "standard",
  "max_questions": 24
}
```

### A tutoring brief

```json
{
  "id": "student-learning-profile",
  "title": "Student learning profile for an adaptive tutor",
  "description": "Understand how this student learns best so a tutor agent can match pacing, modality, and difficulty to them. We need to map their prior knowledge, confidence, motivation triggers, friction points, typical study environment, and how they handle feedback. The output feeds a real-time tutor that paces Socratic dialogue based on this profile, so be thorough on learning mode, explanation preference, and failure-recovery style.",
  "target_areas": [
    "prior_knowledge",
    "learning_mode",
    "explanation_preference",
    "motivation_triggers",
    "friction_points",
    "study_environment",
    "feedback_handling",
    "failure_recovery"
  ],
  "sensitivity": "standard",
  "max_questions": 16
}
```

### A health-coaching brief (restricted sensitivity)

```json
{
  "id": "fitness-and-recovery",
  "title": "Fitness + recovery habits for a coaching agent",
  "description": "Understand the user's current movement habits, sleep patterns, energy rhythms, recovery practices, and goals — without probing medical history, diagnoses, or prescription use. The output will drive a weekly-plan generator that respects the user's actual constraints rather than prescribing an idealised routine. Stay specific to observable behaviour (how often they train, typical session duration, sleep start/end windows) rather than asking for clinical or demographic data.",
  "target_areas": [
    "training_frequency",
    "session_style",
    "energy_rhythm",
    "sleep_window",
    "recovery_practices",
    "current_constraints",
    "motivation_style",
    "goals"
  ],
  "sensitivity": "restricted",
  "max_questions": 12
}
```

## Strategies during the loop

When you call `deriveGenerativeQuestions(...)`, the `strategy` field hints at *how* the model should generate:

- `"broad_scan"` — cover all `target_areas` at a shallow level first (use on turns 1–5)
- `"depth_focus"` — dig into the area with the largest confidence gap (middle of the session)
- `"contradiction_probe"` — the session has contradiction flags; ask questions designed to resolve them
- `"follow_up"` — the most recent answer opened a rabbit hole worth pursuing

Alternate strategies as the session matures. The Josh demo cycles: `broad_scan` → `depth_focus` → `contradiction_probe`. That's a reasonable default.

## When the model calls `stop: true`

The response includes `stop: boolean` and `stop_reason: string | null`. When `stop === true`, **do not keep asking**. The model has detected that:

- the brief is saturated across all `target_areas`, or
- fatigue is high and additional questions would yield diminishing signal, or
- the user would experience survey burnout

Respect the signal. The stop reason is useful to log and sometimes worth showing to the user ("We have enough to work with for now — ask me again if you want to go deeper on X").

## Related

- [../SKILL.md](../SKILL.md) — the behavioral contract
- [../examples/generative-loop.ts](../examples/generative-loop.ts) — the full zero-registry loop in <80 lines
- [tools.md](tools.md) — `pson_get_next_questions`, `pson_learn`
- [github.com/fredabila/pson5 · examples/claude-driven-persona](https://github.com/fredabila/pson5/tree/main/examples/claude-driven-persona) — a live run
