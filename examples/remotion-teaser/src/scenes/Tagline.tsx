import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { LayerLane } from "../components/LayerLane";

/**
 * 0:48 – 0:54 · Tagline over three flowing lanes. The lanes now tilt
 * slightly in 3D perspective and the headline rises from soft blur.
 */
export const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({ frame, fps, config: SPRING_SOFT });
  const translateY = interpolate(arrival, [0, 1], [22, 0]);
  const blur = interpolate(arrival, [0, 1], [12, 0]);
  const opacity = interpolate(arrival, [0, 1], [0, 1]);

  const exit = interpolate(frame, [160, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const laneWidth = 1680;
  const emphasizedWord = interpolate(frame, [32, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        opacity: exit,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}
    >
      {/* tilted lanes in background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 68,
          padding: "0 120px",
          perspective: "1800px",
          transform: "rotateX(6deg)",
          opacity: 0.45
        }}
      >
        <LayerLane
          index={1}
          label="OBSERVED"
          sublabel=""
          color={COLORS.observed}
          width={laneWidth}
          particleSpeed={180}
          particleCount={4}
        />
        <LayerLane
          index={2}
          label="INFERRED"
          sublabel=""
          color={COLORS.inferred}
          width={laneWidth}
          particleSpeed={135}
          particleCount={5}
        />
        <LayerLane
          index={3}
          label="SIMULATED"
          sublabel=""
          color={COLORS.simulated}
          width={laneWidth}
          particleSpeed={240}
          particleCount={4}
        />
      </div>

      {/* vignette so the type is readable */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 75% 60% at 50% 50%, rgba(9,9,11,0.75), rgba(9,9,11,0.96))"
        }}
      />

      {/* headline */}
      <div
        style={{
          position: "relative",
          opacity,
          transform: `translateY(${translateY}px)`,
          filter: `blur(${blur}px)`,
          textAlign: "center",
          padding: "0 120px"
        }}
      >
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 108,
            fontWeight: 400,
            color: COLORS.ink0,
            letterSpacing: "-0.035em",
            lineHeight: 1.02,
            fontFeatureSettings: "'ss01'",
            maxWidth: 1600,
            margin: "0 auto"
          }}
        >
          Personalization your agents can{" "}
          <span
            style={{
              position: "relative",
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            actually
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -14,
                height: 3,
                background: COLORS.accent,
                boxShadow: `0 0 14px ${COLORS.accentGlow}`,
                transform: `scaleX(${emphasizedWord})`,
                transformOrigin: "left",
                borderRadius: 2
              }}
            />
          </span>{" "}
          reason about.
        </div>
      </div>
    </AbsoluteFill>
  );
};
