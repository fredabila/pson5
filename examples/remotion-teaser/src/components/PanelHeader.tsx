import React from "react";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  label: string;
  accent?: string;
  align?: "left" | "right" | "center";
};

/**
 * The header used above each column in the split-screen scenes. Small mono
 * eyebrow with an accent underline.
 */
export const PanelHeader: React.FC<Props> = ({ label, accent = COLORS.ink2, align = "left" }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"
      }}
    >
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 13,
          letterSpacing: "0.22em",
          color: accent,
          textTransform: "uppercase",
          fontWeight: 500
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: 48,
          height: 1,
          background: accent,
          marginTop: 8,
          opacity: 0.9
        }}
      />
    </div>
  );
};
