import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../../style/tokens";

/**
 * Infrastructure overview — the "this is real infrastructure, not a demo"
 * beat. Lists all fifteen @pson5 packages, shows three benchmark numbers
 * measured by scripts/benchmark.mjs, and renders a snippet of the .pson
 * file format.
 *
 * Frame 0 ~ 710 (24s). Timed to "demo-07-infra.wav" (22.90s).
 */

interface PackageEntry {
  name: string;
  tag: "core" | "engine" | "storage" | "surface" | "integration";
  desc: string;
}

const PACKAGES: PackageEntry[] = [
  { name: "@pson5/sdk", tag: "surface", desc: "primary TypeScript SDK" },
  { name: "@pson5/cli", tag: "surface", desc: "Ink interactive console + MCP stdio" },
  { name: "@pson5/core-types", tag: "core", desc: "shared interface truth" },
  { name: "@pson5/schemas", tag: "core", desc: "JSON-Schema validation" },
  { name: "@pson5/privacy", tag: "core", desc: "consent + redaction" },
  { name: "@pson5/acquisition-engine", tag: "engine", desc: "adaptive question flow" },
  { name: "@pson5/modeling-engine", tag: "engine", desc: "trait + heuristic inference" },
  { name: "@pson5/simulation-engine", tag: "engine", desc: "reasoning-trace predictions" },
  { name: "@pson5/state-engine", tag: "engine", desc: "dynamic-state derivation" },
  { name: "@pson5/graph-engine", tag: "engine", desc: "deterministic knowledge graph" },
  { name: "@pson5/serialization-engine", tag: "engine", desc: ".pson file I/O + observeFact" },
  { name: "@pson5/provider-engine", tag: "integration", desc: "pluggable provider registry" },
  { name: "@pson5/agent-context", tag: "integration", desc: "consent-scoped projection" },
  { name: "@pson5/neo4j-store", tag: "storage", desc: "Cypher-based graph mirror" },
  { name: "@pson5/postgres-store", tag: "storage", desc: "repository + schema helpers" }
];

const TAG_COLOR: Record<PackageEntry["tag"], string> = {
  surface: COLORS.accent,
  core: COLORS.observed,
  engine: COLORS.inferred,
  integration: "#c99cff",
  storage: COLORS.simulated
};

interface Benchmark {
  label: string;
  value: string;
  unit: string;
  accent: string;
}

const BENCHMARKS: Benchmark[] = [
  { label: "Merge 5000 traits", value: "3.2", unit: "ms", accent: COLORS.inferred },
  { label: "Simulate 1000 decisions", value: "1.2", unit: "ms", accent: COLORS.simulated },
  { label: "Round-trip 1000 facts", value: "0.8", unit: "ms", accent: COLORS.observed }
];

export const InfraScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg0,
        padding: "64px 100px",
        display: "flex",
        flexDirection: "column",
        gap: 28
      }}
    >
      <div style={{ opacity: titleOpacity }}>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            letterSpacing: "0.28em",
            color: COLORS.accent,
            textTransform: "uppercase",
            marginBottom: 12
          }}
        >
          ─── the infrastructure
        </div>
        <h2
          style={{
            fontFamily: FONT.display,
            fontSize: 52,
            fontWeight: 400,
            letterSpacing: "-0.03em",
            color: COLORS.ink0,
            margin: 0,
            lineHeight: 1.05
          }}
        >
          Fifteen packages.{" "}
          <em
            style={{
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            Production-shape.
          </em>
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: 40,
          flex: 1,
          minHeight: 0
        }}
      >
        {/* Package grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            alignContent: "start"
          }}
        >
          {PACKAGES.map((pkg, i) => (
            <PackageRow key={pkg.name} pkg={pkg} index={i} />
          ))}
        </div>

        {/* Benchmarks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: COLORS.ink3,
                marginBottom: 14
              }}
            >
              ─── measured
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {BENCHMARKS.map((bm, i) => (
                <BenchmarkRow key={bm.label} bench={bm} appearAt={300 + i * 40} />
              ))}
            </div>
          </div>

          <PsonFileSnippet appearAt={520} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PackageRow: React.FC<{ pkg: PackageEntry; index: number }> = ({ pkg, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appearAt = 60 + index * 12;
  const elapsed = frame - appearAt;
  if (elapsed < 0) return null;

  const arrival = spring({ frame: elapsed, fps, config: SPRING_SOFT });
  const opacity = interpolate(arrival, [0, 1], [0, 1]);
  const translateY = interpolate(arrival, [0, 1], [6, 0]);
  const tagColor = TAG_COLOR[pkg.tag];

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        padding: "10px 14px",
        background: COLORS.bg1,
        border: `1px solid ${COLORS.hair}`,
        borderLeft: `2px solid ${tagColor}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        gap: 3
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between"
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            color: COLORS.ink0,
            fontWeight: 500
          }}
        >
          {pkg.name}
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 9,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: tagColor,
            opacity: 0.85
          }}
        >
          {pkg.tag}
        </span>
      </div>
      <span
        style={{
          fontSize: 11.5,
          color: COLORS.ink2
        }}
      >
        {pkg.desc}
      </span>
    </div>
  );
};

const BenchmarkRow: React.FC<{ bench: Benchmark; appearAt: number }> = ({
  bench,
  appearAt
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - appearAt;
  if (elapsed < 0) return null;

  const opacity = interpolate(elapsed, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const counter = interpolate(elapsed, [10, 50], [0, parseFloat(bench.value)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div style={{ opacity, display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: COLORS.ink2
        }}
      >
        {bench.label}
      </div>
      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 44,
          fontWeight: 500,
          color: bench.accent,
          letterSpacing: "-0.025em",
          lineHeight: 1
        }}
      >
        {counter.toFixed(counter < 10 ? 2 : 1)}
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 16,
            color: COLORS.ink2,
            marginLeft: 6,
            fontWeight: 400
          }}
        >
          {bench.unit}
        </span>
      </div>
    </div>
  );
};

const PsonFileSnippet: React.FC<{ appearAt: number }> = ({ appearAt }) => {
  const frame = useCurrentFrame();
  const elapsed = frame - appearAt;
  if (elapsed < 0) return null;

  const opacity = interpolate(elapsed, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        opacity,
        padding: "14px 16px",
        background: COLORS.bg1,
        border: `1px solid ${COLORS.hair}`,
        borderRadius: 8,
        fontFamily: FONT.mono,
        fontSize: 10.5,
        lineHeight: 1.55,
        color: COLORS.ink1,
        overflow: "hidden"
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: COLORS.ink3,
          marginBottom: 8
        }}
      >
        ─── profile.pson
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre", overflow: "hidden" }}>
{`{
  "pson_version": "5.0",
  "profile_id": "pson_...",
  "layers": {
    "`}<span style={{ color: COLORS.observed }}>observed</span>{`": { ... },
    "`}<span style={{ color: COLORS.inferred }}>inferred</span>{`": { ... },
    "`}<span style={{ color: COLORS.simulated }}>simulated</span>{`": { ... }
  },
  "consent": { ... },
  "privacy": { ... }
}`}
      </pre>
    </div>
  );
};
