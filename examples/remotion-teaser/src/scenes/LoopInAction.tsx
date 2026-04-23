import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { ChatBubble } from "../components/ChatBubble";
import { DataCard } from "../components/DataCard";
import { TraitPill } from "../components/TraitPill";
import { Eyebrow } from "../components/Eyebrow";
import { TimeMarker } from "../components/TimeMarker";

/**
 * 0:28 – 0:38 · Passive extraction during natural conversation.
 *
 * Left: chat UI with casual exchange. Right: a growing profile panel that
 * captures facts as the user drops them, plus a timelapse ticker showing
 * the profile compounding over 30 days.
 */
export const LoopInAction: React.FC = () => {
  const frame = useCurrentFrame();

  const layoutReveal = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });

  const captionReveal = interpolate(frame, [90, 108], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const exit = interpolate(frame, [280, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        padding: "72px 100px",
        display: "flex",
        gap: 48,
        opacity: layoutReveal * exit
      }}
    >
      {/* CHAT column */}
      <div
        style={{
          flex: "0 0 640px",
          display: "flex",
          flexDirection: "column",
          gap: 0
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <Eyebrow label="Natural conversation" accent={COLORS.accent} />
        </div>

        <ChatBubble
          from="user"
          message="I just started contributing to an observability tool this week."
          appearAt={12}
          typeSpeed={1.2}
        />
        <ChatBubble
          from="agent"
          message="Nice — want to ship it publicly, or keep it internal?"
          appearAt={68}
          typeSpeed={1.2}
        />
        <ChatBubble
          from="user"
          message="Public. I think the CLI I'm writing solves a real problem."
          appearAt={130}
          typeSpeed={1.2}
        />

        {/* caption below chat */}
        <div style={{ marginTop: 16, opacity: captionReveal }}>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: COLORS.ink3,
              letterSpacing: "0.18em",
              textTransform: "uppercase"
            }}
          >
            Captured silently · never leaves the boundary · ready on the next turn
          </div>
        </div>
      </div>

      {/* PROFILE compounding column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "relative"
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <Eyebrow label="Profile · compounding" accent={COLORS.observed} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <TimeMarker
            frames={[
              { at: 0, label: "DAY 01" },
              { at: 150, label: "DAY 07" },
              { at: 210, label: "DAY 30" }
            ]}
          />
        </div>

        {/* A grid of cards materialising over time */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            alignContent: "start"
          }}
        >
          <DataCard
            appearAt={60}
            label="side_project"
            value='"observability_tool"'
            color={COLORS.observed}
            tag="just captured"
          />
          <DataCard
            appearAt={80}
            label="public_work_preference"
            value='"ship_in_public"'
            color={COLORS.observed}
            tag="observed"
          />

          {/* Day 7 wave */}
          <DataCard
            appearAt={156}
            label="pairing_preference"
            value='"sharp_peers"'
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={170}
            label="learning_modality"
            value='"live_walkthrough"'
            color={COLORS.observed}
            tag="observed"
          />
          <TraitPill
            appearAt={184}
            label="values_technical_leverage"
            confidence={0.81}
          />

          {/* Day 30 wave */}
          <DataCard
            appearAt={216}
            label="comp_priority"
            value='"equity_and_learning"'
            color={COLORS.observed}
            tag="observed"
          />
          <DataCard
            appearAt={230}
            label="dealbreaker"
            value='"approval_gates"'
            color={COLORS.observed}
            tag="observed"
          />
          <TraitPill
            appearAt={244}
            label="constraint_clarity_heuristic"
            confidence={0.76}
          />
          <TraitPill
            appearAt={258}
            label="process_friction_intolerance"
            confidence={0.69}
          />
        </div>

        {/* A PROFILE THAT COMPOUNDS closer */}
        <div
          style={{
            marginTop: 20,
            fontFamily: FONT.display,
            fontSize: 34,
            letterSpacing: "-0.015em",
            color: COLORS.ink1,
            fontStyle: "italic",
            fontVariationSettings: "'SOFT' 80",
            opacity: interpolate(frame, [240, 276], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            })
          }}
        >
          a profile that <span style={{ color: COLORS.accent }}>compounds</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
