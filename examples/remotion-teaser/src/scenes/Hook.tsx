import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { PhosphorDot } from "../components/PhosphorDot";

/**
 * 0:00 – 0:06 · The hook.
 *
 * Camera pushes in on a pulsing phosphor dot, which expands into a
 * constellation of faint rings. Title arrives out of soft blur, subtitle
 * follows beneath a hairline. Exit fades on the last 20 frames.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();

  const dotOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });

  // subtle camera zoom: starts 1.25x, ends 1.0x
  const cameraScale = interpolate(frame, [0, 80], [1.25, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const titleReveal = interpolate(frame, [32, 76], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const titleTranslate = interpolate(titleReveal, [0, 1], [20, 0]);
  const titleBlur = interpolate(titleReveal, [0, 1], [12, 0]);

  const subtitleReveal = interpolate(frame, [90, 114], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const hairReveal = interpolate(frame, [82, 114], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

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
        opacity: exit,
        transform: `scale(${cameraScale})`
      }}
    >
      {/* dot with decorative rings */}
      <div
        style={{
          position: "relative",
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: dotOpacity
        }}
      >
        {/* concentric rings that pulse outward */}
        {[0, 1, 2].map((i) => {
          const cyclePos = ((frame - i * 18) % 90) / 90;
          const size = interpolate(cyclePos, [0, 1], [20, 160]);
          const ringOpacity = interpolate(cyclePos, [0, 0.15, 1], [0, 0.4, 0]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: "50%",
                border: `1px solid ${COLORS.accent}`,
                opacity: ringOpacity
              }}
            />
          );
        })}
        <PhosphorDot size={18} glow={58} />
      </div>

      <h1
        style={{
          fontFamily: FONT.display,
          fontWeight: 400,
          fontSize: 108,
          letterSpacing: "-0.035em",
          color: COLORS.ink0,
          lineHeight: 1.02,
          margin: 0,
          textAlign: "center",
          maxWidth: 1200,
          opacity: titleReveal,
          transform: `translateY(${titleTranslate}px)`,
          filter: `blur(${titleBlur}px)`,
          fontFeatureSettings: "'ss01'"
        }}
      >
        Your agent{" "}
        <span
          style={{
            fontStyle: "italic",
            fontVariationSettings: "'SOFT' 100"
          }}
        >
          doesn't
        </span>{" "}
        know you.
      </h1>

      <div
        style={{
          width: hairReveal,
          height: 1,
          background: COLORS.accent,
          opacity: 0.55,
          boxShadow: `0 0 8px ${COLORS.accentGlow}`
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
