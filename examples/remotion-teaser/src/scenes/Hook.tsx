import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { PhosphorDot } from "../components/PhosphorDot";

/**
 * 0:00 – 0:06 · The hook.
 *
 * A pulsing phosphor dot resolves into a quiet title card. No movement
 * beyond the dot's pulse and the type-in of two lines.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();

  const dotOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });

  const titleReveal = interpolate(frame, [36, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const titleTranslate = interpolate(titleReveal, [0, 1], [18, 0]);

  const subtitleReveal = interpolate(frame, [84, 108], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const hairReveal = interpolate(frame, [78, 108], [0, 320], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  // Fade the whole scene out in the final 20 frames.
  const exit = interpolate(frame, [160, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 44,
        opacity: exit
      }}
    >
      <div style={{ opacity: dotOpacity }}>
        <PhosphorDot size={16} glow={52} />
      </div>

      <h1
        style={{
          fontFamily: FONT.display,
          fontWeight: 400,
          fontSize: 104,
          letterSpacing: "-0.035em",
          color: COLORS.ink0,
          lineHeight: 1.02,
          margin: 0,
          textAlign: "center",
          maxWidth: 1200,
          opacity: titleReveal,
          transform: `translateY(${titleTranslate}px)`,
          fontFeatureSettings: "'ss01'"
        }}
      >
        Your agent <span style={{ fontStyle: "italic", fontVariationSettings: "'SOFT' 100" }}>
          doesn't
        </span> know you.
      </h1>

      <div
        style={{
          width: hairReveal,
          height: 1,
          background: COLORS.hair
        }}
      />

      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 18,
          letterSpacing: "0.22em",
          color: COLORS.ink2,
          textTransform: "uppercase",
          opacity: subtitleReveal,
          fontWeight: 500
        }}
      >
        Every conversation starts from scratch
      </div>
    </AbsoluteFill>
  );
};
