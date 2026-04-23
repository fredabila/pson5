import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  label: string;
  medianMs: number;
  goalMs: number;
  color: string;
  appearAt: number;
  index: number;
};

/**
 * A single horizontal bar showing a measured latency vs. a goal line.
 * The bar fills up to the proportional width, then a numeric counter
 * rolls up from 0 → medianMs.
 */
export const BenchmarkBar: React.FC<Props> = ({
  label,
  medianMs,
  goalMs,
  color,
  appearAt,
  index
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - appearAt;

  const fill = interpolate(elapsed, [0, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const labelReveal = interpolate(elapsed, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const counterReveal = interpolate(elapsed, [18, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const value = medianMs * counterReveal;
  const widthPercent = Math.min(100, (medianMs / Math.max(goalMs, medianMs * 1.6)) * 100);
  const fillWidth = widthPercent * fill;
  const goalPercent = Math.min(100, (goalMs / Math.max(goalMs, medianMs * 1.6)) * 100);

  return (
    <div
      style={{
        opacity: labelReveal,
        transform: `translateY(${interpolate(labelReveal, [0, 1], [12, 0])}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline"
        }}
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 12,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: COLORS.ink2
          }}
        >
          <span style={{ color: COLORS.ink3, marginRight: 10 }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          {label}
        </div>
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 42,
            color: COLORS.ink0,
            letterSpacing: "-0.02em",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {value.toFixed(value < 10 ? 2 : 1)}
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 16,
              color: COLORS.ink2,
              marginLeft: 6,
              letterSpacing: "0.05em"
            }}
          >
            ms
          </span>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 12,
          background: COLORS.bg2,
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid ${COLORS.hair}`
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fillWidth}%`,
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            boxShadow: `0 0 12px ${color}88`,
            borderRadius: 8
          }}
        />
        {/* goal marker */}
        <div
          style={{
            position: "absolute",
            left: `${goalPercent}%`,
            top: -4,
            bottom: -4,
            width: 1,
            background: COLORS.ink3,
            opacity: labelReveal * 0.75
          }}
        />
      </div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          color: COLORS.ink3,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "flex-end",
          gap: 14
        }}
      >
        <span>goal ≤ {goalMs}ms</span>
      </div>
    </div>
  );
};
