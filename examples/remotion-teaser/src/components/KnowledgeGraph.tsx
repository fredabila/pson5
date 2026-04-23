import React from "react";
import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";

/**
 * A small curated knowledge graph rendered via SVG. Positions are
 * deterministic — computed once via a tiny force-directed relaxation —
 * so every render is pixel-stable.
 *
 * Nodes carry a `kind` which colours them from the three-layer palette.
 * Edges appear by index, nodes appear slightly after their first edge
 * so the graph "grows" from the centre outward.
 */

export type GraphNode = {
  id: string;
  label: string;
  kind: "observed" | "inferred" | "simulated" | "root";
  /** Radius in px. */
  size?: number;
};

export type GraphEdge = {
  from: string;
  to: string;
  weight?: number;
  appearAt: number; // frame this edge starts drawing
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  revealStart?: number;
  nodeAppearOffset?: number; // frames after edge.appearAt that the target node arrives
};

// --- Deterministic force layout --------------------------------------

type Vec = { x: number; y: number };

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): Record<string, Vec> {
  const rnd = seededRandom(424242);
  const positions: Record<string, Vec> = {};
  const cx = width / 2;
  const cy = height / 2;

  // Seed: place the "root" at the centre, others on a ring
  nodes.forEach((n, i) => {
    if (n.kind === "root") {
      positions[n.id] = { x: cx, y: cy };
    } else {
      const angle = (i / nodes.length) * Math.PI * 2 + rnd() * 0.5;
      const radius = 220 + rnd() * 90;
      positions[n.id] = {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    }
  });

  // Classical Fruchterman-Reingold-ish relaxation
  const area = width * height;
  const k = Math.sqrt(area / nodes.length);
  const iterations = 220;
  let temperature = width / 10;

  for (let iter = 0; iter < iterations; iter++) {
    const disp: Record<string, Vec> = {};
    for (const n of nodes) disp[n.id] = { x: 0, y: 0 };

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = positions[a.id].x - positions[b.id].x;
        const dy = positions[a.id].y - positions[b.id].y;
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        const force = (k * k) / dist;
        const nx = (dx / dist) * force;
        const ny = (dy / dist) * force;
        disp[a.id].x += nx;
        disp[a.id].y += ny;
        disp[b.id].x -= nx;
        disp[b.id].y -= ny;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = positions[edge.from];
      const b = positions[edge.to];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const force = (dist * dist) / k;
      const nx = (dx / dist) * force;
      const ny = (dy / dist) * force;
      disp[edge.from].x -= nx;
      disp[edge.from].y -= ny;
      disp[edge.to].x += nx;
      disp[edge.to].y += ny;
    }

    // Pin the root
    for (const n of nodes) {
      if (n.kind === "root") {
        disp[n.id].x = 0;
        disp[n.id].y = 0;
        continue;
      }
      const d = disp[n.id];
      const mag = Math.max(0.01, Math.sqrt(d.x * d.x + d.y * d.y));
      const limited = Math.min(mag, temperature);
      positions[n.id].x += (d.x / mag) * limited;
      positions[n.id].y += (d.y / mag) * limited;

      // Keep inside frame with a margin
      const margin = 110;
      positions[n.id].x = Math.max(margin, Math.min(width - margin, positions[n.id].x));
      positions[n.id].y = Math.max(margin, Math.min(height - margin, positions[n.id].y));
    }

    temperature *= 0.96;
  }

  return positions;
}

const kindColor: Record<GraphNode["kind"], string> = {
  observed: COLORS.observed,
  inferred: COLORS.inferred,
  simulated: COLORS.simulated,
  root: COLORS.ink0
};

