# PSON5 teaser — storyboard

**Working title:** *Your agent doesn't know you*
**Length:** ~74 seconds (2220 frames @ 30fps) — v2 adds a knowledge-graph and benchmarks scene
**Format:** 1920 × 1080, H.264 MP4
**Aesthetic:** Dark editorial — matches the PSON5 landing. Fraunces for display, Inter for UI, JetBrains Mono for labels/code. Phosphor-green accent `#b6ff5c`. The signature three-colour grammar runs through the whole piece: **observed = amber** `#f5c76a`, **inferred = phosphor green** `#b6ff5c`, **simulated = cool blue** `#8ec7ff`.

**Pacing principle:** restrained. Every beat lands before the next one starts. No overlap between voiceover-style text and visual reveals. Silence is a valid design choice — a few moments are deliberately quiet to let the image breathe.

**No stock motion graphics. No generic SaaS rounded cards on a gradient.** Every shot uses typographic hierarchy as the primary visual device, with purposeful motion on a small number of signature elements.

---

## Scene 1 · HOOK — 0:00 – 0:06 · 180f

**Canvas** Solid `bg-0` (near-black), dotted-grid overlay masked-out at the bottom 20%.

**0:00 – 0:02** Fade up. A single **phosphor dot** appears dead-centre, pulsing at ~0.5Hz. Soft glow. Silent.

**0:02 – 0:04** Under the dot, type-on in **Fraunces 96pt**:

> Your agent doesn't know you.

**0:04 – 0:06** Below that, a hairline. Underneath, mono eyebrow at 18pt:

> EVERY CONVERSATION STARTS FROM SCRATCH

Beat. Quiet.

---

## Scene 2 · GENERIC WOUND — 0:06 – 0:16 · 300f

**Canvas** Split vertically down the middle. Thin hairline divider. Both panels share the same dotted-grid backdrop.

**Left panel** header: mono eyebrow `WITHOUT PSON5` · grey
**Right panel** header: mono eyebrow `WITH PSON5` · phosphor-green

**0:06** Both panels show an identical user message (right-aligned in each):

> Help me think about my next job move.

**0:07 – 0:08** Both agents show a typing indicator (three pulsing dots).

**0:08 – 0:12** Responses reveal by typewriter, in parallel:

**LEFT** (flat, desaturated, Inter 22pt):
> Here are some common steps for a job search:
> 1. Update your resume
> 2. Network on LinkedIn
> 3. Practice common interview questions
> 4. Tailor applications to each role
>
> *— sent · 0ms of context used*

**RIGHT** (rich, phosphor hairlines, same Inter size):
> Given you turned down two FAANG offers in the last 18 months and just hit 1.2k stars on your OS project, I don't think another platform role would land well. Founding engineer at a Series A is where your pattern actually points.
>
> *— sent · 42 observed facts · 9 inferred traits consulted*

**0:12 – 0:16** Both responses hang. Contrast is visible without narration. The left side has a faint static noise overlay at 4% opacity — stale, inert. The right side has a subtle phosphor breathing glow on the divider.

---

## Scene 3 · THREE LAYERS — 0:16 – 0:28 · 360f

**Canvas** Camera "pushes through" the right panel. Transition: the right panel's content rapidly slides up and out, replaced by the full-width three-lane layout.

**0:16 – 0:17** The three lanes draw themselves in from left to right — hairline horizontals with tick marks at quarters. Mono labels on the left:

```
01 · OBSERVED      what the user said
02 · INFERRED      what the model thinks
03 · SIMULATED     what the engine predicts
```

Each lane glows in its own colour (amber / green / blue).

**0:17 – 0:21** Observed cards fly in from the right, landing on the amber lane one by one, each with a subtle overshoot-and-settle spring. Five cards total:

- `primary_language = "rust"`
- `turned_down_faang = true`
- `favorite_stage = "early_stage"`
- `os_project_stars = 1200`
- `compensation_priority = "equity"`

Each card is 280px wide, sharp-cornered, mono label + amber underline.

**0:21 – 0:24** Above the observed row, three **trait pills** grow upward into the inferred lane. Each has a mono key, a value, and a confidence bar that fills with a spring:

- `values_technical_autonomy` · 0.78
- `deadline_driven_activation` · 0.74
- `optionality_over_stability` · 0.71

Hairline connecting lines animate from each observed card to the pills it informs.

**0:24 – 0:27** In the simulated lane, a larger **prediction card** materialises:

> Scenario · *Cold FAANG recruiter pitch*
> Prediction · **likely_decline**
> Confidence · 0.72
> Reasoning · 3 inferred traits, 4 observed facts

Dotted lines animate up from the inferred pills into the prediction card.

**0:27 – 0:28** Fraunces headline fades in above everything at 72pt:

