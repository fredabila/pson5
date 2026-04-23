import React from "react";
import { COLORS, FONT } from "../style/tokens";
import { AppAvatar } from "./AppAvatar";

type Props = {
  name: string;
  subtitle?: string;
  avatarColors?: [string, string];
  accent?: string;
};

/**
 * Chat app header — sits under the status bar. Back arrow, avatar, contact
 * name + subtitle. Subtle hairline divider underneath.
 */
export const AppHeader: React.FC<Props> = ({
  name,
  subtitle = "Active now",
  avatarColors = [COLORS.accent, COLORS.accentDim],
  accent = COLORS.ink0
}) => {
  return (
    <div
      style={{
        padding: "16px 24px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderBottom: `1px solid ${COLORS.hair}`,
        position: "relative",
        zIndex: 5
      }}
    >
      {/* back arrow */}
      <svg width="20" height="20" viewBox="0 0 20 20">
        <path
          d="M 12 4 L 6 10 L 12 16"
          stroke={accent}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.5"
        />
      </svg>

      <AppAvatar
        size={40}
        initial={name[0] ?? "A"}
        colorFrom={avatarColors[0]}
        colorTo={avatarColors[1]}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            fontFamily: FONT.body,
            fontSize: 16,
            fontWeight: 600,
            color: accent,
            letterSpacing: "-0.01em"
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            color: COLORS.ink2,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: COLORS.accent,
              boxShadow: `0 0 6px ${COLORS.accent}`
            }}
          />
          {subtitle}
        </div>
      </div>
    </div>
  );
};
