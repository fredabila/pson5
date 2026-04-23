import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../style/tokens";

type Props = {
  direction?: "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";
  color?: string;
  startFrame?: number;
  duration?: number;
  thickness?: number; // fraction of screen covered at peak (0-1)
  mode?: "enter" | "exit" | "cross";
};

/**
 * A sweeping bar that wipes across the screen — used as a punctuation
 * mark between scenes. Three modes:
 *
 *   enter   band moves in, holds momentarily as coverage peaks, leaves
 *   exit    band grows to fill the screen then leaves
 *   cross   full-coverage cross between two scenes
 */
export const SceneWipe: React.FC<Props> = ({
  direction = "left-to-right",
  color = COLORS.accent,
  startFrame = 0,
  duration = 28,
  thickness = 0.22,
  mode = "enter"
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - startFrame;
  if (elapsed < 0 || elapsed > duration) return null;

  const progress = elapsed / duration; // 0-1

  // Position of the band's leading edge (0-1)
  const leadingEdge = interpolate(progress, [0, 1], [0, 1 + thickness], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const trailingEdge = Math.max(0, leadingEdge - thickness);

  const isHorizontal = direction.startsWith("left") || direction.startsWith("right");
  const reversed = direction.startsWith("right") || direction.startsWith("bottom");

  const start = (reversed ? 1 - leadingEdge : trailingEdge) * 100;
  const end = (reversed ? 1 - trailingEdge : leadingEdge) * 100;

  const gradient = `linear-gradient(${
    isHorizontal ? (reversed ? "270deg" : "90deg") : reversed ? "0deg" : "180deg"
  },
    transparent ${start}%,
    ${color}40 ${(start + (end - start) * 0.08)}%,
    ${color}ff ${(start + (end - start) * 0.4)}%,
    ${color}ff ${(start + (end - start) * 0.6)}%,
    ${color}40 ${(start + (end - start) * 0.92)}%,
    transparent ${end}%)`;

  const intensityEnvelope = Math.sin(progress * Math.PI);
  const opacity = mode === "cross" ? 0.85 : intensityEnvelope * (mode === "exit" ? 1 : 0.8);

  return (
    <AbsoluteFill
      style={{
        background: gradient,
        mixBlendMode: "screen",
        opacity,
        pointerEvents: "none"
      }}
    />
  );
};
