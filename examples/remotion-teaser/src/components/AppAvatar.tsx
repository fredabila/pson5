import React from "react";
import { COLORS } from "../style/tokens";

type Props = {
  size?: number;
  initial?: string;
  colorFrom?: string;
  colorTo?: string;
  glow?: boolean;
  style?: React.CSSProperties;
};

/**
 * Small rounded-square "app icon" or chat avatar, with a subtle gradient
 * and inner highlight. Works at any size from 24 (status) to 80 (hero).
 */
export const AppAvatar: React.FC<Props> = ({
  size = 44,
  initial = "P",
  colorFrom = COLORS.accent,
  colorTo = COLORS.accentDim,
  glow = false,
  style
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.bg0,
        fontWeight: 700,
        fontSize: size * 0.44,
        letterSpacing: "-0.02em",
        position: "relative",
        boxShadow: glow
          ? `0 0 20px ${COLORS.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.25)`
          : `inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(0,0,0,0.3)`,
        fontFamily: "inherit",
        flexShrink: 0,
        ...style
      }}
    >
      {/* two-bar layer motif */}
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        style={{ opacity: 0.92 }}
      >
        <rect x="4" y="7" width="16" height="1.6" rx="0.8" fill={COLORS.bg0} />
        <rect x="4" y="11.4" width="16" height="1.6" rx="0.8" fill={COLORS.bg0} opacity="0.65" />
        <rect x="4" y="15.8" width="16" height="1.6" rx="0.8" fill={COLORS.bg0} opacity="0.3" />
      </svg>
    </div>
  );
};
