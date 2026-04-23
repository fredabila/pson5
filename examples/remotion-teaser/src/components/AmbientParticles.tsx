import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../style/tokens";

type Props = {
  count?: number;
  density?: number;
  opacity?: number;
};

/**
 * Slow-drifting particle field that sits behind every scene. Adds depth
 * without pulling attention. Uses three palettes — phosphor, amber, blue —
 * distributed randomly. Each particle has its own slow linear path and
 * subtle twinkle.
 */
export const AmbientParticles: React.FC<Props> = ({
  count = 38,
  density = 1,
  opacity = 0.5
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const particles = React.useMemo(() => {
    // Seeded deterministic so renders are reproducible
    return Array.from({ length: count }, (_, i) => {
      const seed = (i * 2654435761) % 1000 / 1000;
      const seed2 = (i * 40503) % 1000 / 1000;
      const seed3 = (i * 22193) % 1000 / 1000;
      const color = i % 5 === 0
        ? COLORS.observed
        : i % 7 === 0
          ? COLORS.simulated
          : COLORS.accent;
      const size = 1.5 + seed2 * 2.5;
      const cycle = 180 + seed3 * 420; // frames per full traverse
      const y = seed * height;
      const startX = -20 - seed * width * 0.3;
      const drift = (Math.sin((seed + seed2) * Math.PI * 2) * 40);
      const twinkleOffset = seed3 * 100;
      return { seed, seed2, seed3, color, size, cycle, y, startX, drift, twinkleOffset };
    });
  }, [count, width, height]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: opacity * density }}>
      {particles.map((p, i) => {
        const totalTravel = width + 80;
        const pos = ((frame + p.seed * 400) % p.cycle) / p.cycle;
        const x = p.startX + pos * totalTravel;
        const y = p.y + Math.sin((frame + p.seed3 * 200) / 60) * p.drift * 0.2;
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin((frame + p.twinkleOffset) / 40));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: p.color,
              opacity: twinkle * 0.55,
              boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
              filter: i % 3 === 0 ? "blur(0.5px)" : undefined
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
