import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { KnowledgeGraph, GraphNode, GraphEdge } from "../components/KnowledgeGraph";
import { Eyebrow } from "../components/Eyebrow";

/**
 * 0:28 – 0:34 · Zoom-out to the knowledge graph.
 *
 * The three-layer rows now collapse into a living graph — observed facts
 * on the outside, inferred traits one step in, one simulated scenario
 * close to the centre. Edges glow into existence in the three-layer
 * palette. A legend keeps the colour grammar legible.
 */

const nodes: GraphNode[] = [
  { id: "me", label: "josh", kind: "root", size: 28 },

  // Observed facts (amber)
  { id: "f_lang", label: "primary_language=rust", kind: "observed" },
  { id: "f_turned_down", label: "turned_down_faang=true", kind: "observed" },
  { id: "f_stage", label: "favorite_stage=early_stage", kind: "observed" },
  { id: "f_stars", label: "os_project_stars=1.2k", kind: "observed" },
  { id: "f_runway", label: "runway_months=?", kind: "observed", size: 11 },

  // Inferred traits (phosphor green)
  { id: "t_autonomy", label: "technical_autonomy", kind: "inferred" },
  { id: "t_deadline", label: "deadline_driven", kind: "inferred" },
  { id: "t_optionality", label: "optionality_over_stability", kind: "inferred" },

  // Simulated scenario (cool blue)
  { id: "s_seriesA", label: "series_a_offer", kind: "simulated", size: 18 }
];

const edges: GraphEdge[] = [
  // Root → observed facts arrive first
  { from: "me", to: "f_lang", appearAt: 6 },
  { from: "me", to: "f_turned_down", appearAt: 14 },
  { from: "me", to: "f_stage", appearAt: 22 },
  { from: "me", to: "f_stars", appearAt: 30 },
  { from: "me", to: "f_runway", appearAt: 38 },

  // Facts → inferred traits
  { from: "f_lang", to: "t_autonomy", appearAt: 48 },
  { from: "f_turned_down", to: "t_autonomy", appearAt: 54 },
  { from: "f_stage", to: "t_optionality", appearAt: 60 },
  { from: "f_turned_down", to: "t_optionality", appearAt: 64 },
  { from: "f_stars", to: "t_deadline", appearAt: 70 },

  // Traits → simulation
  { from: "t_autonomy", to: "s_seriesA", appearAt: 82 },
  { from: "t_optionality", to: "s_seriesA", appearAt: 88 },
  { from: "t_deadline", to: "s_seriesA", appearAt: 94 }
];

export const Graph: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({ frame, fps, config: SPRING_SOFT });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const scale = interpolate(arrival, [0, 1], [0.88, 1]);

  const captionReveal = interpolate(frame, [90, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const exit = interpolate(frame, [180, 210], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const graphWidth = 1500;
  const graphHeight = 780;

  return (
    <AbsoluteFill
      style={{
        opacity: opacity * exit,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 24,
        transform: `scale(${scale})`
      }}
    >
      {/* Eyebrow + title */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <Eyebrow label="Knowledge graph · how traits connect" accent={COLORS.accent} />
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT.display,
            fontSize: 54,
            letterSpacing: "-0.025em",
            color: COLORS.ink0,
            lineHeight: 1.05
          }}
        >
          Every inference{" "}
          <span
            style={{
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            traces back
          </span>{" "}
          to evidence.
        </div>
      </div>

      <KnowledgeGraph
        nodes={nodes}
        edges={edges}
        width={graphWidth}
        height={graphHeight}
      />

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 36,
          opacity: captionReveal,
          fontFamily: FONT.mono,
          fontSize: 12,
          letterSpacing: "0.2em",
          color: COLORS.ink2,
          textTransform: "uppercase",
          marginTop: -8
        }}
      >
        <LegendSwatch color={COLORS.observed} label="observed" />
        <LegendSwatch color={COLORS.inferred} label="inferred" />
        <LegendSwatch color={COLORS.simulated} label="simulated" />
      </div>
    </AbsoluteFill>
  );
};

const LegendSwatch: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 8px ${color}`
      }}
    />
    <span>{label}</span>
  </div>
);
