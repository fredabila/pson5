import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

type Props = {
  path: Array<{ at: number; x: number; y: number; click?: boolean }>;
  scale?: number;
};

/**
 * Classic arrow cursor that moves through a sequence of waypoints with
 * easing. Optional "click" at a waypoint renders a ripple.
 */
export const CursorArrow: React.FC<Props> = ({ path, scale = 1 }) => {
  const frame = useCurrentFrame();

  // Determine current segment
  let currentX = path[0]?.x ?? 0;
  let currentY = path[0]?.y ?? 0;

  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    if (frame >= from.at && frame <= to.at) {
      const t = (frame - from.at) / Math.max(1, to.at - from.at);
      // ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      currentX = from.x + (to.x - from.x) * eased;
      currentY = from.y + (to.y - from.y) * eased;
      break;
    }
    if (frame > to.at) {
      currentX = to.x;
      currentY = to.y;
    }
  }

  // Detect a recent click (within 12 frames of a click waypoint)
  const clickPoint = path.find(
    (p) => p.click && frame >= p.at && frame < p.at + 16
  );

  return (
    <>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        style={{
          position: "absolute",
          left: currentX,
          top: currentY,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
          zIndex: 100
        }}
      >
        <path
          d="M 4 3 L 4 20 L 9 15 L 13 23 L 15 22 L 11 14 L 18 14 Z"
          fill="#f5f4ef"
          stroke="#0a0a0c"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      {clickPoint && (
        <div
          style={{
            position: "absolute",
            left: clickPoint.x - 18,
            top: clickPoint.y - 18,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `2px solid rgba(182, 255, 92, 0.6)`,
            opacity: interpolate(frame - clickPoint.at, [0, 16], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            }),
            transform: `scale(${interpolate(frame - clickPoint.at, [0, 16], [0.6, 1.4], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            })})`,
            pointerEvents: "none",
            zIndex: 99
          }}
        />
      )}
    </>
  );
};
