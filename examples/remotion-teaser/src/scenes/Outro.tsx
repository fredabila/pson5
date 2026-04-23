import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { Wordmark } from "../components/Wordmark";

/**
 * 0:54 – 1:00 · The wordmark resolve.
 */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();

  const wordmarkReveal = interpolate(frame, [0, 28], [0, 1], {
    extrapolateRight: "clamp"
  });
  const wordmarkY = interpolate(wordmarkReveal, [0, 1], [12, 0]);

  const captionReveal = interpolate(frame, [40, 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const exit = interpolate(frame, [150, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        opacity: exit,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36
      }}
    >
      <div
        style={{
          opacity: wordmarkReveal,
          transform: `translateY(${wordmarkY}px)`
        }}
      >
        <Wordmark size={140} suffix={null} />
      </div>

      <div
        style={{
          opacity: captionReveal,
          fontFamily: FONT.mono,
          fontSize: 15,
          letterSpacing: "0.26em",
          color: COLORS.ink2,
          textTransform: "uppercase",
          display: "flex",
          gap: 20,
          alignItems: "center"
        }}
      >
        <span>Open standard</span>
        <span style={{ color: COLORS.ink3 }}>·</span>
        <span>MIT</span>
        <span style={{ color: COLORS.ink3 }}>·</span>
        <span style={{ color: COLORS.accent }}>github.com/pson5/pson5</span>
      </div>
    </AbsoluteFill>
  );
};
