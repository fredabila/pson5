import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../../style/tokens";

export type ToolChipState = "running" | "done" | "error";

export interface ToolChip {
  id: string;
  name: string;
  friendlyLabel: string;
  appearAt: number; // frame relative to scene start
  doneAt?: number;
  durationMs?: number;
}

interface Props {
  role: "user" | "assistant";
  appearAt: number;
  /** Full text — will typewriter-reveal from appearAt over typeDuration frames. */
  text: string;
  /** How many frames the typewriter takes. Defaults to text.length * 1.2. */
  typeDuration?: number;
  /** Whether to show the blinking cursor while streaming. */
  streaming?: boolean;
  streamingUntil?: number;
  /** Tool chips attached to this assistant bubble. */
  toolChips?: ToolChip[];
}

/**
 * A single chat bubble with typewriter reveal, matching the real
 * chat-app's Message component. User bubbles float to the right with
 * a phosphor-tinted gradient; assistant bubbles float to the left and
 * can carry tool-call chips beneath the text.
 */
export const ChatBubble: React.FC<Props> = ({
  role,
  appearAt,
  text,
  typeDuration,
  streaming = false,
  streamingUntil,
  toolChips
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - appearAt;
  if (elapsed < 0) return null;

  const totalType = typeDuration ?? Math.max(20, Math.floor(text.length * 1.2));
  const charsToShow = Math.min(
    text.length,
    Math.max(0, Math.floor((elapsed / totalType) * text.length))
  );
  const visible = text.slice(0, charsToShow);

  const showCursor = streaming && (streamingUntil == null || frame < streamingUntil);

  const opacity = interpolate(elapsed, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const translateY = interpolate(elapsed, [0, 12], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: role === "user" ? "flex-end" : "flex-start",
        padding: "0 48px",
        marginBottom: 24,
        opacity,
        transform: `translateY(${translateY}px)`
      }}
    >
      <div
        style={{
          maxWidth: 760,
          padding: "18px 22px",
          borderRadius: 14,
          background:
            role === "user"
              ? "linear-gradient(135deg, #2a3d16 0%, #192710 100%)"
              : COLORS.bg1,
          border:
            role === "user"
              ? `1px solid rgba(182, 255, 92, 0.3)`
              : `1px solid ${COLORS.hair}`,
          color: COLORS.ink0
        }}
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: role === "user" ? "rgba(182, 255, 92, 0.72)" : COLORS.ink3,
            marginBottom: 8
          }}
        >
          {role === "user" ? "You" : "Assistant"}
        </div>

        <div
          style={{
            fontSize: 15.5,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: COLORS.ink0
          }}
        >
          {visible}
          {showCursor && charsToShow < text.length && (
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 16,
                marginLeft: 2,
                background: COLORS.accent,
                verticalAlign: -2,
                opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0
              }}
            />
          )}
          {showCursor && charsToShow >= text.length && (
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 16,
                marginLeft: 2,
                background: COLORS.accent,
                verticalAlign: -2,
                opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0
              }}
            />
          )}
        </div>

        {toolChips && toolChips.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: "14px 0 0",
              padding: "12px 0 0",
              borderTop: `1px solid ${COLORS.hair}`,
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}
          >
            {toolChips.map((tc) => (
              <ToolChipRow key={tc.id} chip={tc} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ─── Tool chip ──────────────────────────────────────────────────────────

const ToolChipRow: React.FC<{ chip: ToolChip }> = ({ chip }) => {
  const frame = useCurrentFrame();
  if (frame < chip.appearAt) return null;

  const isDone = chip.doneAt != null && frame >= chip.doneAt;
  const state: ToolChipState = isDone ? "done" : "running";

  const opacity = interpolate(frame - chip.appearAt, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const dotColor = state === "done" ? COLORS.accent : COLORS.accent;
  const dotPulseOpacity =
    state === "running"
      ? 0.55 + 0.45 * Math.sin((frame - chip.appearAt) / 6)
      : 1;

  return (
    <li
      style={{
        padding: "7px 12px",
        borderRadius: 6,
        background: "rgba(9, 9, 11, 0.5)",
        border: `1px solid ${COLORS.hair}`,
        fontSize: 12.5,
        color: COLORS.ink1,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 10
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 6px ${COLORS.accentGlow}`,
          opacity: dotPulseOpacity
        }}
      />
      <span style={{ color: COLORS.ink0, fontWeight: 500 }}>
        {state === "running" ? "running " : ""}
        {chip.friendlyLabel}
      </span>
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 11,
          color: COLORS.ink3,
          marginLeft: "auto"
        }}
      >
        {chip.name}
      </span>
      {isDone && chip.durationMs != null && (
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            color: COLORS.ink3,
            paddingLeft: 10,
            borderLeft: `1px solid ${COLORS.hair}`
          }}
        >
          {chip.durationMs}ms
        </span>
      )}
    </li>
  );
};
