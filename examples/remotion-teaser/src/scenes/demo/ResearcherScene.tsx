import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../../style/tokens";

/**
 * Researcher-agent demo — shows the Managed Agents example from
 * examples/researcher-agent/ as a terminal REPL. Dr. Amelia Kwan (a
 * fictional composite persona) introduces herself, seeds her profile
 * via rapid pson_observe_fact calls, then answers a substantive
 * technical question by running pson_simulate against her own profile.
 *
 * Frame 0 ~ 540 (18s). Timed to "demo-06-researcher.wav" (17.59s).
 */

interface LogLine {
  kind: "system" | "user" | "agent" | "tool";
  text: string;
  at: number;
}

const LINES: LogLine[] = [
  { kind: "system", at: 0, text: "$ npx @pson5/researcher-agent" },
  { kind: "system", at: 12, text: "• PSON profile: persona_amelia_kwan_v1" },
  { kind: "system", at: 18, text: "• Agent: agent_0xak72 · Claude Opus 4.7" },
  { kind: "system", at: 24, text: "• Environment: env_q91mb3 · cloud" },
  { kind: "system", at: 30, text: "" },

  { kind: "user", at: 42, text: "you › who are you?" },

  { kind: "agent", at: 60, text: "kwan › Amelia Kwan — Principal Research Engineer, Alignment + RLHF." },
  { kind: "agent", at: 72, text: "       Fictional composite, 9-year tenure. Let me seed my profile..." },

  // Rapid-fire observe_fact calls
  { kind: "tool", at: 90, text: "  [pson_observe_fact] core/name = \"Amelia Kwan\" · 38ms" },
  { kind: "tool", at: 100, text: "  [pson_observe_fact] core/role = \"Principal Research Engineer\" · 41ms" },
  { kind: "tool", at: 110, text: "  [pson_observe_fact] career/years_at_anthropic = 9 · 33ms" },
  { kind: "tool", at: 120, text: "  [pson_observe_fact] expertise/primary_areas = [RLHF, Const-AI, evals] · 44ms" },
  { kind: "tool", at: 130, text: "  [pson_observe_fact] cognitive/problem_solving_style = \"plan_first\" · 37ms" },
  { kind: "tool", at: 140, text: "  [pson_observe_fact] cognitive/decision_style = \"evidence_over_intuition\" · 40ms" },
  { kind: "tool", at: 150, text: "  [pson_observe_fact] work_ethic/eval_discipline = \"high\" · 36ms" },
  { kind: "tool", at: 160, text: "  ... (14 more observe_fact calls) · 510ms total" },

  { kind: "user", at: 200, text: "you › how would you design the reward model for Claude's reasoning?" },

  { kind: "agent", at: 230, text: "kwan › [consulting own profile...]" },
  { kind: "tool", at: 248, text: "  [pson_get_agent_context] intent: reward model for reasoning · 12ms" },
  { kind: "tool", at: 262, text: "  [pson_simulate] scenario: rm_calibration_for_reasoning · 124ms" },

  { kind: "agent", at: 290, text: "" },
  { kind: "agent", at: 296, text: "       Preference ranking, not scalar rewards." },
  { kind: "agent", at: 310, text: "       Confidence 0.74. Three traits point that way:" },
  { kind: "agent", at: 326, text: "       · evidence_over_intuition — I want paired disagreements" },
  { kind: "agent", at: 340, text: "       · small_crisp_ablations — scalar runs drift, pairs don't" },
  { kind: "agent", at: 354, text: "       · eval_discipline/high — scalars smooth out hard-edge cases" },
  { kind: "agent", at: 370, text: "" },
  { kind: "agent", at: 378, text: "       Caveat: 100k-pair annotation is expensive. Pre-filter" },
  { kind: "agent", at: 392, text: "       low-disagreement slices with a cheap scalar pass first." }
];

export const ResearcherScene: React.FC = () => {
  const frame = useCurrentFrame();

  const containerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg0,
        padding: "48px 100px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        opacity: containerOpacity
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 13,
          letterSpacing: "0.28em",
          color: COLORS.accent,
          textTransform: "uppercase"
        }}
      >
        ─── managed agent · persona simulation
      </div>
      <h2
        style={{
          fontFamily: FONT.display,
          fontSize: 44,
          fontWeight: 400,
          letterSpacing: "-0.025em",
          color: COLORS.ink0,
          margin: 0,
          marginBottom: 4,
          lineHeight: 1.1
        }}
      >
        A Claude agent{" "}
        <em
          style={{
            fontStyle: "italic",
            color: COLORS.accent,
            fontVariationSettings: "'SOFT' 100"
          }}
        >
          inhabits
        </em>{" "}
        a researcher.
      </h2>

      {/* Terminal */}
      <div
        style={{
          flex: 1,
          background: "#0a0a0c",
          border: `1px solid ${COLORS.hairStrong}`,
          borderRadius: 12,
          padding: "18px 22px",
          fontFamily: FONT.mono,
          fontSize: 15,
          lineHeight: 1.55,
          overflow: "hidden",
          boxShadow: `0 0 60px rgba(182, 255, 92, 0.04)`
        }}
      >
        {/* Traffic lights */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16
          }}
        >
          {[
            "rgb(255, 95, 86)",
            "rgb(255, 189, 46)",
            "rgb(39, 201, 63)"
          ].map((color) => (
            <span
              key={color}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: color,
                display: "inline-block"
              }}
            />
          ))}
          <span
            style={{
              marginLeft: 16,
              color: COLORS.ink3,
              fontSize: 12,
              letterSpacing: "0.08em"
            }}
          >
            researcher-agent · bash
          </span>
        </div>

        {/* Log lines */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {LINES.map((line, idx) => (
            <TerminalLine key={idx} line={line} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const TerminalLine: React.FC<{ line: LogLine }> = ({ line }) => {
  const frame = useCurrentFrame();
  if (frame < line.at) return null;

  const opacity = interpolate(frame - line.at, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const color =
    line.kind === "system"
      ? COLORS.ink3
      : line.kind === "user"
        ? "#c7ff77"
        : line.kind === "tool"
          ? COLORS.ink2
          : COLORS.ink0;

  return (
    <div
      style={{
        opacity,
        color,
        whiteSpace: "pre",
        minHeight: 22
      }}
    >
      {line.text || " "}
    </div>
  );
};
