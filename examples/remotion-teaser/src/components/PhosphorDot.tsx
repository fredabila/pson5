import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../style/tokens";

type Props = {
  size?: number;
  glow?: number;
  intensity?: number; // 0-1, multiplies pulse
};

/**
 * The signature phosphor dot — used in the hook, tagline, and wordmark.
 * Pulses at roughly 0.4 Hz with a soft glow halo.
 */
export const PhosphorDot: React.FC<Props> = ({ size = 14, glow = 40, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.45 * Math.sin(frame / 22);
  const alpha = 0.6 + 0.4 * pulse;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -glow,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.accent} 0%, transparent 60%)`,
          opacity: 0.35 * pulse * intensity,
          filter: "blur(14px)"
        }}
      />
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: COLORS.accent,
          opacity: alpha * intensity,
          boxShadow: `0 0 ${10 + 14 * pulse}px ${COLORS.accent}`
        }}
      />
    </div>
  );
};
