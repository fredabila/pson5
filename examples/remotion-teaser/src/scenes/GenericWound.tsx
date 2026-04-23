import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";
import { ChatBubble } from "../components/ChatBubble";
import { PanelHeader } from "../components/PanelHeader";
import { TypingDots } from "../components/TypingDots";

/**
 * 0:06 – 0:16 · Split-screen: WITHOUT vs WITH PSON5.
 *
 * Same user question feeds two agents in parallel. The generic one produces
 * a flat list; the PSON-backed one produces a specific, context-aware reply
 * that name-drops real observed facts.
 */
export const GenericWound: React.FC = () => {
  const frame = useCurrentFrame();

  // headers drop in at the start
  const headerReveal = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const headerY = interpolate(headerReveal, [0, 1], [-14, 0]);

  // divider draws in
  const dividerHeight = interpolate(frame, [12, 40], [0, 800], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  // typing dots show frames 50-76 on both sides
  const typingVisible = frame >= 50 && frame < 76;

  // scene-wide exit fade
  const exit = interpolate(frame, [280, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill style={{ opacity: exit, padding: "72px 80px", display: "flex" }}>
      {/* LEFT panel */}
      <div
        style={{
          flex: 1,
          paddingRight: 48,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          opacity: headerReveal,
          transform: `translateY(${headerY}px)`,
          filter: frame > 120 ? "saturate(0.55) brightness(0.92)" : "none",
          transition: "filter 400ms"
        }}
      >
        <PanelHeader label="Without PSON5" accent={COLORS.ink2} />

        <ChatBubble
          from="user"
          message="Help me think about my next job move."
          appearAt={28}
          typeSpeed={1.3}
        />

        {typingVisible && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <TypingDots />
          </div>
        )}

        {frame >= 76 && (
          <ChatBubble
            from="agent"
            message={`Here are some common steps for a job search:
1. Update your resume
2. Network on LinkedIn
3. Practice common interview questions
4. Tailor applications to each role`}
            appearAt={76}
            typeSpeed={1.3}
            meta="0ms of context"
            tone="muted"
          />
        )}
      </div>

      {/* DIVIDER */}
      <div
        style={{
          width: 1,
          height: dividerHeight,
          background: COLORS.hair,
          alignSelf: "center",
          position: "relative"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -1,
            top: 0,
            width: 3,
            height: 120,
            background: COLORS.accent,
            opacity: 0.6,
            filter: "blur(8px)"
          }}
        />
      </div>

      {/* RIGHT panel */}
      <div
        style={{
          flex: 1,
          paddingLeft: 48,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          opacity: headerReveal,
          transform: `translateY(${headerY}px)`
        }}
      >
        <PanelHeader label="With PSON5" accent={COLORS.accent} />

        <ChatBubble
          from="user"
          message="Help me think about my next job move."
          appearAt={28}
          typeSpeed={1.3}
        />

        {typingVisible && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <TypingDots color={COLORS.accent} />
          </div>
        )}

        {frame >= 76 && (
          <ChatBubble
            from="agent"
            message={`Given you turned down two FAANG offers in the last 18 months and just hit 1.2k stars on your OS project, I don't think another platform role would land well. Founding engineer at a Series A is where your pattern actually points.`}
            appearAt={76}
            typeSpeed={1.05}
            meta="42 observed · 9 inferred"
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
