import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_ARRIVAL } from "../style/tokens";

type Props = {
  appearAt: number;
  label: string;
  value: string;
  color: string;
  style?: React.CSSProperties;
  tag?: string;
};

/**
 * A small data card — used to represent an observed fact or an inferred
 * trait landing in a lane. Sharp-cornered, amber/green/blue underline,
 * mono type.
 */
export const DataCard: React.FC<Props> = ({ appearAt, label, value, color, style, tag }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({ frame: frame - appearAt, fps, config: SPRING_ARRIVAL });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateY = interpolate(arrival, [0, 1], [-18, 0]);
  const translateX = interpolate(arrival, [0, 1], [40, 0]);
  const scale = interpolate(arrival, [0, 1], [0.94, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        background: COLORS.bg1,
        border: `1px solid ${COLORS.hair}`,
        borderBottom: `2px solid ${color}`,
        padding: "14px 18px",
        minWidth: 230,
        fontFamily: FONT.mono,
        fontSize: 13,
        ...style
      }}
    >
      {tag && (
        <div
          style={{
            fontSize: 10,
            color: COLORS.ink3,
            letterSpacing: "0.16em",
            marginBottom: 8,
            textTransform: "uppercase"
          }}
        >
          {tag}
        </div>
      )}
      <div style={{ color: COLORS.ink2, marginBottom: 4, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ color: COLORS.ink0, fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  );
};
