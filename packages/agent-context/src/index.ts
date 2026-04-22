import type {
  AgentContextCategory,
  AgentContextEntry,
  AgentContextOptions,
  InferredTraitRecord,
  ProfileStoreOptions,
  PsonAgentContext,
  PsonProfile
} from "@pson5/core-types";
import { loadProfile } from "@pson5/serialization-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

const KEY_METADATA: Record<
  string,
  {
    category: AgentContextCategory;
    topics: string[];
  }
> = {
  problem_solving_style: { category: "preferences", topics: ["problem", "planning", "decision", "work"] },
  learning_mode: { category: "learning_profile", topics: ["learn", "study", "education", "teaching"] },
  explanation_preference: { category: "communication_style", topics: ["explain", "communication", "teaching"] },
  task_start_pattern: { category: "behavioral_patterns", topics: ["task", "start", "deadline", "execution"] },
  deadline_effect: { category: "behavioral_patterns", topics: ["deadline", "pressure", "execution"] },
  study_start_pattern: { category: "learning_profile", topics: ["study", "exam", "education"] },
  revision_style: { category: "learning_profile", topics: ["study", "review", "education"] },
  focus_barrier: { category: "behavioral_patterns", topics: ["focus", "distraction", "study", "work"] },
  best_time_of_day: { category: "preferences", topics: ["productivity", "time", "schedule", "work"] },
  planning_style: { category: "preferences", topics: ["planning", "structure", "workflow"] },
  main_distraction: { category: "behavioral_patterns", topics: ["focus", "distraction", "work"] }
};

function getEntryMetadata(key: string): { category: AgentContextCategory; topics: string[] } {
  return KEY_METADATA[key] ?? { category: "preferences", topics: [key] };
}

function relevanceFor(key: string, intent: string, taskContext?: Record<string, unknown>): number {
  const metadata = getEntryMetadata(key);
  const intentText = normalizeText(
    [intent, ...Object.values(taskContext ?? {}).map((value) => String(value))].join(" ")
  );

  let relevance = 0.35;

  for (const topic of metadata.topics) {
    if (intentText.includes(normalizeText(topic))) {
      relevance += 0.18;
    }
  }

  if (intentText.includes(metadata.category.replaceAll("_", " "))) {
    relevance += 0.12;
  }

  return clamp(relevance);
}

function getObservedFacts(profile: PsonProfile, domains?: string[]): AgentContextEntry[] {
  const activeDomains = domains && domains.length > 0 ? new Set(domains) : null;
  const restricted = new Set(profile.privacy.restricted_fields);
  const entries: AgentContextEntry[] = [];

  for (const [domain, value] of Object.entries(profile.layers.observed)) {
    if (activeDomains && !activeDomains.has(domain)) {
      continue;
    }

    const record = asRecord(value);
    const facts = asRecord(record?.facts);
    if (!facts) {
      continue;
    }

    for (const [key, factValue] of Object.entries(facts)) {
      if (restricted.has(`layers.observed.${domain}.facts.${key}`)) {
        continue;
      }

      const metadata = getEntryMetadata(key);
      entries.push({
        key,
        value: factValue,
        domain,
        category: metadata.category,
        source: "observed",
        confidence: 0.95,
        relevance: 0,
        rationale: "Directly observed user fact."
      });
    }
  }

  return entries;
}

function getInferredTraits(profile: PsonProfile, domains?: string[]): AgentContextEntry[] {
  const activeDomains = domains && domains.length > 0 ? new Set(domains) : null;
  const inferred = asRecord(profile.layers.inferred) ?? {};
  const entries: AgentContextEntry[] = [];

  for (const [domain, value] of Object.entries(inferred)) {
    if (domain === "heuristics" || domain === "contradictions" || domain === "ai_model" || domain === "last_modeled_at") {
      continue;
    }

    if (activeDomains && !activeDomains.has(domain)) {
      continue;
    }

    const domainRecord = asRecord(value);
    const traits = domainRecord?.traits;
    if (!Array.isArray(traits)) {
      continue;
    }

    for (const trait of traits as InferredTraitRecord[]) {
      const metadata = getEntryMetadata(trait.key);
      entries.push({
        key: trait.key,
        value: trait.value,
        domain: trait.domain,
        category: metadata.category,
        source: "inferred",
        confidence: trait.confidence.score,
        relevance: 0,
        rationale: `Inferred from ${trait.source_question_ids.length} supporting question(s).`
      });
    }
  }

  return entries;
}

