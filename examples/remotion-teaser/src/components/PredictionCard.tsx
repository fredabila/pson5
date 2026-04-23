import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_ARRIVAL } from "../style/tokens";

type Props = {
  appearAt: number;
  scenario: string;
  prediction: string;
  confidence: number;
  reasoningCount: number;
  observedCount: number;
  style?: React.CSSProperties;
};

/**
 * The big simulated-scenario card. Sits in the Simulated lane as the
 * crescendo of the three-layer reveal.
 */
export const PredictionCard: React.FC<Props> = ({
  appearAt,
  scenario,
  prediction,
  confidence,
  reasoningCount,
  observedCount,
  style
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({ frame: frame - appearAt, fps, config: SPRING_ARRIVAL });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const scale = interpolate(arrival, [0, 1], [0.95, 1]);
  const translateY = interpolate(arrival, [0, 1], [12, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        background: COLORS.bg1,
        border: `1px solid ${COLORS.simulated}`,
        borderLeft: `2px solid ${COLORS.simulated}`,
        padding: "22px 26px",
        minWidth: 480,
        ...style
      }}
    >
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 11,
          letterSpacing: "0.18em",
          color: COLORS.simulated,
          marginBottom: 14,
          textTransform: "uppercase"
        }}
      >
        Scenario · {scenario}
      </div>

      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 38,
          fontWeight: 500,
          color: COLORS.ink0,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          marginBottom: 18
        }}
      >
        {prediction}
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "baseline" }}>
        <div>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: COLORS.ink3,
              textTransform: "uppercase"
            }}
          >
            Confidence
          </div>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 22,
              color: COLORS.ink0,
              fontWeight: 500
            }}
          >
            {confidence.toFixed(2)}
          </div>
        </div>
        <div style={{ color: COLORS.ink3, fontFamily: FONT.mono, fontSize: 12 }}>
          {reasoningCount} inferred traits · {observedCount} observed facts
        </div>
      </div>
    </div>
  );
};
