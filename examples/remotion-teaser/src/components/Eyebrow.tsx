import React from "react";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  label: string;
  color?: string;
  accent?: string;
  size?: number;
};

/**
 * Mono eyebrow with a short hairline prefix — matches the landing's eyebrow
 * style exactly. Use sparingly; one per visual block. Pass `accent` to
 * colour both the hairline prefix and the label with a bright accent.
 */
export const Eyebrow: React.FC<Props> = ({ label, color, accent, size = 16 }) => {
  const effectiveColor = accent ?? color ?? COLORS.ink2;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        color: effectiveColor,
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
          background: effectiveColor === COLORS.ink2 ? COLORS.ink3 : effectiveColor,
          display: "inline-block"
        }}
      />
      {label}
    </div>
  );
};
