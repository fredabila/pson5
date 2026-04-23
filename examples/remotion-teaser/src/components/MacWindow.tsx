import React from "react";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  width?: number;
  height?: number;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/**
 * macOS-style window chrome. Used for the dashboard-style panel that shows
 * the profile compounding alongside the phone chat.
 *
 *  - three traffic-light buttons (red / yellow / green) with radial gradient
 *  - thin inset highlight on the top edge
 *  - soft drop shadow
 *  - title in the center, optional subtitle to the right
 */
export const MacWindow: React.FC<Props> = ({
  width = 980,
  height = 680,
  title = "PSON Console · /console",
  subtitle,
  children,
  style
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 14,
        background: COLORS.bg1,
        boxShadow: `
          0 50px 100px rgba(0, 0, 0, 0.55),
          0 12px 30px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(245, 244, 239, 0.06)
        `,
        border: `1px solid ${COLORS.hair}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        ...style
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: `linear-gradient(180deg, rgba(245,244,239,0.03) 0%, transparent 100%)`,
          borderBottom: `1px solid ${COLORS.hair}`,
          flexShrink: 0,
          position: "relative"
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[
            { fill: "#ff5f57", shadow: "#bf3c34" },
            { fill: "#febc2e", shadow: "#b28a16" },
            { fill: "#28c840", shadow: "#1a8d2e" }
          ].map((c, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: `radial-gradient(circle at 30% 30%, ${c.fill}, ${c.shadow})`,
                boxShadow: `inset 0 0 0 0.5px rgba(0,0,0,0.3)`
              }}
            />
          ))}
        </div>

        {/* Title + subtitle centered */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 12,
            alignItems: "baseline"
          }}
        >
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: COLORS.ink1,
              letterSpacing: "0.02em"
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                color: COLORS.ink3,
                letterSpacing: "0.04em"
              }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {/* spacer on the right for balance */}
        <div style={{ width: 50 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {children}
      </div>
    </div>
  );
};
