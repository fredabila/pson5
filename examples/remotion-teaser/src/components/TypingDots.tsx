import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../style/tokens";

type Props = {
  color?: string;
};

/**
 * The "…" while an agent is thinking. Three dots that bounce in sequence.
 */
export const TypingDots: React.FC<Props> = ({ color = COLORS.ink2 }) => {
  const frame = useCurrentFrame();

  const bounce = (offset: number) => {
    const phase = ((frame + offset) % 24) / 24;
    const y = Math.sin(phase * Math.PI * 2) * 4;
    const opacity = 0.55 + 0.45 * Math.abs(Math.sin(phase * Math.PI));
    return { transform: `translateY(${y}px)`, opacity };
  };

  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "4px 0" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, ...bounce(0) }} />
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, ...bounce(6) }} />
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, ...bounce(12) }} />
    </div>
  );
};