> Three layers. Three types of certainty.

---

## Scene 3b · KNOWLEDGE GRAPH — 0:28 – 0:35 · 210f  *(new in v2)*

**Canvas** The three lanes collapse inward. A zoomed-out force-directed graph takes over — deterministic layout, same three-colour grammar.

**Node taxonomy**
- Centre: `josh` (root, ink-0 with accent glow)
- Observed facts radiate first: `primary_language=rust`, `turned_down_faang=true`, `favorite_stage=early_stage`, `os_project_stars=1.2k`, `runway_months=?`
- Inferred traits appear one hop in: `technical_autonomy`, `deadline_driven`, `optionality_over_stability`
- One simulated scenario attaches at the periphery: `series_a_offer`

**0:28 – 0:30** Eyebrow `KNOWLEDGE GRAPH · HOW TRAITS CONNECT`. Fraunces headline fades in:
> Every inference *traces back* to evidence.

**0:30 – 0:33** Edges draw in sequentially — root→observed first, then observed→inferred, then inferred→simulated. Nodes arrive shortly after their first connecting edge lands.

**0:33 – 0:35** Legend fades in at the bottom. A soft tick sound accompanies each edge attachment.

---

## Scene 4 · LOOP IN ACTION — 0:35 – 0:45 · 300f

**Canvas** Left third: a clean chat UI with three exchanged messages visible. Right two-thirds: the three lanes stay visible but scaled down.

**0:28 – 0:30** A new user message appears in chat:
> I just started contributing to an observability tool this week.

**0:30 – 0:31** Agent replies:
> Nice — want to ship it publicly or keep it internal?

**0:31 – 0:33** *Simultaneously* with the agent's reply, a new observed card materialises in the amber lane with a subtle phosphor flash around it:

- `side_project = "observability_tool"`
- tagged `information_target · side_projects`

Small mono caption below the chat:

> captured silently · never leaves the boundary

**0:33 – 0:36** **Timelapse.** The "Day 1" timestamp above the chat ticks forward: *Day 1 → Day 7 → Day 30*. Each tick:

- Two or three cards fan into the observed lane
- A new trait pill appears in the inferred lane
- A hairline graph of edges forms, connecting nodes across lanes

By Day 30 the scene looks visibly richer — ~20 observed cards, ~8 trait pills, a small knowledge graph webbing them together.

**0:36 – 0:38** Mono eyebrow fades in at the bottom:

> A PROFILE THAT COMPOUNDS

---

## Scene 5 · THE DECISION — 0:45 – 0:55 · 300f

**Canvas** Back to a clean chat-only view (the lanes slide off-screen). Chat bubble spacing a bit more generous — this is where the agent earns its keep.

**0:38 – 0:40** User message arrives:

> Should I take the Series A founding engineer offer, or stay at the consultancy another year?

**0:40 – 0:41** A small mono tag appears under the "composing…" indicator: `simulating · pson_simulate()` with a pulsing phosphor dot.

**0:41 – 0:46** Response streams in (typewriter, Inter 22pt, left-aligned):

> Based on what you've told me — Rust primary, equity-over-base, already turned down two big orgs for exactly this pattern — the Series A role matches.
>
> Caveat: I don't know your current runway. If cash matters in the next 12 months, negotiate a signing bonus rather than pretend the question isn't there.

**0:46 – 0:48** Below the response, a small **reasoning pill** fades in:

```
simulation · confidence 0.74
reasoning · 4 inferred traits · 2 observed facts · 1 caveat
```

The pill is the only element with colour. It's the "show your work" moment that generic agents cannot produce.

---

## Scene 5b · BENCHMARKS — 0:55 – 1:02 · 210f  *(new in v2)*

**Canvas** Left-aligned title block over a calm backdrop. Three animated horizontal bars fill up beside real measurements.

**0:55 – 0:57** Eyebrow `BENCHMARKS · REFERENCE WORKLOADS`. Fraunces headline:
> Fast enough to *not matter*.

Small mono meta underneath states either the measurement date + platform (when `public/benchmarks.json` was regenerated locally) or `reference workload · run npm run bench in your env` as a fallback.

**0:57 – 1:02** Three bars reveal in sequence — amber (observed / merge), phosphor (inferred / simulate), blue (simulated / serialize). Each bar:

- Shows the label in mono eyebrow style
- Fills proportionally to the goal ceiling
- A numeric counter rolls up from 0 → the real median
- A thin goal marker sits at `goalMs` so "under-budget" is visually obvious

Numbers come from `scripts/benchmark.mjs` — merge 5000 trait candidates, simulate 1000 decisions, round-trip 1000 facts. Each sample is median-of-6 after 2 warmups. On a 2024 consumer laptop the full suite lands ≤ 10ms total.

