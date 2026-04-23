import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "./components/Backdrop";
import { Hook } from "./scenes/Hook";
import { GenericWound } from "./scenes/GenericWound";
import { ThreeLayers } from "./scenes/ThreeLayers";
import { LoopInAction } from "./scenes/LoopInAction";
import { Decision } from "./scenes/Decision";
import { Tagline } from "./scenes/Tagline";
import { Outro } from "./scenes/Outro";
import { COLORS, SCENE } from "./style/tokens";

export const Teaser: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg0 }}>
      <Backdrop />

      <Sequence from={SCENE.hook.from} durationInFrames={SCENE.hook.duration}>
        <Hook />
      </Sequence>

      <Sequence from={SCENE.genericWound.from} durationInFrames={SCENE.genericWound.duration}>
        <GenericWound />
      </Sequence>

      <Sequence from={SCENE.threeLayers.from} durationInFrames={SCENE.threeLayers.duration}>
        <ThreeLayers />
      </Sequence>

      <Sequence from={SCENE.loopInAction.from} durationInFrames={SCENE.loopInAction.duration}>
        <LoopInAction />
      </Sequence>

      <Sequence from={SCENE.decision.from} durationInFrames={SCENE.decision.duration}>
        <Decision />
      </Sequence>

      <Sequence from={SCENE.tagline.from} durationInFrames={SCENE.tagline.duration}>
        <Tagline />
      </Sequence>

      <Sequence from={SCENE.outro.from} durationInFrames={SCENE.outro.duration}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
