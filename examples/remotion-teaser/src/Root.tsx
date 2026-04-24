import React from "react";
import { Composition } from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { Teaser } from "./Teaser";
import { ChatAppDemo } from "./ChatAppDemo";
import { VIDEO } from "./style/tokens";

// Load the three fonts that the teaser and chat-app demo share.
loadFraunces();
loadInter();
loadJetBrainsMono();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Teaser"
        component={Teaser}
        durationInFrames={VIDEO.durationInFrames}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />

      <Composition
        id="ChatAppDemo"
        component={ChatAppDemo}
        // ~66 seconds of narration + outro hold → 2010 frames at 30fps.
        durationInFrames={2010}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
    </>
  );
};
