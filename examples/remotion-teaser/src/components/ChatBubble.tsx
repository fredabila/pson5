import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_ARRIVAL } from "../style/tokens";
import { TypeOn } from "./TypeOn";

type Props = {
  from: "user" | "agent";
  message: string;
  appearAt: number; // frame at which the bubble appears
  typeAt?: number; // frame at which typewriter starts (defaults to appearAt + 12)
  typeSpeed?: number;
  meta?: string;
  tone?: "normal" | "muted"; // muted for the "Without PSON5" generic response
  wide?: boolean;
};

/**
 * Asymmetric chat bubble. User messages right-align, agent messages
 * left-align. Sharp corner on the speaker side, soft corners elsewhere —
 * a small detail that keeps it from looking like a generic SaaS bubble.
 */
export const ChatBubble: React.FC<Props> = ({
  from,
  message,
  appearAt,
  typeAt,
  typeSpeed = 0.8,
  meta,
  tone = "normal",
  wide = false
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({
    frame: frame - appearAt,
    fps,
    config: SPRING_ARRIVAL
  });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translate = interpolate(arrival, [0, 1], [14, 0]);

  const isUser = from === "user";
  const mutedFilter = tone === "muted" ? "saturate(0.55) brightness(0.92)" : "none";

  const bubbleBg = isUser ? COLORS.bg2 : tone === "muted" ? COLORS.bg1 : COLORS.bg1;
  const edge = isUser ? COLORS.ink3 : tone === "muted" ? COLORS.ink3 : COLORS.accent;
  const edgeOpacity = tone === "muted" ? 0.2 : 0.5;
  const textColor = tone === "muted" ? COLORS.ink1 : COLORS.ink0;

  const speakerLabel = isUser ? "USER" : "AGENT";
  const speakerColor = isUser ? COLORS.ink3 : tone === "muted" ? COLORS.ink3 : COLORS.accent;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translate}px)`,
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        filter: mutedFilter,
        marginBottom: 20
      }}
    >
      <div
        style={{
          maxWidth: wide ? 720 : 560,
          background: bubbleBg,
          border: `1px solid ${COLORS.hair}`,
          borderRadius: isUser
            ? "16px 4px 16px 16px"
            : "4px 16px 16px 16px", // sharp corner on the speaker side
          padding: "18px 22px",
          position: "relative"
        }}
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            letterSpacing: "0.18em",
            color: speakerColor,
            marginBottom: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16
          }}
        >
          <span>{speakerLabel}</span>
          {meta && (
            <span style={{ color: COLORS.ink3, letterSpacing: "0.1em", fontSize: 10 }}>
              {meta}
            </span>
          )}
        </div>

        <div
          style={{
            fontFamily: FONT.body,
            fontSize: 22,
            lineHeight: 1.52,
            color: textColor,
            fontWeight: 400
          }}
        >
          <TypeOn text={message} startFrame={typeAt ?? appearAt + 8} charsPerFrame={typeSpeed} />
        </div>

        {/* hairline speaker indicator */}
        <div
          style={{
            position: "absolute",
            left: isUser ? "auto" : -1,
            right: isUser ? -1 : "auto",
            top: 18,
            bottom: 18,
            width: 2,
            background: edge,
            opacity: edgeOpacity,
            borderRadius: 2
          }}
        />
      </div>
    </div>
  );
};
