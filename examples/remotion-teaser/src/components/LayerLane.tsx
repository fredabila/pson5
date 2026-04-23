import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../style/tokens";

type Props = {
  index: 1 | 2 | 3;
  label: string;
  sublabel: string;
  color: string;
  width: number; // pixel width of the lane
  particleSpeed?: number; // frames per full traverse
  particleCount?: number;
  children?: React.ReactNode;
};

/**
 * One of the three signature lanes — observed / inferred / simulated. Has
 * its own colour, tick marks, and flowing particles. Children are
 * absolutely positioned inside the lane's content area.
 */
export const LayerLane: React.FC<Props> = ({
  index,
  label,
  sublabel,
  color,
  width,
  particleSpeed = 140,
  particleCount = 3,
  children
}) => {
  const frame = useCurrentFrame();
  const tickPositions = [0.2, 0.4, 0.6, 0.8];

  return (
    <div style={{ width, position: "relative" }}>
      {/* header */}
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 14,
          color,
          letterSpacing: "0.18em",
          display: "flex",
          gap: 14,
          alignItems: "baseline",
          marginBottom: 6
        }}
      >
        <span style={{ color, opacity: 0.9 }}>{String(index).padStart(2, "0")} · {label}</span>
      </div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 12,
          color: COLORS.ink2,
          letterSpacing: "0.08em",
          marginBottom: 20
        }}
      >
        {sublabel}
      </div>

      {/* the rail itself */}
      <div
        style={{
          position: "relative",
          height: 2,
          background: color,
          opacity: 0.32,
          marginBottom: 40
        }}
      >
        {/* tick marks */}
        {tickPositions.map((p) => (
          <div
            key={p}
            style={{
              position: "absolute",
              left: `${p * 100}%`,
              top: -4,
              width: 1,
              height: 10,
              background: color,
              opacity: 0.55
            }}
          />
        ))}
        {/* endpoints */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -4,
            width: 1,
            height: 10,
            background: color,
            opacity: 0.8
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: -4,
            width: 1,
            height: 10,
            background: color,
            opacity: 0.8
          }}
        />

        {/* particles */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const offset = (particleSpeed / particleCount) * i;
          const cyclePos = ((frame + offset) % particleSpeed) / particleSpeed;
          const x = cyclePos * width;
          const size = 7 - i;
          const opacity = interpolate(cyclePos, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: `calc(50% - ${size / 2}px)`,
                width: size,
                height: size,
                borderRadius: "50%",
                background: color,
                opacity,
                boxShadow: i === 0 ? `0 0 14px ${color}` : undefined
              }}
            />
          );
        })}
      </div>

      {/* content area below the rail */}
      <div
        style={{
          position: "relative",
          minHeight: 180,
          width: "100%"
        }}
      >
        {children}
      </div>
    </div>
  );
};