---

## Scene 6 · TAGLINE — 1:02 – 1:08 · 180f

**Canvas** Full-width hero. The three lanes return, with particles flowing at different tempos (6s / 4.5s / 8s) — matches the landing page's hero SVG.

**0:48 – 0:52** Centered over the lanes, Fraunces display at 128pt, with *actually* in italic phosphor-green:

> Personalization your agents can *actually* reason about.

**0:52 – 0:54** Hold. The dot pulses with the phrase.

---

## Scene 7 · OUTRO — 1:08 – 1:14 · 180f

**Canvas** Fade lanes out. Wordmark pops in, centered.

**0:54 – 0:57** `PSON5` in Fraunces 144pt, with italic-weight `5` in phosphor green, and a pulsing phosphor dot on the left edge.

**0:57 – 0:59** Mono caption below:

> OPEN STANDARD · MIT · github.com/pson5/pson5

**0:59 – 1:00** Fade to black.

---

## Typography reference

| Role | Font | Size ladder |
| --- | --- | --- |
| Display | Fraunces Variable, `opsz 144`, weight 400 (italics `SOFT 100`) | 72 · 96 · 128 · 144 |
| UI / chat body | Inter Variable, weight 400/500 | 22 · 28 |
| Mono labels | JetBrains Mono Variable, weight 500 | 14 · 18 · 20 letter-spaced 0.14em |

## Colour reference

| Token | Hex | Use |
| --- | --- | --- |
| `bg-0` | `#09090b` | Deep background |
| `bg-1` | `#0e0f12` | Elevated surfaces, cards |
| `bg-2` | `#141518` | Card-on-card |
| `ink-0` | `#f5f4ef` | Primary text |
| `ink-1` | `#b8b6ae` | Secondary text |
| `ink-2` | `#7d7b73` | Labels, meta |
| `accent` | `#b6ff5c` | The one accent — phosphor green |
| `observed` | `#f5c76a` | What the user said |
| `inferred` | `#b6ff5c` | What the model thinks |
| `simulated` | `#8ec7ff` | What the engine predicts |
| `hair` | `rgba(245,244,239,0.09)` | 1px dividers, tick marks |

## Motion principles

- **Spring over linear** for any object that "arrives." Use Remotion's `spring({ frame, fps, config: { damping: 22, mass: 0.6, stiffness: 140 } })`.
- **Stagger reveals** by 8–12 frames between sibling elements. Never all-at-once.
- **Fade + translate-up** is the default entrance for text (20px translate, 18-frame fade).
- **Typewriter** for agent replies, 1 char per 1.5 frames.
- **Particle flow** on layer lanes runs continuously throughout a scene, not starting/stopping with text.
- **Fade to black** between scenes on hard cuts; **cross-dissolve** when the layout is changing by ≤30%.

## Sound  *(v2)*

Two generators, committed via script and not as binary blobs:

**Music bed — `scripts/generate-music-lyria.mjs`.** Calls Google DeepMind's Lyria 2 model on Vertex AI (`lyria-002`) with a dark-ambient prompt, takes the three returned 30-second clips, and stitches them into a ~90-second bed with 4-second equal-power crossfades plus head/tail fades. Output: `public/audio/ambient.wav`. Response cached at `.cache/lyria/<hash>.json` so re-renders don't re-bill. Prompt is tuned to avoid artist-name references (Lyria filters those) and emphasises "slow evolving synthesizer pad, minor key, electronic, minimal, textural" — the aesthetic matches the dark-editorial palette.

**SFX layer — `scripts/generate-audio.mjs`.** Procedural DSP, four one-shots:

- **`whoosh.wav`** — 0.6s noise burst with a cutoff sweep 2500Hz → 300Hz. Triggered on every scene wipe.
- **`tick.wav`** — 120ms two-voice pop (820Hz + 1240Hz) with fast exponential decay. Fires on three-layer reveals, graph edge attachments, and benchmark bar landings.
- **`impact.wav`** — 400ms sub-pitch slide 90Hz → 42Hz with a filtered noise click. Hits on the title reveal.
- **`chime.wav`** — 900ms four-partial bell (A5 + E6 + A6 + E7) with staggered decay. Lands on the outro wordmark.

Mix targets: music bed at 0.55, whooshes at 0.50, ticks at 0.3–0.45, impact/chime at 0.52–0.55. Measured peak for the rendered first 10s lands around −11 dB with a −33 dB mean — plenty of headroom for voiceover if one is ever added.

---

## Delivery

Source: `examples/remotion-teaser/` — Remotion 4 React project.
Render: `npm run render` → `out/pson5-teaser.mp4`.
Preview: `npm run preview` (opens Remotion Studio at localhost:3000).
