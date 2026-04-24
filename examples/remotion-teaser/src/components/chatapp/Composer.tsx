import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../../style/tokens";

interface Props {
  /** Full text being typed into the composer. Reveals one char at a time. */
  text: string;
  /** Frame the first character appears. */
  startFrame: number;
  /** Frame the composer finishes typing (click send). */
  sendAt: number;
  /** Whether to show a send-pressed pulse. */
  isSending?: boolean;
  /** If true, composer shows disabled/placeholder state. */
  placeholder?: string;
}

/**
 * Animated composer. Reveals text character-by-character, then flashes
 * the send button when it dispatches.
 */
export const Composer: React.FC<Props> = ({
  text,
  startFrame,
  sendAt,
  isSending = false,
  placeholder = "Tell me something, or ask me what I know…"
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - startFrame;
  const typeDuration = Math.max(20, Math.floor(text.length * 1.6));

  const charsShown =
    frame < startFrame
      ? 0
      : frame >= sendAt
        ? 0
        : Math.min(text.length, Math.max(0, Math.floor((elapsed / typeDuration) * text.length)));

  const displayText = charsShown === 0 ? "" : text.slice(0, charsShown);

  const showCaret = frame >= startFrame && frame < sendAt && charsShown < text.length;

  const sendPulse = interpolate(frame - sendAt, [-6, 0, 8], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <form
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 12,
        padding: "16px 48px 28px",
        borderTop: `1px solid ${COLORS.hair}`,
        background: `linear-gradient(to top, ${COLORS.bg0}, rgba(9, 9, 11, 0.8))`
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 50,
          padding: "14px 18px",
          borderRadius: 12,
          background: displayText ? COLORS.bg2 : COLORS.bg1,
          border: `1px solid ${displayText ? COLORS.accent : COLORS.hairStrong}`,
          color: COLORS.ink0,
          fontSize: 15.5,
          lineHeight: 1.5,
          fontFamily: FONT.body,
          transition: "border-color 0.2s"
        }}
      >
        {displayText ? (
          <>
            {displayText}
            {showCaret && (
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: 18,
                  background: COLORS.ink0,
                  marginLeft: 1,
                  verticalAlign: -3,
                  opacity: Math.floor(frame / 16) % 2 === 0 ? 1 : 0
                }}
              />
            )}
          </>
        ) : (
          <span style={{ color: COLORS.ink3 }}>{placeholder}</span>
        )}
      </div>

      <div
        style={{
          height: 50,
          width: 50,
          borderRadius: "50%",
          background: charsShown > 0 ? COLORS.accent : COLORS.bg3,
          color: charsShown > 0 ? COLORS.bg0 : COLORS.ink3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isSending
            ? `0 0 ${20 * sendPulse}px ${COLORS.accentGlow}`
            : "none",
          transform: `scale(${isSending ? 1 + sendPulse * 0.12 : 1})`
        }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 8h10m0 0L8 4m4 4l-4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </form>
  );
};