function getStateEntries(profile: PsonProfile): AgentContextEntry[] {
  const snapshot = getActiveStateSnapshot(profile);

  return snapshot.active_states
    .filter((state) => state.likelihood >= 0.6)
    .map((state) => ({
      key: state.state_id,
      value: state.state_id,
      domain: "state",
      category: "current_state",
      source: "inferred",
      confidence: clamp(state.likelihood),
      relevance: 0,
      rationale: "Current state derived from the state engine."
    }));
}

function getPredictionEntries(profile: PsonProfile): AgentContextEntry[] {
  return profile.simulation_profiles.scenarios.slice(-3).map((scenario) => ({
    key: scenario.id,
    value: scenario.prediction,
    domain: "simulation",
    category: "predictions",
    source: "simulation",
    confidence: clamp(scenario.confidence),
    relevance: 0,
    rationale: "Prediction from a prior simulation scenario."
  }));
}

function dedupeEntries(entries: AgentContextEntry[]): AgentContextEntry[] {
  const map = new Map<string, AgentContextEntry>();

  for (const entry of entries) {
    const existing = map.get(entry.key);
    if (!existing) {
      map.set(entry.key, entry);
      continue;
    }

    const preferCurrent =
      entry.source === "observed" ||
      (entry.relevance > existing.relevance ||
        (entry.relevance === existing.relevance && entry.confidence > existing.confidence));

    if (preferCurrent) {
      map.set(entry.key, entry);
    }
  }

  return [...map.values()];
}

function scoreEntries(entries: AgentContextEntry[], options: AgentContextOptions): AgentContextEntry[] {
  const minConfidence = options.min_confidence ?? 0.6;

  return entries
    .map((entry) => ({
      ...entry,
      relevance: relevanceFor(entry.key, options.intent, options.task_context)
    }))
    .filter((entry) => entry.confidence >= minConfidence)
    .sort((left, right) => {
      if (right.relevance !== left.relevance) {
        return right.relevance - left.relevance;
      }
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      return left.source === "observed" ? -1 : 1;
    });
}

function groupEntries(entries: AgentContextEntry[], maxItems: number): PsonAgentContext["personal_data"] {
  const grouped: PsonAgentContext["personal_data"] = {
    preferences: [],
    communication_style: [],
    behavioral_patterns: [],
    learning_profile: [],
    current_state: [],
    predictions: []
  };

  for (const entry of entries) {
    const bucket = grouped[entry.category];
    if (bucket.length < maxItems) {
      bucket.push(entry);
    }
  }

  return grouped;
}

function getAllowedFieldPrefixes(profile: PsonProfile): string[] {
  const blocked = new Set(profile.privacy.restricted_fields);
  const candidates = [
    "layers.observed",
    "layers.inferred",
    "cognitive_model",
    "behavioral_model",
    "state_model"
  ];

  return candidates.filter((field) => !blocked.has(field));
}

export function buildAgentContext(profile: PsonProfile, options: AgentContextOptions): PsonAgentContext {
  const maxItems = options.max_items ?? 6;
  const observedEntries = getObservedFacts(profile, options.domains);
  const inferredEntries = getInferredTraits(profile, options.domains);
  const stateEntries = getStateEntries(profile);
  const predictionEntries = options.include_predictions ? getPredictionEntries(profile) : [];

  const scored = scoreEntries(
    dedupeEntries([...observedEntries, ...inferredEntries, ...stateEntries, ...predictionEntries]),
    options
  );

  return {
    profile_id: profile.profile_id,
    pson_version: profile.pson_version,
    context_version: "1.0",
    intent: options.intent,
    generated_at: new Date().toISOString(),
    personal_data: groupEntries(scored, maxItems),
    constraints: {
      restricted_fields: [...profile.privacy.restricted_fields],
      local_only: profile.privacy.local_only,
      allowed_for_agent: getAllowedFieldPrefixes(profile)
    },
    reasoning_policy: {
      treat_as_fact: ["personal_data.preferences", "personal_data.communication_style"],
      treat_as_inference: ["personal_data.behavioral_patterns", "personal_data.learning_profile", "personal_data.current_state"],
      treat_as_prediction: ["personal_data.predictions"]
    }
  };
}

export async function buildStoredAgentContext(
  profileId: string,
  options: AgentContextOptions,
  storeOptions?: ProfileStoreOptions
): Promise<PsonAgentContext> {
  const profile = await loadProfile(profileId, storeOptions);
  return buildAgentContext(profile, options);
}

export const agentContextStatus = {
  phase: "implemented",
  next_step: "Add domain-specific relevance plugins and task-aware ranking refinements."
} as const;
