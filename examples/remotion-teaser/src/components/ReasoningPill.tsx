import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_ARRIVAL } from "../style/tokens";

type Props = {
  appearAt: number;
  confidence: number;
  traitsCount: number;
  observedCount: number;
  caveatsCount?: number;
};

/**
 * The "show-your-work" pill that appears under the agent's reply in the
 * Decision scene — the visual proof that a simulation ran.
 */
export const ReasoningPill: React.FC<Props> = ({
  appearAt,
  confidence,
  traitsCount,
  observedCount,
  caveatsCount = 0
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({ frame: frame - appearAt, fps, config: SPRING_ARRIVAL });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateY = interpolate(arrival, [0, 1], [10, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "inline-flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 18px",
        background: `linear-gradient(180deg, rgba(182,255,92,0.06), rgba(182,255,92,0.02))`,
        border: `1px solid rgba(182,255,92,0.25)`,
        borderRadius: 999,
        fontFamily: FONT.mono,
        fontSize: 13,
        color: COLORS.ink1,
        letterSpacing: "0.04em"
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: COLORS.accent,
          boxShadow: `0 0 12px ${COLORS.accent}`
        }}
      />
      <span style={{ color: COLORS.accent, fontWeight: 500 }}>
        simulation · confidence {confidence.toFixed(2)}
      </span>
      <span style={{ color: COLORS.ink3 }}>·</span>
      <span>{traitsCount} traits · {observedCount} observed{caveatsCount ? ` · ${caveatsCount} caveat${caveatsCount === 1 ? "" : "s"}` : ""}</span>
    </div>
  );
};
