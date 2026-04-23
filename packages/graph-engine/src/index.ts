import type { GraphEdge, GraphNode, PsonProfile } from "@pson5/core-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getTraits(profile: PsonProfile, domain: string): Record<string, unknown>[] {
  const inferred = asRecord(profile.layers.inferred);
  const domainRecord = asRecord(inferred?.[domain]);
  return Array.isArray(domainRecord?.traits) ? (domainRecord.traits as Record<string, unknown>[]) : [];
}

function getHeuristics(profile: PsonProfile): Record<string, unknown>[] {
  const inferred = asRecord(profile.layers.inferred);
  return Array.isArray(inferred?.heuristics) ? (inferred.heuristics as Record<string, unknown>[]) : [];
}

function traitNodeId(domain: string, key: string): string {
  return `trait:${domain}:${key}`;
}

function heuristicNodeId(id: string): string {
  return `heuristic:${id}`;
}

function stateNodeId(id: string): string {
  return `state:${id}`;
}

function getTraitNode(domain: string, trait: Record<string, unknown>): GraphNode {
  const key = String(trait.key);
  return {
    id: traitNodeId(domain, key),
    type: "trait",
    label: `${domain}.${key}`,
    data: {
      domain,
      key,
      value: trait.value
    }
  };
}

function getHeuristicNode(heuristic: Record<string, unknown>): GraphNode {
  return {
    id: heuristicNodeId(String(heuristic.id)),
    type: "decision_rule",
    label: String(heuristic.id),
    data: {
      domain: heuristic.domain,
      description: heuristic.description,
      outcome: heuristic.outcome
    }
  };
}

function getStateNode(state: Record<string, unknown>): GraphNode {
  return {
    id: stateNodeId(String(state.id)),
    type: "state",
    label: String(state.label),
    data: {
      triggers: state.triggers,
      behavior_shifts: state.behavior_shifts
    }
  };
}

function buildEdges(profile: PsonProfile): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const coreTraits = getTraits(profile, "core");
  const educationTraits = getTraits(profile, "education");
  const productivityTraits = getTraits(profile, "productivity");
  const states = profile.state_model.states as unknown as Record<string, unknown>[];

  const hasTrait = (domain: string, key: string): boolean =>
    [...coreTraits, ...educationTraits, ...productivityTraits].some(
      (trait) => String(trait.domain) === domain && String(trait.key) === key
    );

  for (const heuristic of getHeuristics(profile)) {
    const heuristicId = String(heuristic.id);

    if (heuristicId === "deadline_driven_activation") {
      if (hasTrait("core", "task_start_pattern")) {
        edges.push({
          id: "edge:task_start_to_deadline_activation",
          from: traitNodeId("core", "task_start_pattern"),
          to: heuristicNodeId(heuristicId),
          type: "reinforces"
        });
      }
      if (hasTrait("core", "deadline_effect")) {
        edges.push({
          id: "edge:deadline_effect_to_deadline_activation",
          from: traitNodeId("core", "deadline_effect"),
          to: heuristicNodeId(heuristicId),
          type: "causes"
        });
      }
    }

    if (heuristicId === "structured_workflow_preference" && hasTrait("productivity", "planning_style")) {
      edges.push({
        id: "edge:planning_style_to_structured_workflow",
        from: traitNodeId("productivity", "planning_style"),
        to: heuristicNodeId(heuristicId),
        type: "causes"
      });
    }

    if (heuristicId === "last_minute_study_pattern" && hasTrait("education", "study_start_pattern")) {
      edges.push({
        id: "edge:study_start_to_last_minute_study",
        from: traitNodeId("education", "study_start_pattern"),
        to: heuristicNodeId(heuristicId),
        type: "causes"
      });
    }
  }

  for (const state of states) {
    const stateId = String(state.id);
    if (stateId === "motivated" && getHeuristics(profile).some((heuristic) => String(heuristic.id) === "deadline_driven_activation")) {
      edges.push({
        id: "edge:deadline_activation_to_motivated",
        from: heuristicNodeId("deadline_driven_activation"),
        to: stateNodeId("motivated"),
        type: "correlates_with"
      });
    }
    if (stateId === "focused" && getHeuristics(profile).some((heuristic) => String(heuristic.id) === "structured_workflow_preference")) {
      edges.push({
        id: "edge:structured_workflow_to_focused",
        from: heuristicNodeId("structured_workflow_preference"),
        to: stateNodeId("focused"),
        type: "correlates_with"
      });
    }
    if (stateId === "stressed" && hasTrait("core", "deadline_effect")) {
      edges.push({
        id: "edge:deadline_effect_to_stressed",
        from: traitNodeId("core", "deadline_effect"),
        to: stateNodeId("stressed"),
        type: "correlates_with"
      });
    }
  }

  return edges;
}

