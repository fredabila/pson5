import type { ConfidenceRecord, EvidenceReference, PsonProfile, StateDefinition, StateTransition } from "@pson5/core-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getTrait(profile: PsonProfile, domain: string, key: string): Record<string, unknown> | null {
  const inferred = asRecord(profile.layers.inferred);
  const domainRecord = asRecord(inferred?.[domain]);
  const traits = Array.isArray(domainRecord?.traits) ? (domainRecord?.traits as Record<string, unknown>[]) : [];
  return traits.find((trait) => trait.key === key) ?? null;
}

function getHeuristic(profile: PsonProfile, id: string): Record<string, unknown> | null {
  const inferred = asRecord(profile.layers.inferred);
  const heuristics = Array.isArray(inferred?.heuristics) ? (inferred.heuristics as Record<string, unknown>[]) : [];
  return heuristics.find((heuristic) => heuristic.id === id) ?? null;
}

function getEvidence(value: Record<string, unknown> | null): EvidenceReference[] {
  const confidence = asRecord(value?.confidence);
  return Array.isArray(confidence?.evidence) ? (confidence?.evidence as EvidenceReference[]) : [];
}

function buildConfidence(score: number, evidence: EvidenceReference[]): ConfidenceRecord {
  return {
    score,
    method: "rule",
    last_validated_at: evidence[0]?.recorded_at ?? new Date().toISOString(),
    decay_policy: {
      kind: "time_decay",
      half_life_days: 14
    },
    evidence
  };
}

function makeState(
  id: string,
  label: string,
  score: number,
  triggers: string[],
  behaviorShifts: string[],
  evidence: EvidenceReference[]
): StateDefinition {
  return {
    id,
    label,
    triggers,
    behavior_shifts: behaviorShifts,
    duration_tendency: "contextual",
    recovery_signals: ["context_change", "new_feedback"],
    confidence: buildConfidence(score, evidence)
  };
}

export function deriveStateProfile(profile: PsonProfile): PsonProfile {
  const states: StateDefinition[] = [];
  const transitions: StateTransition[] = [];

  const deadlineEffect = getTrait(profile, "core", "deadline_effect");
  const planningStyle = getTrait(profile, "productivity", "planning_style");
  const distraction = getTrait(profile, "productivity", "main_distraction");
  const deadlineActivation = getHeuristic(profile, "deadline_driven_activation");
  const structuredWorkflow = getHeuristic(profile, "structured_workflow_preference");
  const lastMinuteStudy = getHeuristic(profile, "last_minute_study_pattern");

  if (deadlineEffect?.value === "causes_stress" || deadlineEffect?.value === "mixed") {
    states.push(
      makeState(
        "stressed",
        "Stressed",
        deadlineEffect.value === "causes_stress" ? 0.72 : 0.6,
        ["deadline_pressure"],
        ["reduced_breathing_room", "more_reactive_to_urgency"],
        getEvidence(deadlineEffect)
      )
    );
  }

  if (deadlineEffect?.value === "helps_focus" || deadlineActivation) {
    states.push(
      makeState(
        "motivated",
        "Motivated",
        deadlineActivation ? 0.74 : 0.64,
        ["clear_urgency", "near_deadline"],
        ["effort_activation", "higher_task_engagement"],
        [...getEvidence(deadlineEffect), ...getEvidence(deadlineActivation)]
      )
    );
  }

  if (planningStyle?.value === "structured" || structuredWorkflow) {
    states.push(
      makeState(
        "focused",
        "Focused",
        structuredWorkflow ? 0.68 : 0.58,
        ["clear_plan", "structured_tasks"],
        ["better_follow_through", "lower_context_switching"],
        [...getEvidence(planningStyle), ...getEvidence(structuredWorkflow)]
      )
    );
  }

  if (distraction) {
    states.push(
      makeState(
        "distracted",
        "Distracted",
        0.57,
        ["open_interruptions", "attention_competition"],
        ["task_switching", "reduced_continuity"],
        getEvidence(distraction)
      )
    );
  }

  if (lastMinuteStudy) {
    transitions.push({
      from: "motivated",
      to: "focused",
      triggers: ["deadline_now_salient", "study_session_started"],
      likelihood: 0.69,
      duration_window: "short_burst"
    });
  }

  if (deadlineEffect?.value === "causes_stress" || deadlineEffect?.value === "mixed") {
    transitions.push({
      from: "stressed",
      to: "focused",
      triggers: ["clear_structure", "reduced_ambiguity"],
      likelihood: 0.55,
      duration_window: "moderate"
    });
  }

  if (structuredWorkflow) {
    transitions.push({
      from: "distracted",
      to: "focused",
      triggers: ["structured_plan_added"],
      likelihood: 0.62,
      duration_window: "moderate"
    });
  }

  return {
    ...profile,
    state_model: {
      states,
      transitions
    }
  };
}

export interface StateSnapshot {
  profile_id: string;
  active_states: Array<{
    state_id: string;
    likelihood: number;
  }>;
}

export function getActiveStateSnapshot(profile: PsonProfile): StateSnapshot {
  return {
    profile_id: profile.profile_id,
    active_states: profile.state_model.states
      .map((state) => ({
        state_id: state.id,
        likelihood: state.confidence?.score ?? 0
      }))
      .sort((left, right) => right.likelihood - left.likelihood)
  };
}

export const stateEngineStatus = {
  phase: "implemented",
  next_step: "Add richer state transitions and decay tied to new events and feedback."
} as const;
