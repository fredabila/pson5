import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS } from "../style/tokens";

/**
 * The same dotted-grid + edge-glow backdrop used on the PSON5 landing.
 * Rendered once at the root so every scene inherits it.
 */
export const Backdrop: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* base gradient */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${COLORS.bg1} 0%, ${COLORS.bg0} 100%)`
        }}
      />

      {/* dotted grid, masked at the bottom */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(245, 244, 239, 0.05) 1px, transparent 0)`,
          backgroundSize: "36px 36px",
          maskImage: "linear-gradient(180deg, black 0%, black 80%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(180deg, black 0%, black 80%, transparent 100%)"
        }}
      />

      {/* phosphor edge glow, top */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${COLORS.accentGlow}, transparent 60%)`,
          opacity: 0.6
        }}
      />

      {/* cool edge glow, bottom-right */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 30% at 100% 100%, rgba(142,199,255,0.06), transparent 60%)`
        }}
      />

      {/* corner brackets */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <g stroke="rgba(245, 244, 239, 0.14)" fill="none" strokeWidth="1.5">
          <path d="M 32 32 L 80 32 L 80 80" />
          <path d="M 1888 32 L 1840 32 L 1840 80" />
          <path d="M 32 1048 L 80 1048 L 80 1000" />
          <path d="M 1888 1048 L 1840 1048 L 1840 1000" />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
