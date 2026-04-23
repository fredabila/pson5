# PSON5 · Remotion teaser

A 60-second product teaser for PSON5, built in [Remotion](https://remotion.dev). Matches the landing page's dark-editorial aesthetic exactly — Fraunces display serif, Inter for UI, JetBrains Mono for labels, phosphor-green accent, and the three-colour observed / inferred / simulated grammar running through every scene.

See [`storyboard.md`](storyboard.md) for the shot-by-shot plan.

## Prerequisites

- **Node.js 20 or newer**
- **Chromium** — installed automatically by Remotion on first render, but on some Linux hosts you may need system deps: `apt install -y libnss3 libatk-bridge2.0-0 libxkbcommon0 libasound2`.

## Install

```bash
cd examples/remotion-teaser
npm install
```

First install pulls ~300MB (Remotion + Chrome headless). It's a standalone project — deliberately not a workspace member of the main monorepo — so the video tooling doesn't pollute the PSON5 engine builds.

## Preview in the browser

```bash
npm run studio
```

Opens Remotion Studio at `http://localhost:3000`. You can scrub the timeline, edit any scene, and see changes hot-reload.

## Render the final MP4

```bash
# Default (CRF 23, concurrency 2, ~3-5 minutes on a modern laptop)
npm run render

# High quality (CRF 16, concurrency 4, larger file)
npm run render-hq
```

Output lands at `out/pson5-teaser.mp4`. 1920×1080 H.264, `yuv420p`, 30fps. Good for Twitter, LinkedIn, and web embeds.

## Structure

```
examples/remotion-teaser/
├── storyboard.md              — shot-by-shot plan (read first)
├── package.json               — Remotion 4 + React 18
├── remotion.config.ts         — codec, pixel format, concurrency
├── tsconfig.json
├── src/
│   ├── index.ts               — registerRoot entry
│   ├── Root.tsx               — composition + font loading
│   ├── Teaser.tsx             — orchestrator (Sequence per scene)
│   ├── style/tokens.ts        — colours, fonts, timing table
│   ├── components/            — bespoke building blocks
│   │   ├── Backdrop.tsx       — dotted grid + edge glow + corner brackets
│   │   ├── PhosphorDot.tsx    — the signature pulsing phosphor dot
│   │   ├── Wordmark.tsx       — PSON5 with italic 5
│   │   ├── Eyebrow.tsx        — mono eyebrow with hairline prefix
│   │   ├── ChatBubble.tsx     — asymmetric chat bubble with typewriter
│   │   ├── TypingDots.tsx     — three-dot typing indicator
│   │   ├── LayerLane.tsx      — one of the three signature lanes with particles
│   │   ├── DataCard.tsx       — observed-fact card
│   │   ├── TraitPill.tsx      — inferred-trait pill with confidence bar
│   │   ├── PredictionCard.tsx — simulated-scenario card
│   │   ├── ReasoningPill.tsx  — "show your work" chip
│   │   ├── TimeMarker.tsx     — timelapse ticker (Day 1 → 7 → 30)
│   │   ├── PanelHeader.tsx    — split-screen column header
│   │   └── TypeOn.tsx         — generic typewriter reveal
│   └── scenes/                — one file per scene, all 30fps
│       ├── Hook.tsx           — 0:00 – 0:06
│       ├── GenericWound.tsx   — 0:06 – 0:16
│       ├── ThreeLayers.tsx    — 0:16 – 0:28
│       ├── LoopInAction.tsx   — 0:28 – 0:38
│       ├── Decision.tsx       — 0:38 – 0:48
│       ├── Tagline.tsx        — 0:48 – 0:54
│       └── Outro.tsx          — 0:54 – 1:00
```

## Retime the whole piece

Edit `src/style/tokens.ts` → `SCENE` table. Every `Sequence` in `Teaser.tsx` reads from that single source, so shifting one scene reflows everything else automatically.

```ts
export const SCENE = {
  hook: { from: 0, duration: 180 },
  genericWound: { from: 180, duration: 300 },
  threeLayers: { from: 480, duration: 360 },
  loopInAction: { from: 840, duration: 300 },
  decision: { from: 1140, duration: 300 },
  tagline: { from: 1440, duration: 180 },
  outro: { from: 1620, duration: 180 }
} as const;
```

## Change the copy

Script lines live inline in each `scenes/*.tsx` file as plain strings — swap the English without touching any motion code.

## Change the colours

All tokens are in `src/style/tokens.ts`. Swap `accent` to change the phosphor green. Swap `observed` / `inferred` / `simulated` to change the layer palette (but keep the amber → green → blue progression; it echoes the three epistemic states).

## Export stills

```bash
npx remotion still src/index.ts Teaser out/still.png --frame=480
```

Useful for social previews and documentation thumbnails.

## License

MIT, same as the parent repo.
