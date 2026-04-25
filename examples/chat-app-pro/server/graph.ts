import type { PsonProfile } from "@pson5/core-types";

/**
 * Flattens a PSON profile into the shape the browser graph visualizer
 * renders. Every observed fact, inferred trait, and simulated prediction
 * becomes a node; edges connect inferences back to the observations that
 * support them (via source_question_ids) and simulations back to the
 * inferences they cite.
 *
 * Keeping this translation on the server means the UI doesn't need to
 * know the PSON internal shape — it just lays out nodes and edges.
 */

export type GraphNodeKind = "observed" | "inferred" | "simulated" | "root";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  domain: string;
  label: string;
  value: string;
  confidence?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "evidence" | "derivation" | "has_node";
}

export interface ProfileGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildProfileGraph(profile: PsonProfile): ProfileGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const rootId = `root:${profile.profile_id}`;
  nodes.push({
    id: rootId,
    kind: "root",
    domain: "core",
    label: profile.user_id,
    value: profile.profile_id
  });

  // ─── Observed layer ────────────────────────────────────────────────
  // Per-domain shape: { facts?: {[key]: value}, observations?: {[id]: record}, answers?: {[id]: record} }
  for (const [domain, domainValue] of Object.entries(profile.layers.observed ?? {})) {
    if (!isRecord(domainValue)) continue;

    const facts = isRecord(domainValue.facts) ? (domainValue.facts as Record<string, unknown>) : null;
    if (facts) {
      for (const [key, rawValue] of Object.entries(facts)) {
        const nodeId = `observed:${domain}:${key}`;
        nodes.push({
          id: nodeId,
          kind: "observed",
          domain,
          label: key,
          value: stringifyValue(rawValue)
        });
        edges.push({ from: rootId, to: nodeId, kind: "has_node" });
      }
    }
  }

  // ─── Inferred layer ────────────────────────────────────────────────
  // Per-domain shape typically: { traits: InferredTraitRecord[] }
  // Each trait carries confidence + source_question_ids — use those to
  // draw evidence edges back into the observed layer.
  for (const [domain, domainValue] of Object.entries(profile.layers.inferred ?? {})) {
    if (!isRecord(domainValue)) continue;

    const traits = Array.isArray(domainValue.traits) ? (domainValue.traits as InferredTraitLike[]) : [];
    for (const trait of traits) {
      if (!trait || typeof trait !== "object" || typeof trait.key !== "string") continue;
      const nodeId = `inferred:${domain}:${trait.key}`;
      const confidence =
        typeof trait.confidence === "number"
          ? trait.confidence
          : typeof trait.confidence?.score === "number"
            ? trait.confidence.score
            : undefined;
      nodes.push({
        id: nodeId,
        kind: "inferred",
        domain,
        label: trait.key,
        value: stringifyValue(trait.value),
        confidence
      });
      edges.push({ from: rootId, to: nodeId, kind: "has_node" });

      // Evidence edges back to observed facts — best-effort resolution
      // using the source_question_ids list. We look for any observed
      // fact whose key matches the question id's slug tail.
      const sourceQuestionIds = Array.isArray(trait.source_question_ids)
        ? trait.source_question_ids
        : [];
      for (const qid of sourceQuestionIds) {
        if (typeof qid !== "string") continue;
        const match = findObservedMatch(profile, qid);
        if (match) {
          edges.push({ from: match, to: nodeId, kind: "evidence" });
        }
      }
    }
  }

  // ─── Simulated layer ───────────────────────────────────────────────
  // Per-scenario shape: { prediction, confidence, reasoning[], evidence[], caveats[] }
  for (const [scenario, scenarioValue] of Object.entries(profile.layers.simulated ?? {})) {
    if (!isRecord(scenarioValue)) continue;
    const nodeId = `simulated:${scenario}`;
    const prediction = typeof scenarioValue.prediction === "string" ? scenarioValue.prediction : "?";
    const confidence =
      typeof scenarioValue.confidence === "number" ? scenarioValue.confidence : undefined;
    nodes.push({
      id: nodeId,
      kind: "simulated",
      domain: "simulated",
      label: scenario,
      value: prediction,
      confidence
    });
    edges.push({ from: rootId, to: nodeId, kind: "has_node" });

    // Derivation edges from simulation to the inferred traits it cites.
    const reasoning = Array.isArray(scenarioValue.reasoning)
      ? (scenarioValue.reasoning as string[])
      : [];
    for (const snippet of reasoning) {
      for (const node of nodes) {
        if (node.kind !== "inferred") continue;
        if (typeof snippet === "string" && snippet.includes(node.label)) {
          edges.push({ from: node.id, to: nodeId, kind: "derivation" });
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── Helpers ────────────────────────────────────────────────────────────

interface InferredTraitLike {
  key?: string;
  value?: unknown;
  confidence?: number | { score?: number };
  source_question_ids?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyValue(raw: unknown): string {
  if (raw === null) return "null";
  if (raw === undefined) return "—";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try {
    const json = JSON.stringify(raw);
    return json.length > 120 ? json.slice(0, 120) + "…" : json;
  } catch {
    return "[unserializable]";
  }
}

/**
 * Given a question_id like `edu_study_start_pattern`, find any observed
 * node whose key lives in the same domain. This is best-effort: the
 * PSON engines carry richer evidence graphs internally, but for a live
 * visualization this is enough to draw sensible edges.
 */
function findObservedMatch(profile: PsonProfile, questionId: string): string | null {
  for (const [domain, domainValue] of Object.entries(profile.layers.observed ?? {})) {
    if (!isRecord(domainValue)) continue;
    const facts = isRecord(domainValue.facts) ? (domainValue.facts as Record<string, unknown>) : null;
    if (!facts) continue;
    for (const key of Object.keys(facts)) {
      if (questionId.endsWith(key) || questionId.includes(key) || key.includes(questionId)) {
        return `observed:${domain}:${key}`;
      }
    }
  }
  return null;
}
