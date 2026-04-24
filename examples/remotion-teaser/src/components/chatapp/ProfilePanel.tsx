import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../../style/tokens";

export type LaneAccent = "observed" | "inferred" | "simulated";

export interface LaneEntry {
  /** Frame (relative to scene start) when this entry animates in. */
  appearAt: number;
  domain: string;
  key: string;
  value: string;
  confidence?: number;
}

interface LaneSpec {
  index: string;
  label: string;
  sublabel: string;
  accent: LaneAccent;
  entries: LaneEntry[];
}

interface Props {
  /** If null, renders the empty state. */
  lanes: LaneSpec[] | null;
}

const ACCENT_COLOR: Record<LaneAccent, string> = {
  observed: COLORS.observed,
  inferred: COLORS.inferred,
  simulated: COLORS.simulated
};

const ACCENT_SOFT: Record<LaneAccent, string> = {
  observed: "rgba(245, 199, 106, 0.14)",
  inferred: "rgba(182, 255, 92, 0.14)",
  simulated: "rgba(142, 199, 255, 0.14)"
};

export const ProfilePanel: React.FC<Props> = ({ lanes }) => {
  if (!lanes) {
    return (
      <div style={{ padding: "52px 32px", display: "flex", alignItems: "center", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: COLORS.accent
            }}
          >
            PROFILE
          </span>
          <h2
            style={{
              fontFamily: FONT.display,
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              margin: 0,
              color: COLORS.ink0,
              lineHeight: 1.15
            }}
          >
            Your layered profile will appear here.
          </h2>
          <p style={{ color: COLORS.ink1, fontSize: 14, lineHeight: 1.55, margin: 0 }}>
            Send a message and the assistant will start populating the three layers:
            <strong style={{ color: COLORS.ink0, padding: "0 3px" }}>observed</strong>,
            <strong style={{ color: COLORS.ink0, padding: "0 3px" }}>inferred</strong>, and
            <strong style={{ color: COLORS.ink0, padding: "0 3px" }}>simulated</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 28px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.22em",
            color: COLORS.accent
          }}
        >
          PROFILE · LIVE
        </span>
        <h2
          style={{
            fontFamily: FONT.display,
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: "-0.02em",
            margin: 0,
            color: COLORS.ink0,
            lineHeight: 1.15
          }}
        >
          What I know about you
        </h2>
      </div>

      {lanes.map((lane) => (
        <Lane key={lane.accent} spec={lane} />
      ))}
    </div>
  );
};

// ─── Lane ───────────────────────────────────────────────────────────────

const Lane: React.FC<{ spec: LaneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  // Entries considered "visible" at current frame — used to compute the count.
  const visibleCount = spec.entries.filter((e) => frame >= e.appearAt).length;

  const accentColor = ACCENT_COLOR[spec.accent];
  const accentSoft = ACCENT_SOFT[spec.accent];

  return (
    <section
      style={{
        padding: "14px 18px",
        borderRadius: 12,
        border: `1px solid ${COLORS.hair}`,
        borderLeft: `2px solid ${accentColor}`,
        background: `linear-gradient(to right, ${accentSoft}, ${COLORS.bg2} 45%)`
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 2
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            fontWeight: 600,
            color: COLORS.ink3,
            letterSpacing: "0.18em"
          }}
        >
          {spec.index}
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: accentColor
          }}
        >
          {spec.label}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: FONT.mono,
            fontSize: 10,
            color: COLORS.ink3,
            padding: "2px 8px",
            border: `1px solid ${COLORS.hair}`,
            borderRadius: 100
          }}
        >
          {visibleCount}
        </span>
      </header>

      <p style={{ margin: "4px 0 12px", fontSize: 12, color: COLORS.ink2 }}>
        {spec.sublabel}
      </p>

      {visibleCount === 0 ? (
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            color: COLORS.ink3,
            padding: "6px 0 4px",
            fontStyle: "italic"
          }}
        >
          nothing yet
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {spec.entries.map((entry, i) => (
            <LaneEntryRow key={`${entry.domain}/${entry.key}/${i}`} entry={entry} accent={spec.accent} />
          ))}
        </ul>
      )}
    </section>
  );
};

const LaneEntryRow: React.FC<{ entry: LaneEntry; accent: LaneAccent }> = ({ entry, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame - entry.appearAt;
  if (elapsed < 0) return null;

  const arrival = spring({ frame: elapsed, fps, config: SPRING_SOFT });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateY = interpolate(arrival, [0, 1], [8, 0]);
  const scale = interpolate(arrival, [0, 1], [0.96, 1]);

  const valueColor = ACCENT_COLOR[accent];

  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 12px",
        background: "rgba(9, 9, 11, 0.55)",
        border: `1px solid ${COLORS.hair}`,
        borderRadius: 6,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        transformOrigin: "left center"
      }}
    >
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          letterSpacing: "0.02em",
          display: "flex",
          alignItems: "center",
          gap: 6
        }}
      >
        <span
          style={{
            color: COLORS.ink3,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: 9.5
          }}
        >
          {entry.domain}
        </span>
        <span style={{ color: COLORS.ink4 }}>·</span>
        <span style={{ color: COLORS.ink1 }}>{entry.key}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13
        }}
      >
        <code
          style={{
            fontFamily: FONT.mono,
            fontSize: 12.5,
            color: valueColor,
            background: "transparent",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 340
          }}
        >
          {entry.value}
        </code>
        {entry.confidence != null && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: FONT.mono,
              fontSize: 10,
              color: COLORS.ink3,
              padding: "2px 8px",
              border: `1px solid ${COLORS.hair}`,
              borderRadius: 100
            }}
          >
            {entry.confidence.toFixed(2)}
          </span>
        )}
      </div>
    </li>
  );
};
