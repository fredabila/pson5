import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

type Props = {
  text: string;
  startFrame?: number;
  charsPerFrame?: number;
  style?: React.CSSProperties;
  caret?: boolean;
};

/**
 * Typewriter reveal. Start at `startFrame` and unveil `charsPerFrame`
 * characters per frame. Optional blinking caret at the end.
 */
export const TypeOn: React.FC<Props> = ({
  text,
  startFrame = 0,
  charsPerFrame = 0.7,
  style,
  caret = false
}) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const visibleCount = Math.min(text.length, Math.floor(elapsed * charsPerFrame));
  const visible = text.slice(0, visibleCount);
  const showCaret = caret && visibleCount < text.length;
  const blink = caret && visibleCount >= text.length && frame % 30 < 15;

  return (
    <span style={{ ...style, whiteSpace: "pre-wrap" }}>
      {visible}
      {(showCaret || blink) && (
        <span
          style={{
            display: "inline-block",
            width: "0.5ch",
            height: "1em",
            background: "currentColor",
            opacity: 0.8,
            transform: "translateY(2px)"
          }}
        />
      )}
    </span>
  );
};
