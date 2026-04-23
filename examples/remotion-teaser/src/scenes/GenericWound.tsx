import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { PhoneFrame } from "../components/PhoneFrame";
import { StatusBar } from "../components/StatusBar";
import { AppHeader } from "../components/AppHeader";
import { MessageBubble } from "../components/MessageBubble";
import { TypingDots } from "../components/TypingDots";
import { PanelHeader } from "../components/PanelHeader";

/**
 * 0:06 – 0:16 · Two iPhones side by side in subtle 3D perspective.
 *
 * Left phone (tilted to the right) runs a generic assistant app — muted
 * tones, desaturated colour, no personalization. Right phone (tilted to
 * the left) runs a PSON-backed agent — phosphor accent, contextual
 * reply that cites real observed facts.
 */
export const GenericWound: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phones rise from below and settle
  const phoneArrival = spring({ frame, fps, config: SPRING_SOFT });
  const phoneTranslateY = interpolate(phoneArrival, [0, 1], [80, 0]);
  const phoneOpacity = interpolate(phoneArrival, [0, 1], [0, 1]);

  // Headers fade in
  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });

  // Typing indicator window
  const typingVisible = frame >= 44 && frame < 72;

  // Scene exit
  const exit = interpolate(frame, [280, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  // Camera zoom-out on right phone at end (nudging into ThreeLayers transition)
  const zoomBoost = interpolate(frame, [260, 300], [1, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Column headers above the phones */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 580,
          opacity: headerOpacity
        }}
      >
        <PanelHeader label="Without PSON5" accent={COLORS.ink2} />
        <PanelHeader label="With PSON5" accent={COLORS.accent} />
      </div>

      {/* Two phones in 3D perspective */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 80,
          perspective: "2000px",
          transformStyle: "preserve-3d",
          paddingTop: 30
        }}
      >
        {/* LEFT phone */}
        <div
          style={{
            opacity: phoneOpacity,
            transform: `translateY(${phoneTranslateY}px)`,
            filter: frame > 100 ? "saturate(0.55)" : "none",
            transition: "filter 400ms"
          }}
        >
          <PhoneFrame width={440} height={900} tilt={5}>
            <StatusBar accent={COLORS.ink1} />
            <AppHeader
              name="AI Assistant"
              subtitle="Standard"
              accent={COLORS.ink1}
              avatarColors={[COLORS.ink2, COLORS.ink3]}
            />
            <div style={{ padding: "28px 22px", display: "flex", flexDirection: "column" }}>
              <MessageBubble
                from="user"
                message="Help me think about my next job move."
                appearAt={22}
                typeSpeed={1.2}
                tone="muted"
                timestamp="09:41"
              />

              {typingVisible && (
                <div style={{ paddingLeft: 46, marginBottom: 14 }}>
                  <TypingDots color={COLORS.ink3} />
                </div>
              )}

              {frame >= 72 && (
                <MessageBubble
                  from="agent"
                  message={`Here are some common steps for a job search:
1. Update your resume
2. Network on LinkedIn
3. Practice common interview questions
4. Tailor applications to each role`}
                  appearAt={72}
                  typeSpeed={1.25}
                  tone="muted"
                  meta="0 ms of context"
                  timestamp="09:41"
                  avatarColors={[COLORS.ink2, COLORS.ink3]}
                  avatarInitial="A"
                />
              )}
            </div>
          </PhoneFrame>
        </div>

        {/* RIGHT phone */}
        <div
          style={{
            opacity: phoneOpacity,
            transform: `translateY(${phoneTranslateY}px) scale(${zoomBoost})`
          }}
        >
          <PhoneFrame width={440} height={900} tilt={-5} accentGlow>
            <StatusBar accent={COLORS.ink0} />
            <AppHeader
              name="PSON Agent"
              subtitle="Active · reading your profile"
              accent={COLORS.ink0}
              avatarColors={[COLORS.accent, COLORS.accentDim]}
            />
            <div style={{ padding: "28px 22px", display: "flex", flexDirection: "column" }}>
              <MessageBubble
                from="user"
                message="Help me think about my next job move."
                appearAt={22}
                typeSpeed={1.2}
                timestamp="09:41"
              />

              {typingVisible && (
                <div style={{ paddingLeft: 46, marginBottom: 14 }}>
                  <TypingDots color={COLORS.accent} />
                </div>
              )}

              {frame >= 72 && (
                <MessageBubble
                  from="agent"
                  message={`Given you turned down two FAANG offers in the last 18 months and just hit 1.2k stars on your OS project, I don't think another platform role would land well. Founding engineer at a Series A is where your pattern actually points.`}
                  appearAt={72}
                  typeSpeed={0.95}
                  meta="42 observed · 9 inferred"
                  timestamp="09:41"
                  avatarInitial="P"
                />
              )}
            </div>
          </PhoneFrame>
        </div>
      </div>

      {/* Bottom caption */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [160, 200], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          }),
          fontFamily: FONT.display,
          fontSize: 34,
          fontStyle: "italic",
          fontVariationSettings: "'SOFT' 100",
          color: COLORS.ink1,
          letterSpacing: "-0.015em"
        }}
      >
        same question · <span style={{ color: COLORS.accent }}>very different</span> answer
      </div>
    </AbsoluteFill>
  );
};
