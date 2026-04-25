import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../../style/tokens";

/**
 * Close — restates the invariant and resolves on the wordmark.
 *
 * Frame 0 ~ 300 (10s). Timed to "demo-08-close.wav" (9.24s).
 */

export const CloseScene: React.FC = () => {
  const frame = useCurrentFrame();

  const ringsPulse = 0.7 + 0.3 * Math.sin(frame / 24);

  const line1Opacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const line2Opacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const wordmarkOpacity = interpolate(frame, [150, 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const wordmarkScale = interpolate(frame, [150, 200], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
        position: "relative"
      }}
    >
      {/* Orbital rings around the wordmark */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {[0, 1, 2, 3].map((i) => {
          const size = 280 + i * 140;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: "50%",
                border: `1px solid ${COLORS.accent}`,
                opacity: (0.18 - i * 0.03) * wordmarkOpacity * ringsPulse,
                transform: `rotate(${frame * (0.3 + i * 0.15)}deg)`
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 54,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          color: COLORS.ink0,
          opacity: line1Opacity,
          zIndex: 1
        }}
      >
        Three layers.
      </div>

      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 54,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          color: COLORS.accent,
          fontStyle: "italic",
          fontVariationSettings: "'SOFT' 100",
          opacity: line2Opacity,
          zIndex: 1
        }}
      >
        Always separate.
      </div>

      <div
        style={{
          marginTop: 48,
          opacity: wordmarkOpacity,
          transform: `scale(${wordmarkScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          zIndex: 1
        }}
      >
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 104,
            fontWeight: 400,
            color: COLORS.ink0,
            letterSpacing: "-0.04em",
            lineHeight: 1
          }}
        >
          PSON
          <em
            style={{
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            5
          </em>
        </div>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            letterSpacing: "0.28em",
            color: COLORS.ink2,
            textTransform: "uppercase",
            display: "flex",
            gap: 20,
            alignItems: "center"
          }}
        >
          <span>MIT</span>
          <span style={{ color: COLORS.ink4 }}>·</span>
          <span>OPEN STANDARD</span>
          <span style={{ color: COLORS.ink4 }}>·</span>
          <span style={{ color: COLORS.accent }}>github.com/fredabila/pson5</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
