import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AppFrame, TopBar } from "../../components/chatapp/AppFrame";
import { ChatBubble, type ToolChip } from "../../components/chatapp/ChatBubble";
import { Composer } from "../../components/chatapp/Composer";
import {
  ProfilePanel,
  type LaneEntry
} from "../../components/chatapp/ProfilePanel";

/**
 * The chat-app demo. A single continuous stage — no scene cuts — so it
 * reads like someone screen-recording themselves using the app. The
 * narrator's TTS tracks lay over this composition and the user watches
 * messages, tool chips, and the profile panel fill in together.
 *
 * All frame numbers are relative to the composition start (30fps).
 * The TTS Audio sequences in ChatAppDemo.tsx fire at matching offsets.
 */

// ─── Timeline constants (global composition frames) ─────────────────────

// Each VO starts ~10f after its "visual anchor" so the viewer sees the
// thing being described *before* the narrator starts talking about it.

const SEED_APPEAR = 10;

// Turn 1 — user tells the agent their name.
const USER_1_APPEAR = 360;
const USER_1_TYPED_FULL = 360 + 80; // reveal ends around here
const USER_1_SEND = 450;
const AGENT_1_APPEAR = 475;
const AGENT_1_OBSERVE_TOOL_START = 520;
const AGENT_1_OBSERVE_TOOL_END = 555;

// Turn 2 — registry question + pson_learn.
const AGENT_2_APPEAR = 870;
const USER_2_APPEAR = 1005;
const USER_2_SEND = 1060;
const AGENT_2_LEARN_TOOL_START = 1085;
const AGENT_2_LEARN_TOOL_END = 1120;
const AGENT_2_NEXT_Q_TOOL_START = 1130;
const AGENT_2_NEXT_Q_TOOL_END = 1155;

// Turn 3 — user asks for a simulation.
const USER_3_APPEAR = 1450;
const USER_3_SEND = 1540;
const AGENT_3_APPEAR = 1560;
const AGENT_3_SIM_TOOL_START = 1585;
const AGENT_3_SIM_TOOL_END = 1635;

// Profile lane timings — when each entry pops in.
const OBSERVED_ENTRIES: LaneEntry[] = [
  {
    appearAt: 575,
    domain: "core",
    key: "preferred_name",
    value: '"Frederick"',
    confidence: 1.0
  },
  {
    appearAt: 1130,
    domain: "core",
    key: "problem_solving_style",
    value: '"plan_first"',
    confidence: 1.0
  }
];

const INFERRED_ENTRIES: LaneEntry[] = [
  {
    appearAt: 1215,
    domain: "core",
    key: "values_technical_autonomy",
    value: "true",
    confidence: 0.78
  },
  {
    appearAt: 1260,
    domain: "core",
    key: "optionality_over_stability",
    value: "true",
    confidence: 0.71
  },
  {
    appearAt: 1305,
    domain: "core",
    key: "deadline_driven_activation",
    value: "true",
    confidence: 0.74
  }
];

const SIMULATED_ENTRIES: LaneEntry[] = [
  {
    appearAt: 1655,
    domain: "core",
    key: "series_a_offer",
    value: '"likely_accept"',
    confidence: 0.74
  }
];

// Metadata that drives the top bar pills.
interface TopBarState {
  profileId: string | null;
  revision: number | null;
  confidence: number | null;
}

function getTopBarState(frame: number): TopBarState {
  // Revision/confidence update roughly in step with saves.
  if (frame < USER_1_APPEAR) return { profileId: null, revision: null, confidence: null };
  if (frame < AGENT_1_OBSERVE_TOOL_END) {
    return { profileId: "pson_m8x4k7a", revision: 1, confidence: 0.0 };
  }
  if (frame < AGENT_2_LEARN_TOOL_END) {
    return { profileId: "pson_m8x4k7a", revision: 2, confidence: 0.12 };
  }
  if (frame < AGENT_3_SIM_TOOL_END) {
    return { profileId: "pson_m8x4k7a", revision: 3, confidence: 0.54 };
  }
  return { profileId: "pson_m8x4k7a", revision: 4, confidence: 0.64 };
}