const SYSTEM_INFERRED_KEYS = new Set(["heuristics", "contradictions", "ai_model", "last_modeled_at"]);

function collectDomainTraitNodes(profile: PsonProfile): GraphNode[] {
  const inferred = asRecord(profile.layers.inferred) ?? {};
  const nodes: GraphNode[] = [];

  for (const [domain, value] of Object.entries(inferred)) {
    if (SYSTEM_INFERRED_KEYS.has(domain)) {
      continue;
    }
    const record = asRecord(value);
    const traits = Array.isArray(record?.traits) ? (record.traits as Record<string, unknown>[]) : [];
    for (const trait of traits) {
      nodes.push(getTraitNode(domain, trait));
    }
  }

  return nodes;
}

function buildDomainInferenceEdges(profile: PsonProfile): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const inferred = asRecord(profile.layers.inferred) ?? {};
  const observed = profile.layers.observed ?? {};
  const heuristicIds = new Set(
    (Array.isArray(inferred.heuristics) ? (inferred.heuristics as Array<{ id?: unknown }>) : [])
      .map((h) => (typeof h.id === "string" ? h.id : null))
      .filter((id): id is string => id !== null)
  );

  for (const [domain, value] of Object.entries(inferred)) {
    if (SYSTEM_INFERRED_KEYS.has(domain)) continue;
    const record = asRecord(value);
    const traits = Array.isArray(record?.traits) ? (record.traits as Array<Record<string, unknown>>) : [];
    const observedFacts = asRecord(asRecord(observed[domain])?.facts) ?? {};

    for (const trait of traits) {
      const key = String(trait.key ?? "");
      if (!key) continue;

      // Connect any observed fact that shares the trait key to the trait node.
      if (observedFacts[key] !== undefined) {
        edges.push({
          id: `edge:observed_${domain}_${key}_to_${domain}_${key}`,
          from: `trait:${domain}:${key}`,
          to: `trait:${domain}:${key}`,
          type: "correlates_with"
        });
      }

      // Connect the trait to every heuristic in the same domain (loose affinity).
      const sourceHeuristics = Array.isArray(inferred.heuristics)
        ? (inferred.heuristics as Array<Record<string, unknown>>).filter(
            (h) => String(h.domain ?? "") === domain
          )
        : [];
      for (const heuristic of sourceHeuristics) {
        const heuristicId = String(heuristic.id ?? "");
        if (!heuristicId || !heuristicIds.has(heuristicId)) continue;
        edges.push({
          id: `edge:${domain}_${key}_to_${heuristicId}`,
          from: `trait:${domain}:${key}`,
          to: `heuristic:${heuristicId}`,
          type: "reinforces"
        });
      }
    }
  }

  return edges;
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const unique: GraphEdge[] = [];
  for (const edge of edges) {
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);
    unique.push(edge);
  }
  return unique;
}

