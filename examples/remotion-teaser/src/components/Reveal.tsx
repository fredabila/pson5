import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_SOFT } from "../style/tokens";

type Props = {
  from?: number;
  children: React.ReactNode;
  mode?: "scale-blur" | "slide-up" | "fade-in" | "rise";
  distance?: number;
};

/**
 * Wraps children with a tasteful arrival animation. Default combines
 * scale, subtle blur clear, and fade — cinematic without being showy.
 */
export const Reveal: React.FC<Props> = ({
  from = 0,
  children,
  mode = "scale-blur",
  distance = 20
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - from,
    fps,
    config: SPRING_SOFT
  });

  let transform = "";
  let filter = "none";
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  switch (mode) {
    case "scale-blur": {
      const scale = interpolate(progress, [0, 1], [0.94, 1]);
      const blur = interpolate(progress, [0, 1], [10, 0]);
      transform = `scale(${scale})`;
      filter = `blur(${Math.max(0, blur)}px)`;
      break;
    }
    case "slide-up": {
      const y = interpolate(progress, [0, 1], [distance, 0]);
      transform = `translateY(${y}px)`;
      break;
    }
    case "rise": {
      const y = interpolate(progress, [0, 1], [distance, 0]);
      const scale = interpolate(progress, [0, 1], [0.97, 1]);
      transform = `translateY(${y}px) scale(${scale})`;
      break;
    }
    case "fade-in":
    default:
      break;
  }

  return (
    <div
      style={{
        opacity,
        transform,
        filter,
        willChange: "transform, opacity, filter"
      }}
    >
      {children}
    </div>
  );
};
