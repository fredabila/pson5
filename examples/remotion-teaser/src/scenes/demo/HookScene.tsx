import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../../style/tokens";

/**
 * Hook — sets the architectural framing before showing anything operational.
 *
 * Frame 0 ~ 480 (16s). Timed to "demo-01-hook.wav" (15.03s). Emphasises
 * three phrases one at a time: "black box", "indistinguishable",
 * "infrastructure" — then resolves to the PSON5 wordmark.
 */

const PHRASE_1_IN = 30;
const PHRASE_1_OUT = 140;
const PHRASE_2_IN = 170;
const PHRASE_2_OUT = 280;
const PHRASE_3_IN = 310;
const PHRASE_3_OUT = 395;
const WORDMARK_IN = 395;

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}
    >
      <FadeText
        text="memory is a black box"
        in={PHRASE_1_IN}
        out={PHRASE_1_OUT}
        accent={COLORS.ink2}
      />
      <FadeText
        text="everything stored indistinguishable"
        in={PHRASE_2_IN}
        out={PHRASE_2_OUT}
        accent={COLORS.ink2}
      />
      <FadeText
        text="treat memory as infrastructure"
        in={PHRASE_3_IN}
        out={PHRASE_3_OUT}
        accent={COLORS.accent}
      />
      <WordmarkReveal startFrame={WORDMARK_IN} />

      <DotGrid frame={frame} />
    </AbsoluteFill>
  );
};

const FadeText: React.FC<{
  text: string;
  in: number;
  out: number;
  accent: string;
}> = ({ text, in: inFrame, out: outFrame, accent }) => {
  const frame = useCurrentFrame();
  if (frame < inFrame - 20 || frame > outFrame + 20) return null;

  const opacity = interpolate(
    frame,
    [inFrame - 15, inFrame, outFrame, outFrame + 15],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const translateY = interpolate(frame, [inFrame - 15, inFrame], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        position: "absolute",
        fontFamily: FONT.display,
        fontSize: 80,
        fontWeight: 400,
        color: accent,
        opacity,
        transform: `translateY(${translateY}px)`,
        letterSpacing: "-0.025em",
        fontStyle: accent === COLORS.accent ? "italic" : "normal",
        fontVariationSettings: accent === COLORS.accent ? "'SOFT' 100" : undefined,
        textAlign: "center",
        padding: "0 120px"
      }}
    >
      {text}
    </div>
  );
};

const WordmarkReveal: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  if (frame < startFrame) return null;

  const elapsed = frame - startFrame;
  const opacity = interpolate(elapsed, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const scale = interpolate(elapsed, [0, 30], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        position: "absolute",
        opacity,
        transform: `scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14
      }}
    >
      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 148,
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
          textTransform: "uppercase"
        }}
      >
        personalization · infrastructure
      </div>
    </div>
  );
};

const DotGrid: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [0, 30], [0, 0.22], {
    extrapolateRight: "clamp"
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        backgroundImage: `radial-gradient(circle, ${COLORS.ink3} 1px, transparent 1px)`,
        backgroundSize: "32px 32px"
      }}
    />
  );
};
