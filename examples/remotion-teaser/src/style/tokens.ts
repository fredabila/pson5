/**
 * Design tokens — mirror the PSON5 landing aesthetic exactly so the teaser
 * feels like a cinematic extension of the site rather than a marketing asset
 * made in a different universe.
 */

export const COLORS = {
  // Surfaces
  bg0: "#09090b",
  bg1: "#0e0f12",
  bg2: "#141518",
  bg3: "#1b1c21",

  // Ink
  ink0: "#f5f4ef",
  ink1: "#b8b6ae",
  ink2: "#7d7b73",
  ink3: "#52514c",
  ink4: "#33322e",

  // Hairlines
  hairSoft: "rgba(245, 244, 239, 0.06)",
  hair: "rgba(245, 244, 239, 0.09)",
  hairStrong: "rgba(245, 244, 239, 0.16)",

  // Accent + layer grammar
  accent: "#b6ff5c",
  accentDim: "#7cc038",
  accentGlow: "rgba(182, 255, 92, 0.22)",
  accentWash: "rgba(182, 255, 92, 0.08)",

  observed: "#f5c76a",
  inferred: "#b6ff5c",
  simulated: "#8ec7ff",

  observedSoft: "rgba(245, 199, 106, 0.16)",
  inferredSoft: "rgba(182, 255, 92, 0.16)",
  simulatedSoft: "rgba(142, 199, 255, 0.16)"
} as const;

export const FONT = {
  display: "'Fraunces', 'Iowan Old Style', Georgia, serif",
  body: "'Inter', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"
} as const;

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 2220
} as const;

/** Scene offsets in frames. Edit this table to retime the whole piece. */
export const SCENE = {
  hook: { from: 0, duration: 180 }, // 0:00 – 0:06
  genericWound: { from: 180, duration: 300 }, // 0:06 – 0:16
  threeLayers: { from: 480, duration: 360 }, // 0:16 – 0:28
  graph: { from: 840, duration: 210 }, // 0:28 – 0:35 (new)
  loopInAction: { from: 1050, duration: 300 }, // 0:35 – 0:45
  decision: { from: 1350, duration: 300 }, // 0:45 – 0:55
  benchmarks: { from: 1650, duration: 210 }, // 0:55 – 1:02 (new)
  tagline: { from: 1860, duration: 180 }, // 1:02 – 1:08
  outro: { from: 2040, duration: 180 } // 1:08 – 1:14
} as const;

/** Reusable spring config for "arrival" animations. */
export const SPRING_ARRIVAL = {
  damping: 22,
  mass: 0.6,
  stiffness: 140
} as const;

export const SPRING_SOFT = {
  damping: 18,
  mass: 0.8,
  stiffness: 90
} as const;

export const SPRING_SNAP = {
  damping: 14,
  mass: 0.5,
  stiffness: 180
} as const;