// Composer follows whichever user message is "being typed" right now.
function getComposerState(frame: number): {
  text: string;
  startFrame: number;
  sendAt: number;
  isSending: boolean;
} {
  if (frame < USER_1_APPEAR - 20) {
    return { text: "", startFrame: -1, sendAt: -1, isSending: false };
  }
  if (frame < USER_1_SEND + 10) {
    return {
      text: "Hi! My name is Frederick.",
      startFrame: USER_1_APPEAR - 20,
      sendAt: USER_1_SEND,
      isSending: frame >= USER_1_SEND - 2 && frame < USER_1_SEND + 10
    };
  }
  if (frame < USER_2_APPEAR - 10) {
    return { text: "", startFrame: -1, sendAt: -1, isSending: false };
  }
  if (frame < USER_2_SEND + 10) {
    return {
      text: "plan_first",
      startFrame: USER_2_APPEAR - 10,
      sendAt: USER_2_SEND,
      isSending: frame >= USER_2_SEND - 2 && frame < USER_2_SEND + 10
    };
  }
  if (frame < USER_3_APPEAR - 10) {
    return { text: "", startFrame: -1, sendAt: -1, isSending: false };
  }
  if (frame < USER_3_SEND + 10) {
    return {
      text: "Given what you know, should I take a Series A founding engineer role?",
      startFrame: USER_3_APPEAR - 10,
      sendAt: USER_3_SEND,
      isSending: frame >= USER_3_SEND - 2 && frame < USER_3_SEND + 10
    };
  }
  return { text: "", startFrame: -1, sendAt: -1, isSending: false };
}

// ─── Assistant responses ───────────────────────────────────────────────

const AGENT_1_TEXT = `Nice to meet you, Frederick! Let me save that — and then I'll ask you a quick question to kick off the profile.`;

const AGENT_2_TEXT = `Good. Saved that as "plan_first" for core_problem_solving_style.\n\nOne more — when a deadline is looming, what actually happens: you kick into higher gear, you stall, or some of both?`;

const AGENT_3_TEXT = `Based on what you've told me — you plan first, you value autonomy, deadlines pull you into action — a Series A founding-engineer role looks like a close match.

Prediction: likely accept, confidence 0.74. Reasoning: three inferred traits pull in that direction. Caveat: I don't know your runway yet. Ask yourself what happens if cash gets tight in the next 12 months.`;

// ─── Tool chip lists per bubble ─────────────────────────────────────────

const AGENT_1_CHIPS: ToolChip[] = [
  {
    id: "t1-observe",
    name: "pson_observe_fact",
    friendlyLabel: "noting what you mentioned",
    appearAt: AGENT_1_OBSERVE_TOOL_START,
    doneAt: AGENT_1_OBSERVE_TOOL_END,
    durationMs: 38
  },
  {
    id: "t1-next",
    name: "pson_get_next_questions",
    friendlyLabel: "picking a question",
    appearAt: AGENT_2_NEXT_Q_TOOL_START,
    doneAt: AGENT_2_NEXT_Q_TOOL_END,
    durationMs: 12
  }
];

const AGENT_2_CHIPS: ToolChip[] = [
  {
    id: "t2-learn",
    name: "pson_learn",
    friendlyLabel: "saving your answer",
    appearAt: AGENT_2_LEARN_TOOL_START,
    doneAt: AGENT_2_LEARN_TOOL_END,
    durationMs: 21
  }
];

const AGENT_3_CHIPS: ToolChip[] = [
  {
    id: "t3-sim",
    name: "pson_simulate",
    friendlyLabel: "simulating a decision",
    appearAt: AGENT_3_SIM_TOOL_START,
    doneAt: AGENT_3_SIM_TOOL_END,
    durationMs: 124
  }
];

// ─── Stage ──────────────────────────────────────────────────────────────

