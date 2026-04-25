import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, ProfileGraph } from "../api";

interface Props {
  graph: ProfileGraph | null;
}

type Positioned = GraphNode & { x: number; y: number; vx: number; vy: number };

const ACCENT: Record<GraphNode["kind"], string> = {
  observed: "#f5c76a",
  inferred: "#b6ff5c",
  simulated: "#8ec7ff",
  root: "#f5f4ef"
};

/**
 * Force-directed SVG graph visualisation of the profile.
 *
 * Physics model (intentionally simple — no library):
 *   • repulsion between every pair of nodes      (~1/distance² pushback)
 *   • spring attraction along every edge         (~distance relative to rest length)
 *   • centering bias                             (drag everything toward the viewport centre)
 *   • viscous damping per tick
 *
 * Root pins to the centre. Layers naturally separate into shells by
 * the edge structure (observed → root → inferred → simulated), with
 * evidence edges pulling inferred nodes toward the observed facts that
 * support them.
 *
 * Positions are persisted in state so the layout doesn't restart every
 * time the graph snapshot refreshes; only new nodes get fresh seeds.
 */
export function GraphPanel({ graph }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const positionsRef = useRef<Map<string, Positioned>>(new Map());
  const [tick, setTick] = useState(0);

  const { nodes, edges } = graph ?? { nodes: [], edges: [] };

  // Seed any new nodes; carry forward existing positions.
  useMemo(() => {
    const positions = positionsRef.current;
    const seen = new Set<string>();

    for (const node of nodes) {
      seen.add(node.id);
      if (!positions.has(node.id)) {
        const angle = Math.random() * Math.PI * 2;
        const radius = node.kind === "root" ? 0 : 80 + Math.random() * 60;
        positions.set(node.id, {
          ...node,
          x: WIDTH / 2 + Math.cos(angle) * radius,
          y: HEIGHT / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0
        });
      } else {
        // Carry forward existing position + velocity, update label/value/confidence
        const existing = positions.get(node.id)!;
        positions.set(node.id, {
          ...existing,
          kind: node.kind,
          domain: node.domain,
          label: node.label,
          value: node.value,
          confidence: node.confidence
        });
      }
    }

    // Drop nodes that are no longer in the graph.
    for (const id of Array.from(positions.keys())) {
      if (!seen.has(id)) positions.delete(id);
    }
  }, [nodes]);

  // Physics loop.
  useEffect(() => {
    if (nodes.length === 0) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }

    const step = () => {
      const positions = positionsRef.current;
      const list = Array.from(positions.values());

      // Repulsion.
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = Math.max(16, dx * dx + dy * dy);
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Spring attraction along edges.
      for (const edge of edges) {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) continue;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const rest = edge.kind === "has_node" ? REST_HAS_NODE : REST_OTHER;
        const force = (dist - rest) * SPRING_K;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        from.vx += fx;
        from.vy += fy;
        to.vx -= fx;
        to.vy -= fy;
      }

      // Centering bias + viscous damping + integration.
      const cx = WIDTH / 2;
      const cy = HEIGHT / 2;
      for (const node of list) {
        node.vx += (cx - node.x) * CENTER_K;
        node.vy += (cy - node.y) * CENTER_K;
        node.vx *= DAMPING;
        node.vy *= DAMPING;

        if (node.kind === "root") {
          // Pin root to centre — no integration.
          node.x = cx;
          node.y = cy;
          node.vx = 0;
          node.vy = 0;
          continue;
        }

        node.x += node.vx;
        node.y += node.vy;

        // Keep inside the viewport.
        node.x = Math.max(PADDING, Math.min(WIDTH - PADDING, node.x));
        node.y = Math.max(PADDING, Math.min(HEIGHT - PADDING, node.y));
      }

      setTick((t) => (t + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes.length, edges]);

  const positions = positionsRef.current;

  if (nodes.length === 0) {
    return (
      <div className="graph graph--empty" aria-label="Empty graph">
        <div>
          <span className="graph__empty-eyebrow">KNOWLEDGE GRAPH</span>
          <h2>Your graph will appear here.</h2>
          <p>
            Nodes are observations, inferences, and simulations. Edges show provenance —
            which observed facts support each inferred trait, and which traits feed each
            simulated prediction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph" data-tick={tick}>
      <header className="graph__head">
        <span className="graph__eyebrow">KNOWLEDGE GRAPH · LIVE</span>
        <h2 className="graph__title">How your profile connects</h2>
        <Legend />
      </header>

      <svg
        className="graph__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {(["observed", "inferred", "simulated", "root"] as GraphNode["kind"][]).map((kind) => (
            <radialGradient key={kind} id={`glow-${kind}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={ACCENT[kind]} stopOpacity="0.9" />
              <stop offset="60%" stopColor={ACCENT[kind]} stopOpacity="0.16" />
              <stop offset="100%" stopColor={ACCENT[kind]} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {/* Edges first so they sit beneath nodes */}
        {edges.map((edge, i) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const strokeColor =
            edge.kind === "evidence"
              ? "rgba(245, 199, 106, 0.55)"
              : edge.kind === "derivation"
                ? "rgba(142, 199, 255, 0.55)"
                : "rgba(182, 255, 92, 0.28)";
          const strokeWidth = edge.kind === "has_node" ? 1 : 1.4;
          const dasharray = edge.kind === "has_node" ? "3 4" : undefined;
          return (
            <line
              key={`${edge.from}→${edge.to}-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={dasharray}
            />
          );
        })}

        {/* Nodes */}
        {Array.from(positions.values()).map((node) => {
          const isHovered = hovered === node.id;
          const radius = node.kind === "root" ? 16 : 10;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              <circle r={radius * 4} fill={`url(#glow-${node.kind})`} opacity={isHovered ? 1 : 0.7} />
              <circle
                r={radius}
                fill="#09090b"
                stroke={ACCENT[node.kind]}
                strokeWidth={isHovered ? 2.5 : 1.6}
                style={{ filter: `drop-shadow(0 0 6px ${ACCENT[node.kind]})` }}
              />
              <circle r={radius * 0.4} fill={ACCENT[node.kind]} opacity={0.85} />
              {(isHovered || node.kind === "root") && (
                <g>
                  <rect
                    x={radius + 10}
                    y={-22}
                    width={Math.max(80, (node.label.length + node.value.length) * 6.5 + 24)}
                    height={44}
                    rx={6}
                    fill="rgba(9, 9, 11, 0.92)"
                    stroke="rgba(245, 244, 239, 0.16)"
                  />
                  <text
                    x={radius + 22}
                    y={-6}
                    fill={ACCENT[node.kind]}
                    fontFamily="JetBrains Mono, monospace"
                    fontSize={10}
                    letterSpacing="0.1em"
                    style={{ textTransform: "uppercase" }}
                  >
                    {node.domain} · {node.label}
                  </text>
                  <text
                    x={radius + 22}
                    y={12}
                    fill="#f5f4ef"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize={11}
                  >
                    {node.value}
                    {node.confidence != null && (
                      <tspan fill="#7d7b73" fontSize={10} dx={8}>
                        {node.confidence.toFixed(2)}
                      </tspan>
                    )}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const Legend = () => (
  <ul className="graph__legend">
    <li><span className="graph__dot" style={{ background: ACCENT.observed }} />observed</li>
    <li><span className="graph__dot" style={{ background: ACCENT.inferred }} />inferred</li>
    <li><span className="graph__dot" style={{ background: ACCENT.simulated }} />simulated</li>
  </ul>
);

// ─── Physics constants ─────────────────────────────────────────────────

const WIDTH = 560;
const HEIGHT = 560;
const PADDING = 28;
const REPULSION = 3200;
const REST_HAS_NODE = 140;
const REST_OTHER = 100;
const SPRING_K = 0.012;
const CENTER_K = 0.006;
const DAMPING = 0.72;