export const KnowledgeGraph: React.FC<Props> = ({
  nodes,
  edges,
  width,
  height,
  revealStart = 0,
  nodeAppearOffset = 6
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const positions = React.useMemo(
    () => computeLayout(nodes, edges, width, height),
    [nodes, edges, width, height]
  );

  // When does each node first appear? Either its first incoming/outgoing
  // edge (plus offset) or revealStart if it's the root.
  const nodeAppearAt: Record<string, number> = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of nodes) map[n.id] = Number.POSITIVE_INFINITY;
    for (const e of edges) {
      const arrive = e.appearAt + nodeAppearOffset;
      map[e.to] = Math.min(map[e.to], arrive);
      map[e.from] = Math.min(map[e.from], e.appearAt);
    }
    for (const n of nodes) {
      if (n.kind === "root") map[n.id] = revealStart;
      if (!Number.isFinite(map[n.id])) map[n.id] = revealStart;
    }
    return map;
  }, [nodes, edges, nodeAppearOffset, revealStart]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="glow-observed" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={COLORS.observed} stopOpacity="0.9" />
          <stop offset="60%" stopColor={COLORS.observed} stopOpacity="0.15" />
          <stop offset="100%" stopColor={COLORS.observed} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-inferred" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={COLORS.inferred} stopOpacity="0.9" />
          <stop offset="60%" stopColor={COLORS.inferred} stopOpacity="0.15" />
          <stop offset="100%" stopColor={COLORS.inferred} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-simulated" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={COLORS.simulated} stopOpacity="0.9" />
          <stop offset="60%" stopColor={COLORS.simulated} stopOpacity="0.15" />
          <stop offset="100%" stopColor={COLORS.simulated} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-root" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={COLORS.ink0} stopOpacity="1" />
          <stop offset="55%" stopColor={COLORS.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={COLORS.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Edges */}
      {edges.map((e, i) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (!a || !b) return null;
        const elapsed = frame - e.appearAt;
        if (elapsed < 0) return null;
        const draw = interpolate(elapsed, [0, 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        const pulse = 0.6 + 0.4 * Math.sin((frame + i * 13) / 20);
        const midX = (a.x + b.x) / 2 + Math.sin((frame + i * 17) / 24) * 4;
        const midY = (a.y + b.y) / 2 + Math.cos((frame + i * 17) / 24) * 4;

        const toNode = nodes.find((n) => n.id === e.to);
        const edgeColor = toNode ? kindColor[toNode.kind] : COLORS.accent;

        // Interpolated endpoint for draw-in effect
        const endX = a.x + (midX * 2 - a.x) * draw;
        const endY = a.y + (midY * 2 - a.y) * draw;
        const realEndX = draw < 0.5
          ? a.x + (midX - a.x) * (draw * 2)
          : midX + (b.x - midX) * ((draw - 0.5) * 2);
        const realEndY = draw < 0.5
          ? a.y + (midY - a.y) * (draw * 2)
          : midY + (b.y - midY) * ((draw - 0.5) * 2);

        return (
          <g key={`${e.from}-${e.to}-${i}`}>
            <path
              d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${realEndX} ${realEndY}`}
              stroke={edgeColor}
              strokeWidth={1.4}
              fill="none"
              opacity={0.35 + 0.35 * pulse}
              style={{ filter: `drop-shadow(0 0 4px ${edgeColor})` }}
            />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        const p = positions[n.id];
        if (!p) return null;
        const appearAt = nodeAppearAt[n.id];
        const elapsed = frame - appearAt;
        if (elapsed < 0) return null;

        const appear = spring({
          frame: elapsed,
          fps,
          config: SPRING_SOFT
        });
        const scale = interpolate(appear, [0, 1], [0.2, 1]);
        const opacity = interpolate(appear, [0, 1], [0, 1]);
        const pulse = 0.8 + 0.2 * Math.sin((frame + n.id.length * 11) / 22);

        const color = kindColor[n.kind];
        const radius = (n.size ?? (n.kind === "root" ? 26 : 14)) * scale;
        const glowId = `glow-${n.kind}`;
        const glowSize = radius * 4;

        return (
          <g key={n.id} opacity={opacity} transform={`translate(${p.x} ${p.y})`}>
            <circle
              cx={0}
              cy={0}
              r={glowSize}
              fill={`url(#${glowId})`}
              opacity={pulse}
            />
            <circle
              cx={0}
              cy={0}
              r={radius}
              fill={COLORS.bg1}
              stroke={color}
              strokeWidth={1.8}
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
            {n.kind === "root" ? (
              <circle cx={0} cy={0} r={radius * 0.45} fill={COLORS.accent} />
            ) : (
              <circle cx={0} cy={0} r={radius * 0.35} fill={color} opacity={0.85} />
            )}
            <text
              x={0}
              y={radius + 22}
              textAnchor="middle"
              fontFamily={FONT.mono}
              fontSize={12}
              fill={COLORS.ink1}
              letterSpacing="0.1em"
              style={{ textTransform: "uppercase" }}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
