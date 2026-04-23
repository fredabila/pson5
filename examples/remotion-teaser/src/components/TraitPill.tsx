import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_ARRIVAL, SPRING_SOFT } from "../style/tokens";

type Props = {
  appearAt: number;
  label: string;
  confidence: number; // 0-1
  color?: string;
  style?: React.CSSProperties;
};

/**
 * A trait pill for the Inferred lane. Has a confidence bar that fills
 * with a separate spring, slightly later than the pill arrival.
 */
export const TraitPill: React.FC<Props> = ({
  appearAt,
  label,
  confidence,
  color = COLORS.inferred,
  style
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({ frame: frame - appearAt, fps, config: SPRING_ARRIVAL });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateY = interpolate(arrival, [0, 1], [14, 0]);

  const barFill = spring({
    frame: frame - (appearAt + 10),
    fps,
    config: SPRING_SOFT
  });
  const barWidth = interpolate(barFill, [0, 1], [0, confidence * 100]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        background: COLORS.bg1,
        border: `1px solid rgba(182,255,92,0.28)`,
        padding: "10px 16px",
        display: "inline-flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 280,
        ...style
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 18
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            color: color,
            letterSpacing: "0.02em",
            fontWeight: 500
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            color: COLORS.ink2,
            letterSpacing: "0.04em"
          }}
        >
          conf · {confidence.toFixed(2)}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: COLORS.hair,
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: "100%",
            background: color,
            transition: "none"
          }}
        />
      </div>
    </div>
  );
};