export function deriveKnowledgeGraph(profile: PsonProfile): PsonProfile {
  const domainTraitNodes = collectDomainTraitNodes(profile);
  const heuristicNodes = getHeuristics(profile).map((heuristic) => getHeuristicNode(heuristic));
  const stateNodes = profile.state_model.states.map((state) =>
    getStateNode(state as unknown as Record<string, unknown>)
  );

  const ruleEdges = buildEdges(profile);
  const domainEdges = buildDomainInferenceEdges(profile);

  return {
    ...profile,
    knowledge_graph: {
      nodes: [...domainTraitNodes, ...heuristicNodes, ...stateNodes],
      edges: dedupeEdges([...ruleEdges, ...domainEdges])
    }
  };
}

export interface GraphQuery {
  profile_id: string;
  node_id?: string;
  edge_type?: string;
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NeighborhoodResult {
  center: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NeighborhoodOptions {
  depth?: number;
  direction?: "in" | "out" | "both";
  edge_types?: string[];
}

export interface PredictionExplanation {
  prediction: string;
  target_node_ids: string[];
  paths: GraphPath[];
  support: string[];
  missing_targets: string[];
}

const DEFAULT_NEIGHBORHOOD_DEPTH = 2;
const DEFAULT_EXPLAIN_MAX_DEPTH = 4;

const PREDICTION_TARGETS: Record<string, string[]> = {
  delayed_start: [
    "heuristic:deadline_driven_activation",
    "heuristic:last_minute_study_pattern"
  ],
  compressed_preparation: [
    "heuristic:last_minute_study_pattern",
    "heuristic:deadline_driven_activation"
  ],
  structured_execution: ["heuristic:structured_workflow_preference"],
  immediate_start: ["trait:core:task_start_pattern"]
};

function buildNodeIndex(profile: PsonProfile): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>();
  for (const node of profile.knowledge_graph.nodes) {
    index.set(node.id, node);
  }
  return index;
}

function buildAdjacency(
  profile: PsonProfile
): { outgoing: Map<string, GraphEdge[]>; incoming: Map<string, GraphEdge[]> } {
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();

  for (const edge of profile.knowledge_graph.edges) {
    const fromList = outgoing.get(edge.from) ?? [];
    fromList.push(edge);
    outgoing.set(edge.from, fromList);

    const toList = incoming.get(edge.to) ?? [];
    toList.push(edge);
    incoming.set(edge.to, toList);
  }

  return { outgoing, incoming };
}

export function getNodeNeighborhood(
  profile: PsonProfile,
  nodeId: string,
  options: NeighborhoodOptions = {}
): NeighborhoodResult {
  const depth = options.depth ?? DEFAULT_NEIGHBORHOOD_DEPTH;
  const direction = options.direction ?? "both";
  const edgeTypes = options.edge_types && options.edge_types.length > 0 ? new Set(options.edge_types) : null;

  const nodeIndex = buildNodeIndex(profile);
  const adjacency = buildAdjacency(profile);

  const center = nodeIndex.get(nodeId) ?? null;
  if (!center || depth <= 0) {
    return { center, nodes: center ? [center] : [], edges: [] };
  }

  const seenNodes = new Set<string>([nodeId]);
  const seenEdges = new Set<string>();
  const collectedEdges: GraphEdge[] = [];
  let frontier: string[] = [nodeId];

  for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
    const nextFrontier: string[] = [];

    for (const current of frontier) {
      const candidates: GraphEdge[] = [];
      if (direction !== "in") {
        candidates.push(...(adjacency.outgoing.get(current) ?? []));
      }
      if (direction !== "out") {
        candidates.push(...(adjacency.incoming.get(current) ?? []));
      }

      for (const edge of candidates) {
        if (edgeTypes && !edgeTypes.has(edge.type)) {
          continue;
        }
        if (seenEdges.has(edge.id)) {
          continue;
        }
        seenEdges.add(edge.id);
        collectedEdges.push(edge);

        const neighbourId = edge.from === current ? edge.to : edge.from;
        if (!seenNodes.has(neighbourId) && nodeIndex.has(neighbourId)) {
          seenNodes.add(neighbourId);
          nextFrontier.push(neighbourId);
        }
      }
    }

    frontier = nextFrontier;
  }

  const nodes: GraphNode[] = [];
  for (const id of seenNodes) {
    const found = nodeIndex.get(id);
    if (found) {
      nodes.push(found);
    }
  }

