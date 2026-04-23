import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { LayerLane } from "../components/LayerLane";
import { DataCard } from "../components/DataCard";
import { TraitPill } from "../components/TraitPill";
import { PredictionCard } from "../components/PredictionCard";
import { Eyebrow } from "../components/Eyebrow";

/**
 * 0:16 – 0:28 · The signature three-layer reveal.
 *
 * Entry simulates flying through the previous scene's phone into the
 * anatomy of how PSON5 actually stores things. Each lane unfurls its
 * cards in sequence. The whole thing tilts in slight 3D perspective so it
 * feels like looking into the system, not at a spreadsheet.
 */
export const ThreeLayers: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "Flying in" from depth
  const flightProgress = spring({ frame, fps, config: SPRING_SOFT });
  const flightScale = interpolate(flightProgress, [0, 1], [1.35, 1]);
  const flightBlur = interpolate(flightProgress, [0, 1], [16, 0]);
  const flightOpacity = interpolate(flightProgress, [0, 1], [0, 1]);

  const headlineReveal = interpolate(frame, [296, 340], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const headlineY = interpolate(headlineReveal, [0, 1], [20, 0]);

  const exit = interpolate(frame, [340, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const laneWidth = 1520;

  return (
    <AbsoluteFill
      style={{
        opacity: flightOpacity * exit,
        padding: "70px 120px 50px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        transform: `scale(${flightScale})`,
        filter: `blur(${flightBlur}px)`,
        perspective: "2000px"
      }}
    >
      {/* Top eyebrow */}
      <div style={{ marginBottom: 8 }}>
        <Eyebrow label="Anatomy · how PSON stores a profile" accent={COLORS.accent} />
      </div>

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
            appearAt={26}
            label="primary_language"
            value='"rust"'
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={42}
            label="turned_down_faang"
            value="true"
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={58}
            label="favorite_stage"
            value='"early_stage"'
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={74}
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
            appearAt={116}
            label="values_technical_autonomy"
            confidence={0.78}
          />
          <TraitPill
            appearAt={136}
            label="deadline_driven_activation"
            confidence={0.74}
          />
          <TraitPill
            appearAt={156}
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
            appearAt={200}
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
          marginTop: 18,
          opacity: headlineReveal,
          transform: `translateY(${headlineY}px)`,
          fontFamily: FONT.display,
          fontSize: 58,
          fontWeight: 400,
          color: COLORS.ink0,
          letterSpacing: "-0.025em",
          lineHeight: 1,
          textAlign: "center"
        }}
      >
        Three layers. Three types of{" "}
        <span
          style={{
            fontStyle: "italic",
            color: COLORS.accent,
            fontVariationSettings: "'SOFT' 100"
          }}
        >
          certainty.
        </span>
      </div>
    </AbsoluteFill>
  );
};
