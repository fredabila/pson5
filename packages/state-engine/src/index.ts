import type { ConfidenceRecord, EvidenceReference, PsonProfile, StateDefinition, StateTransition } from "@pson5/core-types";

const DEFAULT_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_DECAYED_SCORE = 0.05;
const TRIGGER_BOOST_PER_MATCH = 0.05;
const MAX_TRIGGER_BOOST = 0.15;

export interface StateEvaluationOptions {
  now?: Date;
  apply_decay?: boolean;
  apply_trigger_boost?: boolean;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function getHalfLifeDays(confidence: ConfidenceRecord): number {
  const fromPolicy =
    confidence.decay_policy && confidence.decay_policy.kind === "time_decay"
      ? confidence.decay_policy.half_life_days
      : undefined;

  return typeof fromPolicy === "number" && fromPolicy > 0 ? fromPolicy : DEFAULT_HALF_LIFE_DAYS;
}

export function applyConfidenceDecay(confidence: ConfidenceRecord, now: Date = new Date()): number {
  const anchor = confidence.last_validated_at ? new Date(confidence.last_validated_at) : null;
  const base = Math.max(0, confidence.score ?? 0);

  if (!anchor || Number.isNaN(anchor.getTime())) {
    return clampScore(base);
  }

  const elapsedMs = now.getTime() - anchor.getTime();
  if (elapsedMs <= 0) {
    return clampScore(base);
  }

  const halfLifeDays = getHalfLifeDays(confidence);
  const halfLives = elapsedMs / MS_PER_DAY / halfLifeDays;
  const decayed = base * Math.pow(0.5, halfLives);
  return clampScore(Math.max(decayed, base === 0 ? 0 : MIN_DECAYED_SCORE));
}

export function getProfileTriggerContext(profile: PsonProfile): Set<string> {
  const active = new Set<string>();

  for (const value of Object.values(profile.layers.observed)) {
    const domain = asRecord(value);
    const facts = asRecord(domain?.facts);
    if (!facts) {
      continue;
    }

    if (facts.deadline_effect === "causes_stress" || facts.deadline_effect === "mixed") {
      active.add("deadline_pressure");
    }
    if (facts.deadline_effect === "helps_focus" || facts.deadline_effect === "mixed") {
      active.add("clear_urgency");
      active.add("near_deadline");
    }
    if (facts.task_start_pattern === "delay_start") {
      active.add("near_deadline");
    }
    if (facts.planning_style === "structured") {
      active.add("clear_plan");
      active.add("structured_tasks");
      active.add("clear_structure");
    }
    if (typeof facts.main_distraction === "string" && facts.main_distraction.trim() !== "") {
      active.add("open_interruptions");
      active.add("attention_competition");
    }
    if (facts.study_start_pattern === "last_minute") {
      active.add("deadline_now_salient");
    }
  }

  return active;
}

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

export interface StateSnapshotEntry {
  state_id: string;
  likelihood: number;
  base_confidence: number;
  decayed_confidence: number;
  trigger_boost: number;
  matched_triggers: string[];
}

export interface StateSnapshot {
  profile_id: string;
  generated_at: string;
  evaluated_triggers: string[];
  decay_applied: boolean;
  active_states: StateSnapshotEntry[];
}

export function getActiveStateSnapshot(
  profile: PsonProfile,
  options: StateEvaluationOptions = {}
): StateSnapshot {
  const now = options.now ?? new Date();
  const applyDecay = options.apply_decay !== false;
  const applyTriggerBoost = options.apply_trigger_boost !== false;
  const triggerContext = applyTriggerBoost ? getProfileTriggerContext(profile) : new Set<string>();

  const active_states: StateSnapshotEntry[] = profile.state_model.states.map((state) => {
    const confidence = state.confidence;
    const baseScore = clampScore(confidence?.score ?? 0);
    const decayedScore = applyDecay && confidence ? applyConfidenceDecay(confidence, now) : baseScore;

    const matched = applyTriggerBoost
      ? (state.triggers ?? []).filter((trigger) => triggerContext.has(trigger))
      : [];
    const triggerBoost = clampScore(Math.min(matched.length * TRIGGER_BOOST_PER_MATCH, MAX_TRIGGER_BOOST));
    const likelihood = clampScore(decayedScore + triggerBoost);

    return {
      state_id: state.id,
      likelihood,
      base_confidence: baseScore,
      decayed_confidence: decayedScore,
      trigger_boost: triggerBoost,
      matched_triggers: matched
    };
  });

  return {
    profile_id: profile.profile_id,
    generated_at: now.toISOString(),
    evaluated_triggers: [...triggerContext].sort(),
    decay_applied: applyDecay,
    active_states: active_states.sort((left, right) => right.likelihood - left.likelihood)
  };
}

export const stateEngineStatus = {
  phase: "implemented",
  next_step: "Expand trigger derivation beyond observed facts to include real-time event signals."
} as const;
