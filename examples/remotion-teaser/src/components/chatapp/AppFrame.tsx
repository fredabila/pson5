import React from "react";
import { COLORS, FONT } from "../../style/tokens";

/**
 * Full-screen chrome for the chat-app demo. Replicates the real
 * chat-app's dark-editorial layout:
 *   ┌───────────────────────────────────────┐
 *   │ topbar (wordmark · pills · reset)     │
 *   ├────────────────────────┬──────────────┤
 *   │ chat area              │ profile      │
 *   │ ...                    │ panel        │
 *   │ composer ─────────────▶│              │
 *   └────────────────────────┴──────────────┘
 *
 * Every piece is a plain children-prop wrapper so scenes can swap in
 * their own content without duplicating chrome.
 */

export const AppFrame: React.FC<{
  topBar: React.ReactNode;
  chat: React.ReactNode;
  composer: React.ReactNode;
  side: React.ReactNode;
}> = ({ topBar, chat, composer, side }) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: COLORS.bg0,
        fontFamily: FONT.body,
        color: COLORS.ink0,
        display: "flex",
        flexDirection: "column",
        backgroundImage: [
          `radial-gradient(ellipse 70% 40% at 20% 0%, rgba(182, 255, 92, 0.04), transparent 65%)`,
          `radial-gradient(ellipse 60% 40% at 100% 100%, rgba(142, 199, 255, 0.03), transparent 60%)`
        ].join(", ")
      }}
    >
      {topBar}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 520px", overflow: "hidden" }}>
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderRight: `1px solid ${COLORS.hair}`
          }}
        >
          <div style={{ flex: 1, overflow: "hidden", padding: "52px 0 16px" }}>{chat}</div>
          {composer}
        </main>
        <aside style={{ overflow: "hidden", background: COLORS.bg1 }}>{side}</aside>
      </div>
    </div>
  );
};

// ─── Top bar ────────────────────────────────────────────────────────────

export const TopBar: React.FC<{
  profileId: string | null;
  userId: string;
  revision: number | null;
  confidence: number | null;
}> = ({ profileId, userId, revision, confidence }) => {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        height: 78,
        padding: "0 32px",
        borderBottom: `1px solid ${COLORS.hair}`,
        background: "rgba(9, 9, 11, 0.78)",
        zIndex: 10
      }}
    >
      <div style={{ minWidth: 220, display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: COLORS.accent,
            boxShadow: `0 0 12px ${COLORS.accentGlow}`,
            display: "inline-block"
          }}
        />
        <span
          style={{
            fontFamily: FONT.display,
            fontSize: 24,
            fontWeight: 400,
            letterSpacing: "-0.025em",
            color: COLORS.ink0
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
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORS.ink3,
            padding: "3px 10px",
            border: `1px solid ${COLORS.hair}`,
            borderRadius: 100,
            marginLeft: 4
          }}
        >
          chat
        </span>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Pill label="user" value={userId} />
        <Pill label="profile" value={profileId ?? "—"} truncate />
        <Pill label="revision" value={revision == null ? "—" : String(revision)} />
        <Pill
          label="confidence"
          value={confidence == null ? "—" : confidence.toFixed(2)}
        />
      </div>

      <div style={{ minWidth: 220, display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 16px",
            borderRadius: 100,
            background: "transparent",
            color: COLORS.ink1,
            border: `1px solid ${COLORS.hairStrong}`,
            fontSize: 13.5,
            fontWeight: 500
          }}
        >
          Reset session
        </div>
      </div>
    </header>
  );
};

const Pill: React.FC<{ label: string; value: string; truncate?: boolean }> = ({
  label,
  value,
  truncate
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "baseline",
      gap: 10,
      padding: "6px 14px",
      background: COLORS.bg2,
      border: `1px solid ${COLORS.hair}`,
      borderRadius: 100,
      whiteSpace: "nowrap"
    }}
  >
    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: COLORS.ink3
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: 12,
        color: COLORS.ink1,
        maxWidth: truncate ? 180 : undefined,
        overflow: "hidden",
        textOverflow: "ellipsis"
      }}
    >
      {value}
    </span>
  </div>
);
