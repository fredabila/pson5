import React from "react";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  label: string;
  color?: string;
  size?: number;
};

/**
 * Mono eyebrow with a short hairline prefix — matches the landing's eyebrow
 * style exactly. Use sparingly; one per visual block.
 */
export const Eyebrow: React.FC<Props> = ({ label, color = COLORS.ink2, size = 16 }) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        color,
        fontFamily: FONT.mono,
        fontSize: size,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        fontWeight: 500
      }}
    >
      <span
        style={{
          width: 24,
          height: 1,
          background: color === COLORS.ink2 ? COLORS.ink3 : color,
          display: "inline-block"
        }}
      />
      {label}
    </div>
  );
};
