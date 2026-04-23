import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { ChatBubble } from "../components/ChatBubble";
import { TypingDots } from "../components/TypingDots";
import { ReasoningPill } from "../components/ReasoningPill";
import { Eyebrow } from "../components/Eyebrow";

/**
 * 0:38 – 0:48 · The decision moment — where PSON5 earns its keep.
 *
 * The agent is asked a high-stakes question, visibly runs a simulation,
 * and returns a specific, confidence-bearing answer. A reasoning pill
 * below the reply is the "show your work" beat.
 */
export const Decision: React.FC = () => {
  const frame = useCurrentFrame();

  const reveal = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // simulating indicator frames 60-120
  const simulatingVisible = frame >= 60 && frame < 120;
  const simulatingPulse = 0.55 + 0.45 * Math.sin(frame / 6);

  const exit = interpolate(frame, [280, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        opacity: reveal * exit,
        padding: "64px 260px",
        display: "flex",
        flexDirection: "column",
        gap: 30,
        alignItems: "stretch",
        justifyContent: "center"
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <Eyebrow label="The decision · month 3" accent={COLORS.accent} />
      </div>

      <ChatBubble
        from="user"
        message="Should I take the Series A founding engineer offer, or stay at the consultancy another year?"
        appearAt={12}
        typeSpeed={1.1}
        wide
      />

      {simulatingVisible && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingLeft: 6 }}>
          <TypingDots color={COLORS.accent} />
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: COLORS.accent,
              opacity: simulatingPulse
            }}
          >
            simulating · pson_simulate()
          </span>
        </div>
      )}

      {frame >= 120 && (
        <ChatBubble
          from="agent"
          message={`Based on what you've told me — Rust primary, equity over base, already turned down two big orgs for exactly this pattern — the Series A role matches. Caveat: I don't know your current runway. If cash matters in the next 12 months, negotiate a signing bonus rather than pretend the question isn't there.`}
          appearAt={120}
          typeSpeed={0.95}
          wide
        />
      )}

      {frame >= 240 && (
        <div style={{ paddingLeft: 2 }}>
          <ReasoningPill
            appearAt={240}
            confidence={0.74}
            traitsCount={4}
            observedCount={2}
            caveatsCount={1}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