  return { center, nodes, edges: collectedEdges };
}

function walkSupportPaths(
  profile: PsonProfile,
  targetId: string,
  maxDepth: number
): GraphPath[] {
  const nodeIndex = buildNodeIndex(profile);
  const adjacency = buildAdjacency(profile);
  if (!nodeIndex.has(targetId)) {
    return [];
  }

  const paths: GraphPath[] = [];

  const recordPath = (edgesSoFar: GraphEdge[]): void => {
    if (edgesSoFar.length === 0) {
      return;
    }
    // edgesSoFar was accumulated walking target -> source. Reverse to source -> target order.
    const orderedEdges = [...edgesSoFar].reverse();
    const nodeIds = [orderedEdges[0].from, ...orderedEdges.map((edge) => edge.to)];
    const nodes = nodeIds
      .map((id) => nodeIndex.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    paths.push({ nodes, edges: orderedEdges });
  };

  const walk = (
    currentId: string,
    visitedNodes: Set<string>,
    edgesSoFar: GraphEdge[],
    depth: number
  ): void => {
    const incoming = adjacency.incoming.get(currentId) ?? [];
    const usableIncoming = incoming.filter((edge) => !visitedNodes.has(edge.from));

    if (depth === 0 || usableIncoming.length === 0) {
      recordPath(edgesSoFar);
      return;
    }

    for (const edge of usableIncoming) {
      const nextVisited = new Set(visitedNodes);
      nextVisited.add(edge.from);
      walk(edge.from, nextVisited, [...edgesSoFar, edge], depth - 1);
    }
  };

  walk(targetId, new Set<string>([targetId]), [], maxDepth);
  return paths;
}

function formatPath(path: GraphPath, targetLabel: string): string {
  if (path.nodes.length === 0) {
    return "";
  }

  const labels = path.nodes.map((node) => node.label || node.id);
  const edgeTypes = path.edges.map((edge) => edge.type);
  const arrowed = labels.reduce<string[]>((acc, label, index) => {
    if (index === 0) {
      return [label];
    }
    acc.push(`-[${edgeTypes[index - 1]}]->`);
    acc.push(label);
    return acc;
  }, []);

  return `Supports ${targetLabel}: ${arrowed.join(" ")}`;
}

export function explainPrediction(
  profile: PsonProfile,
  prediction: string,
  options: { max_depth?: number } = {}
): PredictionExplanation {
  const maxDepth = options.max_depth ?? DEFAULT_EXPLAIN_MAX_DEPTH;
  const targetIds = PREDICTION_TARGETS[prediction] ?? [];
  const nodeIndex = buildNodeIndex(profile);

  const reachableTargets: string[] = [];
  const missingTargets: string[] = [];
  for (const id of targetIds) {
    if (nodeIndex.has(id)) {
      reachableTargets.push(id);
    } else {
      missingTargets.push(id);
    }
  }

  const paths: GraphPath[] = [];
  for (const targetId of reachableTargets) {
    paths.push(...walkSupportPaths(profile, targetId, maxDepth));
  }

  const support: string[] = [];
  for (const targetId of reachableTargets) {
    const label = nodeIndex.get(targetId)?.label ?? targetId;
    const targetPaths = paths.filter((path) => path.nodes.at(-1)?.id === targetId);
    if (targetPaths.length === 0) {
      support.push(`Target ${label} is present in the graph but no supporting trait paths were found.`);
      continue;
    }
    for (const path of targetPaths) {
      support.push(formatPath(path, label));
    }
  }

  return {
    prediction,
    target_node_ids: targetIds,
    paths,
    support,
    missing_targets: missingTargets
  };
}

export function explainPredictionSupport(profile: PsonProfile, prediction: string): string[] {
  return explainPrediction(profile, prediction).support;
}

export const graphEngineStatus = {
  phase: "implemented",
  next_step: "Expand prediction-to-node mapping and add graph-backed similarity search."
} as const;
