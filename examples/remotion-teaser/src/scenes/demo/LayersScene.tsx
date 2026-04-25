import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../../style/tokens";

/**
 * The architectural invariant. Three lanes reveal sequentially — observed
 * first, then inferred, then simulated. A TypeScript interface snippet
 * floats in alongside to drive home that the separation is a type-system
 * guarantee, not a documentation convention.
 *
 * Frame 0 ~ 520 (17s). Timed to "demo-02-layers.wav" (16.48s).
 */

interface LaneDef {
  accent: "observed" | "inferred" | "simulated";
  label: string;
  sublabel: string;
  examples: string[];
  revealAt: number;
}

const LANES: LaneDef[] = [
  {
    accent: "observed",
    label: "01 · OBSERVED",
    sublabel: "what the user said",
    examples: ['primary_language = "rust"', "turned_down_faang = true"],
    revealAt: 40
  },
  {
    accent: "inferred",
    label: "02 · INFERRED",
    sublabel: "what the model deduced, with confidence",
    examples: [
      'values_technical_autonomy · confidence 0.78',
      'optionality_over_stability · confidence 0.71'
    ],
    revealAt: 160
  },
  {
    accent: "simulated",
    label: "03 · SIMULATED",
    sublabel: "what the engine predicts in context",
    examples: [
      "series_a_offer → likely_accept",
      "reasoning · 3 traits · 2 evidence refs · 1 caveat"
    ],
    revealAt: 280
  }
];

const ACCENT_COLOR: Record<LaneDef["accent"], string> = {
  observed: COLORS.observed,
  inferred: COLORS.inferred,
  simulated: COLORS.simulated
};

const ACCENT_SOFT: Record<LaneDef["accent"], string> = {
  observed: "rgba(245, 199, 106, 0.14)",
  inferred: "rgba(182, 255, 92, 0.14)",
  simulated: "rgba(142, 199, 255, 0.14)"
};

export const LayersScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });
  const typeSnippetReveal = interpolate(frame, [400, 460], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg0,
        padding: "80px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 32
      }}
    >
      <div style={{ opacity: titleOpacity }}>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            letterSpacing: "0.28em",
            color: COLORS.accent,
            textTransform: "uppercase",
            marginBottom: 16
          }}
        >
          ─── the architectural invariant
        </div>
        <h1
          style={{
            fontFamily: FONT.display,
            fontSize: 68,
            fontWeight: 400,
            letterSpacing: "-0.03em",
            color: COLORS.ink0,
            margin: 0,
            lineHeight: 1.05
          }}
        >
          Three layers.{" "}
          <em
            style={{
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            Always
          </em>{" "}
          separate.
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
          gap: 48,
          flex: 1
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {LANES.map((lane) => (
            <LaneBlock key={lane.accent} lane={lane} />
          ))}
        </div>

        <TypeSnippet opacity={typeSnippetReveal} />
      </div>
    </AbsoluteFill>
  );
};

const LaneBlock: React.FC<{ lane: LaneDef }> = ({ lane }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame - lane.revealAt;
  if (elapsed < 0) return null;

  const arrival = spring({ frame: elapsed, fps, config: SPRING_SOFT });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateX = interpolate(arrival, [0, 1], [-20, 0]);
  const accent = ACCENT_COLOR[lane.accent];
  const soft = ACCENT_SOFT[lane.accent];

  return (
    <section
      style={{
        padding: "18px 22px",
        borderRadius: 12,
        border: `1px solid ${COLORS.hair}`,
        borderLeft: `3px solid ${accent}`,
        background: `linear-gradient(to right, ${soft}, ${COLORS.bg1} 55%)`,
        opacity,
        transform: `translateX(${translateX}px)`
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          marginBottom: 4
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            fontWeight: 600,
            color: accent,
            letterSpacing: "0.22em"
          }}
        >
          {lane.label}
        </span>
        <span style={{ color: COLORS.ink2, fontSize: 13 }}>— {lane.sublabel}</span>
      </header>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "10px 0 0",
          display: "flex",
          flexDirection: "column",
          gap: 6
        }}
      >
        {lane.examples.map((example, i) => (
          <li
            key={example}
            style={{
              fontFamily: FONT.mono,
              fontSize: 14,
              color: COLORS.ink1,
              padding: "6px 10px",
              background: "rgba(9, 9, 11, 0.5)",
              border: `1px solid ${COLORS.hair}`,
              borderRadius: 6,
              opacity: elapsed > 20 + i * 6 ? 1 : 0,
              transition: "opacity 0.2s"
            }}
          >
            {example}
          </li>
        ))}
      </ul>
    </section>
  );
};

const TypeSnippet: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      opacity,
      padding: "20px 24px",
      background: COLORS.bg1,
      border: `1px solid ${COLORS.hair}`,
      borderRadius: 12,
      fontFamily: FONT.mono,
      fontSize: 13,
      lineHeight: 1.7,
      color: COLORS.ink1,
      position: "relative"
    }}
  >
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 10,
        letterSpacing: "0.22em",
        color: COLORS.ink3,
        textTransform: "uppercase",
        marginBottom: 12
      }}
    >
      ─── enforced in the type system
    </div>
    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
      <span style={{ color: "#c99cff" }}>interface</span>{" "}
      <span style={{ color: COLORS.ink0 }}>PsonProfile</span>{" "}
      {"{"}
      <br />
      {"  "}layers: {"{"}
      <br />
      {"    "}
      <span style={{ color: COLORS.observed }}>observed</span>: {"{"}
      <br />
      {"      "}[domain: string]: ObservedFacts;
      <br />
      {"    "}
      {"};"}
      <br />
      {"    "}
      <span style={{ color: COLORS.inferred }}>inferred</span>: {"{"}
      <br />
      {"      "}[domain: string]: InferredTraits;
      <br />
      {"    "}
      {"};"}
      <br />
      {"    "}
      <span style={{ color: COLORS.simulated }}>simulated</span>: {"{"}
      <br />
      {"      "}[scenario: string]: SimulationResult;
      <br />
      {"    "}
      {"};"}
      <br />
      {"  "}
      {"};"}
      <br />
      {"}"}
    </pre>
  </div>
);
