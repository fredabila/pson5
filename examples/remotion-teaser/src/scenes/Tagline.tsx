import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { LayerLane } from "../components/LayerLane";

/**
 * 0:48 – 0:54 · Tagline over the three flowing lanes.
 */
export const Tagline: React.FC = () => {
  const frame = useCurrentFrame();

  const reveal = interpolate(frame, [0, 28], [0, 1], { extrapolateRight: "clamp" });
  const translateY = interpolate(reveal, [0, 1], [22, 0]);

  const exit = interpolate(frame, [160, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const laneWidth = 1680;

  return (
    <AbsoluteFill
      style={{
        opacity: exit,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 0
      }}
    >
      {/* background lanes */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 70,
          padding: "0 120px",
          opacity: 0.55
        }}
      >
        <LayerLane
          index={1}
          label="OBSERVED"
          sublabel=""
          color={COLORS.observed}
          width={laneWidth}
          particleSpeed={180}
          particleCount={3}
        />
        <LayerLane
          index={2}
          label="INFERRED"
          sublabel=""
          color={COLORS.inferred}
          width={laneWidth}
          particleSpeed={135}
          particleCount={4}
        />
        <LayerLane
          index={3}
          label="SIMULATED"
          sublabel=""
          color={COLORS.simulated}
          width={laneWidth}
          particleSpeed={240}
          particleCount={3}
        />
      </div>

      {/* overlay vignette to make the headline readable */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(9,9,11,0.8), rgba(9,9,11,0.95))"
        }}
      />

      {/* headline */}
      <div
        style={{
          position: "relative",
          opacity: reveal,
          transform: `translateY(${translateY}px)`,
          textAlign: "center",
          padding: "0 120px"
        }}
      >
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 92,
            fontWeight: 400,
            color: COLORS.ink0,
            letterSpacing: "-0.032em",
            lineHeight: 1.05,
            fontFeatureSettings: "'ss01'",
            maxWidth: 1500,
            margin: "0 auto"
          }}
        >
          Personalization your agents can{" "}
          <span
            style={{
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            actually
          </span>{" "}
          reason about.
        </div>
      </div>
    </AbsoluteFill>
  );
};
