import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_ARRIVAL } from "../style/tokens";
import { TypeOn } from "./TypeOn";
import { AppAvatar } from "./AppAvatar";

type Props = {
  from: "user" | "agent";
  message: string;
  appearAt: number;
  typeAt?: number;
  typeSpeed?: number;
  timestamp?: string;
  meta?: string;
  tone?: "normal" | "muted";
  avatarColors?: [string, string];
  avatarInitial?: string;
  hideAvatar?: boolean;
};

/**
 * iMessage-style chat bubble. User on the right, agent on the left. Tail
 * on the appropriate bottom corner. Avatar on the agent side. Springs in
 * with a slight scale + translate for tactile feel.
 */
export const MessageBubble: React.FC<Props> = ({
  from,
  message,
  appearAt,
  typeAt,
  typeSpeed = 0.9,
  timestamp,
  meta,
  tone = "normal",
  avatarColors = [COLORS.accent, COLORS.accentDim],
  avatarInitial = "P",
  hideAvatar = false
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrival = spring({
    frame: frame - appearAt,
    fps,
    config: SPRING_ARRIVAL
  });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateY = interpolate(arrival, [0, 1], [16, 0]);
  const scale = interpolate(arrival, [0, 1], [0.92, 1]);

  const isUser = from === "user";
  const muted = tone === "muted";

  // Visual treatments:
  //   user          : near-black bubble with soft cool-blue accent, white text
  //   agent         : dark glass bubble with phosphor accent left-edge
  //   muted (left)  : both sides desaturate & the agent loses its phosphor hint
  const userBg = muted
    ? "linear-gradient(180deg, #2b2c31, #1e1f23)"
    : "linear-gradient(180deg, #3a6ff1, #2454d8)";
  const agentBg = muted
    ? "linear-gradient(180deg, #1a1b1f, #121318)"
    : "linear-gradient(180deg, #1f2024, #14151a)";

  const textColor = isUser
    ? muted
      ? COLORS.ink1
      : "#f1f5ff"
    : muted
      ? COLORS.ink1
      : COLORS.ink0;

  const radius = 22;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        transformOrigin: isUser ? "bottom right" : "bottom left",
        display: "flex",
        gap: 12,
        justifyContent: isUser ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        marginBottom: 14,
        filter: muted ? "saturate(0.45) brightness(0.94)" : "none"
      }}
    >
      {!isUser && !hideAvatar && (
        <div style={{ alignSelf: "flex-end", marginBottom: 2 }}>
          <AppAvatar
            size={34}
            initial={avatarInitial}
            colorFrom={avatarColors[0]}
            colorTo={avatarColors[1]}
            glow={!muted}
          />
        </div>
      )}

      <div
        style={{
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
          gap: 4
        }}
      >
        <div
          style={{
            position: "relative",
            background: isUser ? userBg : agentBg,
            padding: "12px 16px",
            color: textColor,
            fontFamily: FONT.body,
            fontSize: 16,
            lineHeight: 1.42,
            fontWeight: 400,
            borderRadius: isUser
              ? `${radius}px ${radius}px 6px ${radius}px`
              : `${radius}px ${radius}px ${radius}px 6px`,
            border: `1px solid ${isUser ? "rgba(255,255,255,0.08)" : COLORS.hair}`,
            boxShadow: isUser
              ? "0 4px 14px rgba(36, 84, 216, 0.18), inset 0 1px 0 rgba(255,255,255,0.1)"
              : "0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)"
          }}
        >
          {/* agent-side phosphor accent line */}
          {!isUser && !muted && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 10,
                bottom: 10,
                width: 2,
                background: COLORS.accent,
                borderRadius: 2,
                opacity: 0.55,
                boxShadow: `0 0 8px ${COLORS.accentGlow}`
              }}
            />
          )}

          <TypeOn
            text={message}
            startFrame={typeAt ?? appearAt + 6}
            charsPerFrame={typeSpeed}
            style={{ display: "block" }}
          />
        </div>

        {(timestamp || meta) && (
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 10,
              color: COLORS.ink3,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              display: "flex",
              gap: 10
            }}
          >
            {timestamp && <span>{timestamp}</span>}
            {meta && (
              <span style={{ color: muted ? COLORS.ink3 : COLORS.accent }}>
                {meta}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
