import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceReference, HeuristicRecord, InferredTraitRecord, ProfileStoreOptions, PsonProfile } from "@pson5/core-types";
import { explainPredictionSupport } from "@pson5/graph-engine";
import { deriveProviderSimulationInsight, getProviderPolicyStatus, getProviderStatusFromEnv } from "@pson5/provider-engine";
import { loadProfile, resolveStoreRoot } from "@pson5/serialization-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

export interface SimulationRequest {
  profile_id: string;
  context: Record<string, unknown>;
  domains?: string[];
  options?: {
    include_reasoning?: boolean;
    include_evidence?: boolean;
    explanation_level?: "minimal" | "standard" | "detailed";
    scenario_label?: string;
  };
}

export interface SimulationResponse {
  prediction: string;
  confidence: number;
  reasoning: string[];
  evidence: EvidenceReference[];
  caveats: string[];
  alternatives?: string[];
  context_hash: string;
  cached: boolean;
  provider?: {
    mode: "rules" | "hybrid";
    provider: string;
    model: string;
    reason?: string;
  };
}

interface StoredSimulationRecord extends SimulationResponse {
  profile_id: string;
  profile_revision: number;
  generated_at: string;
  context: Record<string, unknown>;
  domains: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashContext(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function getTraitRecords(profile: PsonProfile, domain: string): InferredTraitRecord[] {
  const inferred = asRecord(profile.layers.inferred);
  const domainRecord = asRecord(inferred?.[domain]);
  const traits = domainRecord?.traits;
  return Array.isArray(traits) ? (traits as InferredTraitRecord[]) : [];
}

function getTrait(profile: PsonProfile, key: string): InferredTraitRecord | undefined {
  const allTraits = [
    ...getTraitRecords(profile, "core"),
    ...getTraitRecords(profile, "education"),
    ...getTraitRecords(profile, "productivity")
  ];
  return allTraits.find((trait) => trait.key === key);
}

function getHeuristics(profile: PsonProfile): HeuristicRecord[] {
  const inferred = asRecord(profile.layers.inferred);
  return Array.isArray(inferred?.heuristics) ? (inferred?.heuristics as HeuristicRecord[]) : [];
}

function getContradictionCount(profile: PsonProfile): number {
  const inferred = asRecord(profile.layers.inferred);
  return Array.isArray(inferred?.contradictions) ? inferred.contradictions.length : 0;
}

function getSimulationRoot(rootDir: string): string {
  return path.join(rootDir, "simulations");
}

function getSimulationPath(profileId: string, contextHash: string, rootDir: string): string {
  return path.join(getSimulationRoot(rootDir), profileId, `${contextHash}.json`);
}

async function readCachedSimulation(
  profileId: string,
  contextHash: string,
  options?: ProfileStoreOptions
): Promise<StoredSimulationRecord | null> {
  const rootDir = resolveStoreRoot(options);

  try {
    const raw = await readFile(getSimulationPath(profileId, contextHash, rootDir), "utf8");
    return JSON.parse(raw) as StoredSimulationRecord;
  } catch {
    return null;
  }
}

async function writeCachedSimulation(record: StoredSimulationRecord, options?: ProfileStoreOptions): Promise<void> {
  const rootDir = resolveStoreRoot(options);
  const filePath = getSimulationPath(record.profile_id, record.context_hash, rootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function buildCaveats(profile: PsonProfile, evidenceCount: number): string[] {
  const caveats: string[] = [];

  if (evidenceCount <= 1) {
    caveats.push("Limited evidence for this scenario.");
  }

  if (getContradictionCount(profile) > 0) {
    caveats.push("Some inferred patterns contain unresolved contradictions.");
  }

  return caveats;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function mergeUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

async function resolveSimulationResult(
  profile: PsonProfile,
  request: SimulationRequest,
  options?: ProfileStoreOptions
): Promise<Omit<SimulationResponse, "cached" | "context_hash">> {
  const ruleResult = simulateFromProfile(profile, request);
  const providerPolicy = getProviderPolicyStatus(profile, "simulation");
  const providerInsight = await deriveProviderSimulationInsight(profile, request.context, options);

  if (!providerInsight) {
    if (providerPolicy.provider_status.configured && providerPolicy.provider_status.provider && providerPolicy.provider_status.model) {
      return {
        ...ruleResult,
        provider: {
          mode: "rules",
          provider: providerPolicy.provider_status.provider,
          model: providerPolicy.provider_status.model,
          reason: providerPolicy.reason ?? "Provider result unavailable."
        }
      };
    }

    return ruleResult;
  }

  const prediction =
    providerInsight.confidence >= ruleResult.confidence
      ? providerInsight.prediction
      : ruleResult.prediction;

  const confidence =
    providerInsight.prediction === ruleResult.prediction
      ? clampConfidence((providerInsight.confidence + ruleResult.confidence) / 2)
      : clampConfidence(Math.max(providerInsight.confidence, ruleResult.confidence));

  return {
    prediction,
    confidence,
    reasoning: mergeUnique([
      ...providerInsight.reasoning.map((entry) => `Provider: ${entry}`),
      ...ruleResult.reasoning
    ]),
    evidence: ruleResult.evidence,
    caveats: mergeUnique([...providerInsight.caveats, ...ruleResult.caveats]),
    alternatives:
      request.options?.explanation_level === "detailed"
        ? mergeUnique([...(providerInsight.alternatives ?? []), ...(ruleResult.alternatives ?? [])])
        : undefined,
    provider: {
      mode: "hybrid",
      provider: providerInsight.provider,
      model: providerInsight.model
    }
  };
}

function simulateFromProfile(profile: PsonProfile, request: SimulationRequest): Omit<SimulationResponse, "cached" | "context_hash"> {
  const task = String(request.context.task ?? "").toLowerCase();
  const deadlineDaysRaw = request.context.deadline_days ?? request.context.deadline ?? request.context.days_until_due;
  const deadlineDays =
    typeof deadlineDaysRaw === "number"
      ? deadlineDaysRaw
      : typeof deadlineDaysRaw === "string"
        ? Number.parseFloat(deadlineDaysRaw)
        : Number.NaN;

  const studyStart = getTrait(profile, "study_start_pattern");
  const taskStart = getTrait(profile, "task_start_pattern");
  const deadlineEffect = getTrait(profile, "deadline_effect");
  const planningStyle = getTrait(profile, "planning_style");
  const explanationPreference = getTrait(profile, "explanation_preference");

  const heuristics = getHeuristics(profile);
  const stateSnapshot = getActiveStateSnapshot(profile);
  const hasDeadlineDrivenActivation = heuristics.some(
    (heuristic) => heuristic.id === "deadline_driven_activation"
  );
  const hasLastMinuteStudy = heuristics.some((heuristic) => heuristic.id === "last_minute_study_pattern");
  const hasStructuredWorkflow = heuristics.some(
    (heuristic) => heuristic.id === "structured_workflow_preference"
  );

  const reasoning: string[] = [];
  const evidence: EvidenceReference[] = [];
  const alternatives: string[] = [];

  let prediction = "insufficient_signal";
  let confidence = 0.42;

  const isStudyScenario = task.includes("study") || task.includes("exam");

  if (isStudyScenario && studyStart?.value === "last_minute") {
    prediction = Number.isFinite(deadlineDays) && deadlineDays <= 2 ? "delayed_start" : "compressed_preparation";
    confidence = hasLastMinuteStudy ? 0.79 : 0.72;
    reasoning.push("Observed study behavior indicates a last-minute start pattern.");
    evidence.push(...studyStart.confidence.evidence);

    if (Number.isFinite(deadlineDays) && deadlineDays <= 2) {
      reasoning.push("Short deadline increases the chance of late-but-intense preparation.");
    } else {
      reasoning.push("Longer runway may still compress effort closer to the deadline.");
    }

    alternatives.push("steady_start");
  } else if (
    taskStart?.value === "delay_start" &&
    (deadlineEffect?.value === "helps_focus" || deadlineEffect?.value === "mixed" || hasDeadlineDrivenActivation)
  ) {
    prediction = "delayed_start";
    confidence = hasDeadlineDrivenActivation ? 0.78 : 0.7;
    reasoning.push("Observed task initiation pattern suggests delayed starts.");
    evidence.push(...(taskStart?.confidence.evidence ?? []));

    if (deadlineEffect) {
      reasoning.push("Deadline effect indicates urgency increases action likelihood.");
      evidence.push(...deadlineEffect.confidence.evidence);
    }

    alternatives.push("structured_execution");
  } else if (planningStyle?.value === "structured" || hasStructuredWorkflow) {
    prediction = "structured_execution";
    confidence = hasStructuredWorkflow ? 0.74 : 0.67;
    reasoning.push("Observed productivity patterns favor structured plans.");
    evidence.push(...(planningStyle?.confidence.evidence ?? []));
    alternatives.push("flexible_execution");
  } else if (taskStart?.value === "start_immediately") {
    prediction = "immediate_start";
    confidence = 0.68;
    reasoning.push("Observed task initiation pattern points to immediate starts.");
    evidence.push(...taskStart.confidence.evidence);
    alternatives.push("delayed_start");
  } else if (explanationPreference?.value === "deep" && task.includes("learn")) {
    prediction = "deep_guidance_preferred";
    confidence = 0.64;
    reasoning.push("The profile indicates a preference for deep explanations in learning contexts.");
    evidence.push(...explanationPreference.confidence.evidence);
    alternatives.push("summary_first");
  } else {
    reasoning.push("The profile does not yet contain enough targeted evidence for a stronger prediction.");
    alternatives.push("delayed_start", "immediate_start");
  }

  const caveats = buildCaveats(profile, evidence.length);
  const contradictionPenalty = getContradictionCount(profile) > 0 ? 0.05 : 0;
  const structuralSupport = explainPredictionSupport(profile, prediction);
  const topState = stateSnapshot.active_states[0];

  if (topState && topState.likelihood >= 0.6) {
    reasoning.push(`State model currently ranks '${topState.state_id}' as a likely active state.`);
  }

  for (const support of structuralSupport) {
    reasoning.push(support);
  }

  return {
    prediction,
    confidence: clampConfidence(confidence - contradictionPenalty),
    reasoning,
    evidence,
    caveats,
    alternatives: request.options?.explanation_level === "detailed" ? alternatives : undefined
  };
}

export async function simulateStoredProfile(
  request: SimulationRequest,
  options?: ProfileStoreOptions
): Promise<SimulationResponse> {
  const profile = await loadProfile(request.profile_id, options);
  const providerStatus = getProviderStatusFromEnv();
  const contextHash = hashContext({
    context: request.context,
    domains: request.domains ?? [],
    options: request.options ?? {},
    provider: providerStatus.configured
      ? {
          provider: providerStatus.provider,
          model: providerStatus.model
        }
      : null
  });

  const cached = await readCachedSimulation(request.profile_id, contextHash, options);
  if (cached && cached.profile_revision === profile.metadata.revision) {
    return {
      prediction: cached.prediction,
      confidence: cached.confidence,
      reasoning: request.options?.include_reasoning === false ? [] : cached.reasoning,
      evidence: request.options?.include_evidence === false ? [] : cached.evidence,
      caveats: cached.caveats,
      alternatives: request.options?.explanation_level === "detailed" ? cached.alternatives : undefined,
      context_hash: contextHash,
      cached: true,
      provider: cached.provider
    };
  }

  const simulated = await resolveSimulationResult(profile, request, options);
  const record: StoredSimulationRecord = {
    profile_id: request.profile_id,
    profile_revision: profile.metadata.revision,
    generated_at: new Date().toISOString(),
    context: request.context,
    domains: request.domains ?? [],
    ...simulated,
    context_hash: contextHash,
    cached: false
  };

  await writeCachedSimulation(record, options);

  return {
    prediction: record.prediction,
    confidence: record.confidence,
    reasoning: request.options?.include_reasoning === false ? [] : record.reasoning,
    evidence: request.options?.include_evidence === false ? [] : record.evidence,
    caveats: record.caveats,
    alternatives: request.options?.explanation_level === "detailed" ? record.alternatives : undefined,
    context_hash: contextHash,
    cached: false,
    provider: record.provider
  };
}

export const simulationEngineStatus = {
  phase: "implemented",
  next_step: "Expand scenario coverage, counterfactuals, and state-aware adjustments."
} as const;
