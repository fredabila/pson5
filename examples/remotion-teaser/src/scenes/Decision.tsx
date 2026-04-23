import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { PhoneFrame } from "../components/PhoneFrame";
import { StatusBar } from "../components/StatusBar";
import { AppHeader } from "../components/AppHeader";
import { MessageBubble } from "../components/MessageBubble";
import { TypingDots } from "../components/TypingDots";
import { ReasoningPill } from "../components/ReasoningPill";
import { Eyebrow } from "../components/Eyebrow";

/**
 * 0:38 – 0:48 · The decision moment on a single hero phone.
 *
 * Visible "simulating…" indicator with an orbiting ring, agent reply that
 * cites real traits, and the reasoning pill underneath as proof-of-work.
 */
export const Decision: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneArrival = spring({ frame, fps, config: SPRING_SOFT });
  const phoneTranslateY = interpolate(phoneArrival, [0, 1], [40, 0]);
  const phoneOpacity = interpolate(phoneArrival, [0, 1], [0, 1]);

  // Side-info reveal
  const sideOpacity = interpolate(frame, [180, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const simulatingVisible = frame >= 56 && frame < 118;

  const exit = interpolate(frame, [280, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        opacity: exit,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 60,
        padding: "0 120px"
      }}
    >
      {/* Side column — annotations */}
      <div
        style={{
          opacity: sideOpacity,
          width: 300,
          display: "flex",
          flexDirection: "column",
          gap: 34
        }}
      >
        <div>
          <Eyebrow label="Scene · the decision" accent={COLORS.accent} />
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 34,
              color: COLORS.ink0,
              marginTop: 14,
              letterSpacing: "-0.02em",
              lineHeight: 1.15
            }}
          >
            Three months in.
            <br />
            The agent{" "}
            <span
              style={{
                fontStyle: "italic",
                color: COLORS.accent,
                fontVariationSettings: "'SOFT' 100"
              }}
            >
              earns
            </span>{" "}
            its keep.
          </div>
        </div>

        <div
          style={{
            paddingTop: 18,
            borderTop: `1px solid ${COLORS.hair}`,
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}
        >
          {[
            { label: "OBSERVED FACTS", value: "47" },
            { label: "INFERRED TRAITS", value: "14" },
            { label: "HEURISTICS", value: "8" },
            { label: "SIMULATIONS CACHED", value: "6" }
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 10,
                  color: COLORS.ink3,
                  letterSpacing: "0.2em"
                }}
              >
                {stat.label}
              </span>
              <span
                style={{
                  fontFamily: FONT.display,
                  fontSize: 24,
                  color: COLORS.ink0,
                  fontWeight: 500,
                  letterSpacing: "-0.02em"
                }}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hero phone */}
      <div
        style={{
          opacity: phoneOpacity,
          transform: `translateY(${phoneTranslateY}px)`
        }}
      >
        <PhoneFrame width={500} height={980} accentGlow>
          <StatusBar accent={COLORS.ink0} />
          <AppHeader
            name="PSON Agent"
            subtitle="Month 3 · 47 facts · 14 traits"
            accent={COLORS.ink0}
          />
          <div style={{ padding: "26px 22px", display: "flex", flexDirection: "column" }}>
            <MessageBubble
              from="user"
              message="Should I take the Series A founding engineer offer, or stay at the consultancy another year?"
              appearAt={14}
              typeSpeed={1.05}
              timestamp="14:23"
            />

            {simulatingVisible && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  margin: "0 0 14px 46px",
                  background: COLORS.bg1,
                  border: `1px solid rgba(182,255,92,0.28)`,
                  borderRadius: 18
                }}
              >
                <TypingDots color={COLORS.accent} />
                <span
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: COLORS.accent
                  }}
                >
                  simulating · pson_simulate()
                </span>
                <OrbitRing />
              </div>
            )}

            {frame >= 118 && (
              <MessageBubble
                from="agent"
                message={`Based on what you've told me — Rust primary, equity over base, already turned down two big orgs for exactly this pattern — the Series A role matches.

Caveat: I don't know your current runway. If cash matters in the next 12 months, negotiate a signing bonus rather than pretend the question isn't there.`}
                appearAt={118}
                typeSpeed={0.88}
                timestamp="14:23"
                meta="· hypothesis"
              />
            )}

            {frame >= 228 && (
              <div style={{ paddingLeft: 46, marginTop: 6 }}>
                <ReasoningPill
                  appearAt={228}
                  confidence={0.74}
                  traitsCount={4}
                  observedCount={2}
                  caveatsCount={1}
                />
              </div>
            )}
          </div>
        </PhoneFrame>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Small orbiting ring for the simulating indicator — the phosphor dot
 * circles once per second.
 */
const OrbitRing: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = (frame / 30) * Math.PI * 2;
  const r = 10;
  const x = Math.cos(angle) * r;
  const y = Math.sin(angle) * r;
  return (
    <div
      style={{
        width: 26,
        height: 26,
        position: "relative",
        borderRadius: "50%",
        border: `1px dashed rgba(182, 255, 92, 0.35)`,
        marginLeft: "auto"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `calc(50% + ${x}px - 2.5px)`,
          top: `calc(50% + ${y}px - 2.5px)`,
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: COLORS.accent,
          boxShadow: `0 0 8px ${COLORS.accent}`
        }}
      />
    </div>
  );
};
