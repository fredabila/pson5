import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { LayerLane } from "../components/LayerLane";
import { DataCard } from "../components/DataCard";
import { TraitPill } from "../components/TraitPill";
import { PredictionCard } from "../components/PredictionCard";

/**
 * 0:16 – 0:28 · The signature three-layer reveal.
 *
 * Observed cards fly into the amber lane. Trait pills grow above them into
 * the phosphor lane. Finally a simulated-prediction card materialises in
 * the blue lane.
 */
export const ThreeLayers: React.FC = () => {
  const frame = useCurrentFrame();

  const laneReveal = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const laneTranslateX = interpolate(laneReveal, [0, 1], [40, 0]);

  const laneWidth = 1520;

  const headlineReveal = interpolate(frame, [300, 340], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const headlineY = interpolate(headlineReveal, [0, 1], [20, 0]);

  // Exit fade
  const exit = interpolate(frame, [340, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        opacity: laneReveal * exit,
        padding: "72px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        transform: `translateX(${laneTranslateX}px)`
      }}
    >
      {/* OBSERVED lane */}
      <LayerLane
        index={1}
        label="OBSERVED"
        sublabel="what the user said"
        color={COLORS.observed}
        width={laneWidth}
        particleSpeed={180}
        particleCount={3}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: "flex",
            gap: 14,
            flexWrap: "wrap"
          }}
        >
          <DataCard
            appearAt={30}
            label="primary_language"
            value='"rust"'
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={48}
            label="turned_down_faang"
            value="true"
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={66}
            label="favorite_stage"
            value='"early_stage"'
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={84}
            label="os_project_stars"
            value="1200"
            color={COLORS.observed}
            tag="observed"
          />
        </div>
      </LayerLane>

      {/* INFERRED lane */}
      <LayerLane
        index={2}
        label="INFERRED"
        sublabel="what the model thinks"
        color={COLORS.inferred}
        width={laneWidth}
        particleSpeed={135}
        particleCount={4}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: "flex",
            gap: 14,
            flexWrap: "wrap"
          }}
        >
          <TraitPill
            appearAt={120}
            label="values_technical_autonomy"
            confidence={0.78}
          />
          <TraitPill
            appearAt={140}
            label="deadline_driven_activation"
            confidence={0.74}
          />
          <TraitPill
            appearAt={160}
            label="optionality_over_stability"
            confidence={0.71}
          />
        </div>
      </LayerLane>

      {/* SIMULATED lane */}
      <LayerLane
        index={3}
        label="SIMULATED"
        sublabel="what the engine predicts"
        color={COLORS.simulated}
        width={laneWidth}
        particleSpeed={240}
        particleCount={3}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0
          }}
        >
          <PredictionCard
            appearAt={210}
            scenario="Cold FAANG recruiter pitch"
            prediction="likely_decline"
            confidence={0.72}
            reasoningCount={3}
            observedCount={4}
          />
        </div>
      </LayerLane>

      {/* Closing headline */}
      <div
        style={{
          marginTop: 20,
          opacity: headlineReveal,
          transform: `translateY(${headlineY}px)`,
          fontFamily: FONT.display,
          fontSize: 56,
          fontWeight: 400,
          color: COLORS.ink0,
          letterSpacing: "-0.025em",
          lineHeight: 1,
          textAlign: "center"
        }}
      >
        Three layers. Three types of{" "}
        <span style={{ fontStyle: "italic", color: COLORS.accent, fontVariationSettings: "'SOFT' 100" }}>
          certainty.
        </span>
      </div>
    </AbsoluteFill>
  );
};
