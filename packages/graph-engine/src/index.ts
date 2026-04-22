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

export function deriveKnowledgeGraph(profile: PsonProfile): PsonProfile {
  const coreNodes = getTraits(profile, "core").map((trait) => getTraitNode("core", trait));
  const educationNodes = getTraits(profile, "education").map((trait) => getTraitNode("education", trait));
  const productivityNodes = getTraits(profile, "productivity").map((trait) => getTraitNode("productivity", trait));
  const heuristicNodes = getHeuristics(profile).map((heuristic) => getHeuristicNode(heuristic));
  const stateNodes = profile.state_model.states.map((state) => getStateNode(state as unknown as Record<string, unknown>));

  return {
    ...profile,
    knowledge_graph: {
      nodes: [...coreNodes, ...educationNodes, ...productivityNodes, ...heuristicNodes, ...stateNodes],
      edges: buildEdges(profile)
    }
  };
}

export interface GraphQuery {
  profile_id: string;
  node_id?: string;
  edge_type?: string;
}

export function explainPredictionSupport(profile: PsonProfile, prediction: string): string[] {
  const edges = profile.knowledge_graph.edges;
  const support: string[] = [];

  if (prediction === "delayed_start") {
    if (edges.some((edge) => edge.id === "edge:task_start_to_deadline_activation")) {
      support.push("Knowledge graph links task_start_pattern to deadline_driven_activation.");
    }
    if (edges.some((edge) => edge.id === "edge:deadline_effect_to_deadline_activation")) {
      support.push("Knowledge graph links deadline_effect to deadline_driven_activation.");
    }
  }

  if (prediction === "structured_execution" && edges.some((edge) => edge.id === "edge:planning_style_to_structured_workflow")) {
    support.push("Knowledge graph links planning_style to structured_workflow_preference.");
  }

  if (prediction === "delayed_start" && edges.some((edge) => edge.id === "edge:study_start_to_last_minute_study")) {
    support.push("Knowledge graph links study_start_pattern to last_minute_study_pattern.");
  }

  return support;
}

export const graphEngineStatus = {
  phase: "implemented",
  next_step: "Add neighborhood queries, richer node typing, and graph-specific explainability endpoints."
} as const;
