import React from "react";
import { COLORS } from "../style/tokens";

type Props = {
  width?: number;
  height?: number;
  tilt?: number; // y-axis rotation degrees, negative tilts left
  perspective?: number;
  children: React.ReactNode;
  accentGlow?: boolean;
  style?: React.CSSProperties;
};

/**
 * iPhone-class phone mockup.
 *
 *  - titanium outer shell with subtle bevel gradient
 *  - dynamic island at top
 *  - optional perspective tilt for the Scene 2 split-screen
 *  - optional phosphor-green ambient glow for the "With PSON5" side
 *
 * Children render inside the full screen area (including under the island).
 * Wrap them in <StatusBar/> + <AppHeader/> as needed.
 */
export const PhoneFrame: React.FC<Props> = ({
  width = 460,
  height = 920,
  tilt = 0,
  perspective = 1600,
  children,
  accentGlow = false,
  style
}) => {
  const bezel = 14;
  const screenRadius = 48;
  const outerRadius = 60;

  return (
    <div
      style={{
        width,
        height,
        perspective: `${perspective}px`,
        position: "relative",
        ...style
      }}
    >
      {/* Ambient glow behind phone */}
      {accentGlow && (
        <div
          style={{
            position: "absolute",
            inset: -120,
            background: `radial-gradient(ellipse at center, ${COLORS.accentGlow} 0%, transparent 60%)`,
            filter: "blur(30px)",
            opacity: 0.7,
            pointerEvents: "none"
          }}
        />
      )}

      {/* Drop shadow layer (separate so glow doesn't absorb it) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotateY(${tilt}deg)`,
          transformStyle: "preserve-3d",
          filter: `drop-shadow(0 40px 90px rgba(0,0,0,0.55)) drop-shadow(0 8px 20px rgba(0,0,0,0.4))`
        }}
      >
        {/* Titanium outer shell */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: outerRadius,
            background: `
              linear-gradient(135deg, #28292e 0%, #1a1b1f 35%, #131418 65%, #1f2024 100%)
            `,
            boxShadow: `
              inset 0 1.5px 0 rgba(255, 255, 255, 0.08),
              inset 0 -1.5px 0 rgba(0, 0, 0, 0.6),
              inset 2px 0 0 rgba(255, 255, 255, 0.04),
              inset -2px 0 0 rgba(255, 255, 255, 0.04)
            `
          }}
        />

        {/* Screen */}
        <div
          style={{
            position: "absolute",
            inset: bezel,
            borderRadius: screenRadius,
            background: COLORS.bg0,
            overflow: "hidden",
            boxShadow: `
              inset 0 0 0 1px rgba(0, 0, 0, 0.8),
              inset 0 0 0 2px rgba(255, 255, 255, 0.02)
            `
          }}
        >
          {/* Content */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden"
            }}
          >
            {children}
          </div>

          {/* Dynamic Island (above content, centered) */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              width: 120,
              height: 34,
              borderRadius: 20,
              background: "#000",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 14,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)"
            }}
          >
            {/* camera dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#0a0a0c",
                boxShadow: "inset 0 0 0 1px rgba(100, 140, 160, 0.4), 0 0 0 2px rgba(0,0,0,0.8)"
              }}
            />
          </div>

          {/* Home indicator */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 140,
              height: 4,
              borderRadius: 4,
              background: "rgba(245, 244, 239, 0.36)",
              zIndex: 50
            }}
          />
        </div>

        {/* Side button details */}
        <div
          style={{
            position: "absolute",
            right: -2,
            top: 160,
            width: 3,
            height: 72,
            background: "linear-gradient(180deg, #35363b 0%, #1a1b1f 100%)",
            borderRadius: 2
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -2,
            top: 260,
            width: 3,
            height: 90,
            background: "linear-gradient(180deg, #35363b 0%, #1a1b1f 100%)",
            borderRadius: 2
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -2,
            top: 180,
            width: 3,
            height: 32,
            background: "linear-gradient(180deg, #35363b 0%, #1a1b1f 100%)",
            borderRadius: 2
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -2,
            top: 232,
            width: 3,
            height: 60,
            background: "linear-gradient(180deg, #35363b 0%, #1a1b1f 100%)",
            borderRadius: 2
          }}
        />
      </div>
    </div>
  );
};
