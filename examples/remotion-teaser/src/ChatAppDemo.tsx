import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { DemoStage } from "./scenes/demo/DemoStage";

/**
 * Chat-app walkthrough demo. ~66 seconds.
 *
 * Single continuous stage — no scene cuts — with a narrator's TTS track
 * layered over it. Feels like a developer screen-recording themselves
 * walking through the app. The ambient music bed is the same Lyria
 * generation used by the main teaser.
 *
 * Voiceover timing is anchored to the visual beats in DemoStage.tsx:
 * every VO starts just AFTER the visual it describes appears, so the
 * viewer sees the thing first and hears the explanation second.
 */

// VO durations (seconds → frames at 30fps), pulled from the TTS generator:
//   demo-01-intro       9.37s → 281f
//   demo-02-type        4.82s → 145f
//   demo-03-observed   10.48s → 315f
//   demo-04-registry    9.10s → 273f
//   demo-05-inferred    8.13s → 244f
//   demo-06-simulate    9.31s → 280f
//   demo-07-outro       3.58s → 108f

interface VoCue {
  id: string;
  startFrame: number;
  durationFrames: number;
}

const VO: VoCue[] = [
  { id: "demo-01-intro", startFrame: 40, durationFrames: 290 },
  { id: "demo-02-type", startFrame: 340, durationFrames: 155 },
  { id: "demo-03-observed", startFrame: 560, durationFrames: 325 },
  { id: "demo-04-registry", startFrame: 900, durationFrames: 285 },
  { id: "demo-05-inferred", startFrame: 1200, durationFrames: 255 },
  { id: "demo-06-simulate", startFrame: 1540, durationFrames: 290 },
  { id: "demo-07-outro", startFrame: 1860, durationFrames: 120 }
];

// Ambient bed is quieter during narration so the voice sits on top.
const AMBIENT_BASE = 0.16;

export const ChatAppDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Music bed — Lyria's warm tech-doc ambient track. */}
      <Audio src={staticFile("audio/ambient.wav")} volume={AMBIENT_BASE} />

      {/* Narrator VO cues */}
      {VO.map((cue) => (
        <Sequence
          key={cue.id}
          from={cue.startFrame}
          durationInFrames={cue.durationFrames}
        >
          <Audio src={staticFile(`audio/${cue.id}.wav`)} volume={0.95} />
        </Sequence>
      ))}

      {/* The stage itself — one continuous scene. */}
      <DemoStage />
    </AbsoluteFill>
  );
};
