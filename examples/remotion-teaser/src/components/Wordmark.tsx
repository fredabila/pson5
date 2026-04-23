import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { PhosphorDot } from "./PhosphorDot";

type Props = {
  size?: number;
  showDot?: boolean;
  suffix?: string | null;
};

/**
 * PSON5 wordmark with italic "5" in phosphor, optional pulsing dot on the
 * left. Appears with a subtle letter-spacing spring.
 */
export const Wordmark: React.FC<Props> = ({ size = 128, showDot = true, suffix = "v0.1.0" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const letterProgress = spring({ frame, fps, config: SPRING_SOFT });
  const tracking = interpolate(letterProgress, [0, 1], [-0.06, -0.04]);
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: size * 0.12,
        opacity
      }}
    >
      {showDot && (
        <div style={{ transform: `translateY(-${size * 0.25}px)` }}>
          <PhosphorDot size={Math.round(size / 9)} glow={size * 0.45} />
        </div>
      )}
      <span
        style={{
          fontFamily: FONT.display,
          fontSize: size,
          fontWeight: 500,
          color: COLORS.ink0,
          letterSpacing: `${tracking}em`,
          fontFeatureSettings: "'ss01'",
          lineHeight: 1
        }}
      >
        PSON
        <span
          style={{
            fontStyle: "italic",
            color: COLORS.accent,
            fontWeight: 400,
            fontVariationSettings: "'opsz' 144, 'SOFT' 100"
          }}
        >
          5
        </span>
      </span>
      {suffix && (
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: size * 0.11,
            color: COLORS.ink2,
            letterSpacing: "0.1em",
            padding: `${size * 0.04}px ${size * 0.08}px`,
            border: `1px solid ${COLORS.hair}`,
            borderRadius: 999,
            transform: `translateY(-${size * 0.12}px)`
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
};
