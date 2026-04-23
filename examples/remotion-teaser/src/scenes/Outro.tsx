import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { Wordmark } from "../components/Wordmark";

/**
 * 0:54 – 1:00 · Wordmark resolve with orbital rings and a phosphor ring
 * burst behind the mark.
 */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordmarkReveal = spring({ frame, fps, config: SPRING_SOFT });
  const wordmarkY = interpolate(wordmarkReveal, [0, 1], [20, 0]);
  const wordmarkBlur = interpolate(wordmarkReveal, [0, 1], [14, 0]);
  const wordmarkOpacity = interpolate(wordmarkReveal, [0, 1], [0, 1]);

  const captionReveal = interpolate(frame, [44, 68], [0, 1], {
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
        gap: 44
      }}
    >
      {/* Orbital rings around the wordmark */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {[0, 1, 2, 3].map((i) => {
          const size = 240 + i * 140;
          const ringOpacity = interpolate(frame, [0, 30 + i * 10], [0, 0.18 - i * 0.03], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: "50%",
                border: `1px solid ${COLORS.accent}`,
                opacity: ringOpacity,
                transform: `rotate(${frame * (0.3 + i * 0.15)}deg)`
              }}
            />
          );
        })}
        {/* Tiny phosphor satellite dots */}
        {[0, 1, 2].map((i) => {
          const angle = (frame / (30 - i * 4)) * Math.PI * 2 + (i * Math.PI * 2) / 3;
          const radius = 170 + i * 70;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const ringOpacity = interpolate(frame, [0, 60], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `calc(50% + ${x}px - 3px)`,
                top: `calc(50% + ${y}px - 3px)`,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: COLORS.accent,
                opacity: ringOpacity * 0.8,
                boxShadow: `0 0 10px ${COLORS.accent}`
              }}
            />
          );
        })}
      </div>

      {/* Wordmark */}
      <div
        style={{
          opacity: wordmarkOpacity,
          transform: `translateY(${wordmarkY}px)`,
          filter: `blur(${wordmarkBlur}px)`,
          position: "relative"
        }}
      >
        <Wordmark size={156} suffix={null} />
      </div>

      {/* Caption */}
      <div
        style={{
          position: "relative",
          opacity: captionReveal,
          fontFamily: FONT.mono,
          fontSize: 15,
          letterSpacing: "0.28em",
          color: COLORS.ink2,
          textTransform: "uppercase",
          display: "flex",
          gap: 24,
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
