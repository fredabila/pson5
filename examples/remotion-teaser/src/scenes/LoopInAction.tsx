import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { PhoneFrame } from "../components/PhoneFrame";
import { MacWindow } from "../components/MacWindow";
import { StatusBar } from "../components/StatusBar";
import { AppHeader } from "../components/AppHeader";
import { MessageBubble } from "../components/MessageBubble";
import { DataCard } from "../components/DataCard";
import { TraitPill } from "../components/TraitPill";
import { TimeMarker } from "../components/TimeMarker";
import { Eyebrow } from "../components/Eyebrow";
import { CursorArrow } from "../components/CursorArrow";

/**
 * 0:28 – 0:38 · Phone on the left (natural conversation), Mac window on
 * the right (the profile dashboard building up in real time). A cursor
 * occasionally highlights what's arriving on the Mac side. Day counter
 * jumps Day 1 → Day 7 → Day 30.
 */
export const LoopInAction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const layoutReveal = spring({ frame, fps, config: SPRING_SOFT });
  const opacity = interpolate(layoutReveal, [0, 1], [0, 1]);
  const translateY = interpolate(layoutReveal, [0, 1], [40, 0]);

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
        opacity: opacity * exit,
        transform: `translateY(${translateY}px)`,
        padding: "70px 80px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
        perspective: "2200px"
      }}
    >
      {/* LEFT — the phone */}
      <div style={{ transform: "rotateY(6deg)" }}>
        <PhoneFrame width={420} height={860} accentGlow>
          <StatusBar accent={COLORS.ink0} />
          <AppHeader
            name="PSON Agent"
            subtitle="Learning · week 1"
            accent={COLORS.ink0}
          />
          <div style={{ padding: "22px 20px", display: "flex", flexDirection: "column" }}>
            <MessageBubble
              from="user"
              message="I just started contributing to an observability tool this week."
              appearAt={16}
              typeSpeed={1.2}
              timestamp="09:41"
            />
            <MessageBubble
              from="agent"
              message="Nice — want to ship it publicly, or keep it internal?"
              appearAt={70}
              typeSpeed={1.2}
              timestamp="09:41"
              avatarInitial="P"
            />
            <MessageBubble
              from="user"
              message="Public. I think the CLI I'm writing actually solves a real problem."
              appearAt={130}
              typeSpeed={1.2}
              timestamp="09:42"
            />
          </div>
        </PhoneFrame>
      </div>

      {/* RIGHT — the Mac dashboard */}
      <div style={{ transform: "rotateY(-4deg)", transformStyle: "preserve-3d" }}>
        <MacWindow width={880} height={620} title="pson · profile dashboard" subtitle="user_4821">
          <div style={{ padding: "28px 32px", height: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header row with time + eyebrow */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Eyebrow label="Profile · compounding" accent={COLORS.observed} />
              <TimeMarker
                frames={[
                  { at: 0, label: "DAY 01" },
                  { at: 150, label: "DAY 07" },
                  { at: 210, label: "DAY 30" }
                ]}
              />
            </div>

            {/* Stats bar */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                padding: "12px 14px",
                background: COLORS.bg0,
                border: `1px solid ${COLORS.hair}`,
                borderRadius: 10
              }}
            >
              {[
                { label: "OBSERVED", value: frame < 150 ? 4 : frame < 210 ? 12 : 28, color: COLORS.observed },
                { label: "INFERRED", value: frame < 150 ? 0 : frame < 210 ? 5 : 14, color: COLORS.inferred },
                { label: "SIMULATED", value: frame < 210 ? 0 : 3, color: COLORS.simulated },
                { label: "REV", value: Math.min(Math.floor(frame / 10) + 1, 31), color: COLORS.accent }
              ].map((stat) => (
                <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      fontFamily: FONT.mono,
                      fontSize: 9,
                      color: COLORS.ink3,
                      letterSpacing: "0.2em"
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT.display,
                      fontSize: 22,
                      color: stat.color,
                      fontWeight: 500,
                      letterSpacing: "-0.02em"
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Cards grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 12,
                alignContent: "start",
                flex: 1
              }}
            >
              <DataCard
                appearAt={40}
                label="side_project"
                value='"observability_tool"'
                color={COLORS.observed}
                tag="just captured"
              />
              <DataCard
                appearAt={60}
                label="public_work_preference"
                value='"ship_in_public"'
                color={COLORS.observed}
                tag="observed"
              />
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
              <DataCard
                appearAt={216}
                label="dealbreaker"
                value='"approval_gates"'
                color={COLORS.observed}
                tag="observed"
              />
              <TraitPill
                appearAt={232}
                label="constraint_clarity_heuristic"
                confidence={0.76}
              />
              <TraitPill
                appearAt={248}
                label="process_friction_intolerance"
                confidence={0.69}
              />
            </div>
          </div>

          {/* cursor that demonstrates items being captured */}
          <CursorArrow
            path={[
              { at: 0, x: 740, y: 200 },
              { at: 40, x: 380, y: 260 },
              { at: 70, x: 320, y: 300 },
              { at: 120, x: 600, y: 100 },
              { at: 170, x: 460, y: 340, click: true },
              { at: 220, x: 560, y: 380 },
              { at: 260, x: 680, y: 200 }
            ]}
          />
        </MacWindow>
      </div>

      {/* Caption below */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: captionReveal,
          fontFamily: FONT.mono,
          fontSize: 13,
          color: COLORS.ink3,
          letterSpacing: "0.22em",
          textTransform: "uppercase"
        }}
      >
        captured silently · never leaves the boundary · a profile that{" "}
        <span style={{ color: COLORS.accent }}>compounds</span>
      </div>
    </AbsoluteFill>
  );
};