export const DemoStage: React.FC = () => {
  const frame = useCurrentFrame();
  const topBar = getTopBarState(frame);
  const composerState = getComposerState(frame);

  // Gentle intro zoom so it doesn't feel static.
  const introScale = interpolate(frame, [0, 60], [1.03, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  // Chat scroll as messages pile up — translate the whole stack up so the
  // latest bubble is always visible near the bottom of the chat area.
  const scrollOffset = interpolate(
    frame,
    [700, 1000, 1300, 1550, 1700],
    [0, -120, -260, -420, -560],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Profile panel: only show lanes once there's something to show; before
  // that, the empty state teaches the viewer what's about to happen.
  const profileFilled = frame >= USER_1_SEND - 10;

  return (
    <AbsoluteFill
      style={{
        background: "#000",
        transform: `scale(${introScale})`,
        transformOrigin: "center center"
      }}
    >
      <AppFrame
        topBar={
          <TopBar
            profileId={topBar.profileId}
            userId="user_q7m2kp8a"
            revision={topBar.revision}
            confidence={topBar.confidence}
          />
        }
        chat={
          <div
            style={{
              height: "100%",
              overflow: "hidden",
              position: "relative"
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                transform: `translateY(${scrollOffset}px)`,
                transition: "transform 0.3s"
              }}
            >
              <ChatBubble
                role="assistant"
                appearAt={SEED_APPEAR}
                text="Hi. I'll ask you one short, structured question at a time — the panel on the right fills in as you answer. Just say hi to get started."
              />

              <ChatBubble
                role="user"
                appearAt={USER_1_APPEAR}
                text="Hi! My name is Frederick."
                typeDuration={USER_1_TYPED_FULL - USER_1_APPEAR}
              />

              <ChatBubble
                role="assistant"
                appearAt={AGENT_1_APPEAR}
                text={AGENT_1_TEXT}
                streaming
                streamingUntil={AGENT_2_NEXT_Q_TOOL_END + 30}
                toolChips={AGENT_1_CHIPS}
              />

              <ChatBubble
                role="user"
                appearAt={USER_2_APPEAR}
                text="plan_first"
                typeDuration={30}
              />

              <ChatBubble
                role="assistant"
                appearAt={AGENT_2_APPEAR > USER_2_APPEAR ? AGENT_2_APPEAR : USER_2_SEND + 30}
                text={AGENT_2_TEXT}
                streaming
                streamingUntil={AGENT_2_LEARN_TOOL_END + 30}
                toolChips={AGENT_2_CHIPS}
              />

              <ChatBubble
                role="user"
                appearAt={USER_3_APPEAR}
                text="Given what you know, should I take a Series A founding engineer role?"
                typeDuration={USER_3_SEND - USER_3_APPEAR - 10}
              />

              <ChatBubble
                role="assistant"
                appearAt={AGENT_3_APPEAR}
                text={AGENT_3_TEXT}
                streaming
                streamingUntil={AGENT_3_SIM_TOOL_END + 240}
                toolChips={AGENT_3_CHIPS}
              />
            </div>
          </div>
        }
        composer={
          <Composer
            text={composerState.text}
            startFrame={composerState.startFrame}
            sendAt={composerState.sendAt}
            isSending={composerState.isSending}
          />
        }
        side={
          profileFilled ? (
            <ProfilePanel
              lanes={[
                {
                  index: "01",
                  label: "OBSERVED",
                  sublabel: "facts you've told me directly",
                  accent: "observed",
                  entries: OBSERVED_ENTRIES
                },
                {
                  index: "02",
                  label: "INFERRED",
                  sublabel: "traits I've derived with confidence",
                  accent: "inferred",
                  entries: INFERRED_ENTRIES
                },
                {
                  index: "03",
                  label: "SIMULATED",
                  sublabel: "predictions I've generated in context",
                  accent: "simulated",
                  entries: SIMULATED_ENTRIES
                }
              ]}
            />
          ) : (
            <ProfilePanel lanes={null} />
          )
        }
      />
    </AbsoluteFill>
  );
};
