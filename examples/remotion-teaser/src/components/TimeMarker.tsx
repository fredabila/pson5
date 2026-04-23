import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  frames: Array<{ at: number; label: string }>;
};

/**
 * Timelapse label: "Day 1 → Day 7 → Day 30". Crossfades between labels at
 * the specified frame markers.
 */
export const TimeMarker: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 14,
        fontFamily: FONT.mono,
        fontSize: 14,
        color: COLORS.ink2,
        letterSpacing: "0.18em",
        textTransform: "uppercase"
      }}
    >
      <span style={{ color: COLORS.ink3, fontSize: 11 }}>TIMELINE</span>
      {frames.map((segment, index) => {
        const nextAt = frames[index + 1]?.at ?? segment.at + 120;
        const visible =
          frame >= segment.at &&
          frame < nextAt;
        const fadeIn = interpolate(frame - segment.at, [0, 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        const fadeOut = interpolate(nextAt - frame, [0, 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        const opacity = visible ? Math.min(fadeIn, fadeOut) : 0;
        if (opacity === 0) return null;
        return (
          <span
            key={segment.at}
            style={{
              opacity,
              color: COLORS.accent,
              fontWeight: 500
            }}
          >
            {segment.label}
          </span>
        );
      })}
    </div>
  );
};
