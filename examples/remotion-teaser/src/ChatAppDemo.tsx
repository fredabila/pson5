import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { HookScene } from "./scenes/demo/HookScene";
import { LayersScene } from "./scenes/demo/LayersScene";
import { DemoStage } from "./scenes/demo/DemoStage";
import { ResearcherScene } from "./scenes/demo/ResearcherScene";
import { InfraScene } from "./scenes/demo/InfraScene";
import { CloseScene } from "./scenes/demo/CloseScene";

/**
 * Chat-app + researcher-agent walkthrough demo — ~2:37 @ 30fps.
 *
 * Eight scene-equivalent phases, each matched to one of the 8
 * pre-rendered TTS narration clips in public/audio/demo-*.wav:
 *
 *   01  HOOK           the architectural framing (memory is a black box)
 *   02  LAYERS         the non-negotiable invariant (three layers, typed)
 *   03  OBSERVE        chat-app live: user tells its name → pson_observe_fact
 *   04  INFER          inferred lane populates with confidence + evidence
 *   05  SIMULATE       pson_simulate returns prediction + reasoning trace
 *   06  RESEARCHER     Managed Agent persona: Dr. Amelia Kwan terminal demo
 *   07  INFRA          15 packages + real benchmark numbers + .pson format
 *   08  CLOSE          "three layers, always separate" + wordmark resolve
 *
 * The chat-app middle act (scenes 03/04/05) is one continuous DemoStage
 * — no cuts — with its own internal frame timeline. Narrations 03-05
 * overlay it; the final narration (05) extends slightly past DemoStage's
 * natural end and plays over a held frame of the simulation result.
 *
 * All frame numbers are composition-global unless marked `local`.
 */

interface PhaseCue {
  id: string;
  /** Composition frame when the phase visual starts. */
  sceneStart: number;
  /** Frames the scene occupies. */
  sceneDuration: number;
  /** Composition frame when this phase's narration starts. */
  voStart: number;
  /** Frames the narration occupies (matched to TTS WAV duration). */
  voDuration: number;
}

const PHASES: PhaseCue[] = [
  { id: "demo-01-hook",       sceneStart: 0,    sceneDuration: 500,  voStart: 20,   voDuration: 460 },
  { id: "demo-02-layers",     sceneStart: 500,  sceneDuration: 520,  voStart: 520,  voDuration: 500 },
  // Chat-app middle act — three narrations overlay ONE continuous DemoStage
  { id: "demo-03-observe",    sceneStart: 1020, sceneDuration: 2100, voStart: 1100, voDuration: 620 },
  { id: "demo-04-infer",      sceneStart: 0,    sceneDuration: 0,    voStart: 2000, voDuration: 480 },
  { id: "demo-05-simulate",   sceneStart: 0,    sceneDuration: 0,    voStart: 2520, voDuration: 610 },
  // Back to one narration per scene
  { id: "demo-06-researcher", sceneStart: 3120, sceneDuration: 570,  voStart: 3150, voDuration: 540 },
  { id: "demo-07-infra",      sceneStart: 3690, sceneDuration: 730,  voStart: 3720, voDuration: 700 },
  { id: "demo-08-close",      sceneStart: 4420, sceneDuration: 300,  voStart: 4440, voDuration: 290 }
];

/** Ambient bed drops under narration so the voice stays forward. */
const AMBIENT_BASE = 0.14;

export const ChatAppDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Music bed */}
      <Audio src={staticFile("audio/ambient.wav")} volume={AMBIENT_BASE} />

      {/* Narration — one Sequence per cue */}
      {PHASES.map((phase) => (
        <Sequence
          key={phase.id}
          from={phase.voStart}
          durationInFrames={phase.voDuration}
        >
          <Audio src={staticFile(`audio/${phase.id}.wav`)} volume={0.95} />
        </Sequence>
      ))}

      {/* Scenes — only phases with non-zero sceneDuration are rendered */}
      <Sequence from={0} durationInFrames={500}>
        <HookScene />
      </Sequence>

      <Sequence from={500} durationInFrames={520}>
        <LayersScene />
      </Sequence>

      {/* One continuous chat-app stage for the observe → infer → simulate arc.
         Narrations 03, 04, 05 all overlay this single scene. */}
      <Sequence from={1020} durationInFrames={2100}>
        <DemoStage />
      </Sequence>

      <Sequence from={3120} durationInFrames={570}>
        <ResearcherScene />
      </Sequence>

      <Sequence from={3690} durationInFrames={730}>
        <InfraScene />
      </Sequence>

      <Sequence from={4420} durationInFrames={300}>
        <CloseScene />
      </Sequence>
    </AbsoluteFill>
  );
};
