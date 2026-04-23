import React from "react";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  time?: string;
  signalStrength?: number; // 0-4
  batteryPercent?: number; // 0-100
  accent?: string;
};

/**
 * iOS-style status bar at the top of a phone screen. Sits beside the
 * dynamic island. Thin, restrained — just enough realism to anchor
 * the scene.
 */
export const StatusBar: React.FC<Props> = ({
  time = "9:41",
  signalStrength = 4,
  batteryPercent = 87,
  accent = COLORS.ink0
}) => {
  return (
    <div
      style={{
        height: 56,
        padding: "0 28px 0 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: FONT.body,
        fontSize: 16,
        fontWeight: 600,
        color: accent,
        position: "relative",
        zIndex: 10
      }}
    >
      <span style={{ width: 110, paddingTop: 4 }}>{time}</span>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        {/* Signal strength */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 4 + i * 2,
                borderRadius: 1,
                background: i < signalStrength ? accent : `rgba(245,244,239,0.2)`
              }}
            />
          ))}
        </div>

        {/* WiFi arc */}
        <svg width="18" height="12" viewBox="0 0 18 12">
          <path
            d="M 2 5.5 Q 9 -1 16 5.5"
            stroke={accent}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 5 7.5 Q 9 3.5 13 7.5"
            stroke={accent}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="9" cy="10" r="1" fill={accent} />
        </svg>

        {/* Battery */}
        <div
          style={{
            width: 26,
            height: 12,
            border: `1.2px solid ${accent}`,
            borderRadius: 3,
            position: "relative",
            padding: 1
          }}
        >
          <div
            style={{
              width: `${batteryPercent}%`,
              height: "100%",
              background: accent,
              borderRadius: 1.5
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -3,
              top: 3,
              width: 2,
              height: 4,
              background: accent,
              borderRadius: "0 1px 1px 0"
            }}
          />
        </div>
      </div>
    </div>
  );
};
