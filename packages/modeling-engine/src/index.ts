import type {
  AiModelingInsight,
  ConfidenceRecord,
  EvidenceReference,
  HeuristicRecord,
  InferredTraitRecord,
  ObservedAnswerRecord,
  ProfileStoreOptions,
  PsonProfile
} from "@pson5/core-types";
import { deriveProviderModelingInsight } from "@pson5/provider-engine";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getDomainObservedAnswers(profile: PsonProfile, domain: string): ObservedAnswerRecord[] {
  const domainValue = asRecord(profile.layers.observed[domain]);
  const answers = asRecord(domainValue?.answers);

  if (!answers) {
    return [];
  }

  return Object.values(answers)
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => value !== null)
    .map((value) => value as unknown as ObservedAnswerRecord);
}

function findAnswer(profile: PsonProfile, domain: string, questionId: string): ObservedAnswerRecord | undefined {
  return getDomainObservedAnswers(profile, domain).find((answer) => answer.question_id === questionId);
}

function buildEvidence(answer: ObservedAnswerRecord): EvidenceReference[] {
  return [
    {
      source_type: "answer",
      source_id: answer.source_id,
      recorded_at: answer.recorded_at,
      weight: 1
    }
  ];
}

function buildConfidence(answer: ObservedAnswerRecord, score: number): ConfidenceRecord {
  return {
    score,
    method: "rule",
    last_validated_at: answer.recorded_at,
    decay_policy: {
      kind: "time_decay",
      half_life_days: 30
    },
    evidence: buildEvidence(answer)
  };
}

function makeTrait(answer: ObservedAnswerRecord, key: string, domain = answer.domain): InferredTraitRecord {
  return {
    key,
    value: answer.normalized_value,
    domain,
    source_question_ids: [answer.question_id],
    confidence: buildConfidence(answer, 0.72)
  };
}

function buildDomainTraits(profile: PsonProfile, domain: string, keyMap: Record<string, string>): InferredTraitRecord[] {
  return Object.entries(keyMap)
    .map(([questionId, key]) => {
      const answer = findAnswer(profile, domain, questionId);
      return answer ? makeTrait(answer, key, domain) : null;
    })
    .filter((value): value is InferredTraitRecord => value !== null);
}

function buildHeuristics(profile: PsonProfile): HeuristicRecord[] {
  const heuristics: HeuristicRecord[] = [];
  const coreTaskStart = findAnswer(profile, "core", "core_task_start_pattern");
  const coreDeadline = findAnswer(profile, "core", "core_deadline_effect");
  const prodPlanning = findAnswer(profile, "productivity", "prod_planning_style");
  const eduStudyStart = findAnswer(profile, "education", "edu_study_start_pattern");

  if (
    coreTaskStart?.normalized_value === "delay_start" &&
    (coreDeadline?.normalized_value === "helps_focus" || coreDeadline?.normalized_value === "mixed")
  ) {
    heuristics.push({
      id: "deadline_driven_activation",
      domain: "core",
      description: "User is more likely to activate effort closer to deadlines than at task start.",
      when: {
        task_start_pattern: "delay_start",
        deadline_effect: coreDeadline.normalized_value
      },
      outcome: "likely_to_start_late_then_increase_effort",
      confidence: {
        score: 0.78,
        method: "rule",
        last_validated_at: coreDeadline.recorded_at,
        decay_policy: {
          kind: "time_decay",
          half_life_days: 30
        },
        evidence: [...buildEvidence(coreTaskStart), ...buildEvidence(coreDeadline)]
      }
    });
  }

  if (prodPlanning?.normalized_value === "structured") {
    heuristics.push({
      id: "structured_workflow_preference",
      domain: "productivity",
      description: "User tends to perform better when work is presented in a structured plan.",
      when: {
        planning_style: "structured"
      },
      outcome: "prefer_structured_plans",
      confidence: {
        score: 0.74,
        method: "rule",
        last_validated_at: prodPlanning.recorded_at,
        decay_policy: {
          kind: "time_decay",
          half_life_days: 30
        },
        evidence: buildEvidence(prodPlanning)
      }
    });
  }

  if (eduStudyStart?.normalized_value === "last_minute") {
    heuristics.push({
      id: "last_minute_study_pattern",
      domain: "education",
      description: "User tends to begin exam preparation late unless prompted earlier.",
      when: {
        study_start_pattern: "last_minute"
      },
      outcome: "likely_to_delay_exam_preparation",
      confidence: {
        score: 0.76,
        method: "rule",
        last_validated_at: eduStudyStart.recorded_at,
        decay_policy: {
          kind: "time_decay",
          half_life_days: 30
        },
        evidence: buildEvidence(eduStudyStart)
      }
    });
  }

  return heuristics;
}

function averageConfidence(traits: InferredTraitRecord[], heuristics: HeuristicRecord[]): number {
  const scores = [
    ...traits.map((trait) => trait.confidence.score),
    ...heuristics.map((heuristic) => heuristic.confidence.score)
  ];

  if (scores.length === 0) {
    return 0;
  }

  const sum = scores.reduce((total, value) => total + value, 0);
  return Number((sum / scores.length).toFixed(2));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function applyProviderInsight(profile: PsonProfile, insight: AiModelingInsight): PsonProfile {
  return {
    ...profile,
    layers: {
      ...profile.layers,
      inferred: {
        ...profile.layers.inferred,
        ai_model: insight
      }
    },
    cognitive_model: {
      ...profile.cognitive_model,
      processing_patterns: {
        ...profile.cognitive_model.processing_patterns,
        provider_summary: insight.summary
      }
    },
    behavioral_model: {
      ...profile.behavioral_model,
      motivation_model: {
        ...profile.behavioral_model.motivation_model,
        provider_caveats: insight.caveats
      }
    },
    metadata: {
      ...profile.metadata,
      confidence: clampConfidence((profile.metadata.confidence + insight.overall_confidence) / 2)
    }
  };
}

export function deriveInferredProfile(profile: PsonProfile): PsonProfile {
  const coreTraits = buildDomainTraits(profile, "core", {
    core_problem_solving_style: "problem_solving_style",
    core_learning_mode: "learning_mode",
    core_explanation_preference: "explanation_preference",
    core_task_start_pattern: "task_start_pattern",
    core_deadline_effect: "deadline_effect"
  });

  const educationTraits = buildDomainTraits(profile, "education", {
    edu_study_start_pattern: "study_start_pattern",
    edu_revision_style: "revision_style",
    edu_focus_barrier: "focus_barrier"
  });

  const productivityTraits = buildDomainTraits(profile, "productivity", {
    prod_best_time_of_day: "best_time_of_day",
    prod_planning_style: "planning_style",
    prod_main_distraction: "main_distraction"
  });

  const allTraits = [...coreTraits, ...educationTraits, ...productivityTraits];
  const heuristics = buildHeuristics(profile);
  const contradictionSignals =
    coreTraits.some((trait) => trait.key === "task_start_pattern" && trait.value === "start_immediately") &&
    educationTraits.some((trait) => trait.key === "study_start_pattern" && trait.value === "last_minute")
      ? [
          {
            id: "contextual_start_pattern_split",
            description: "General task initiation and exam-study initiation currently point to different patterns.",
            status: "needs_more_context"
          }
        ]
      : [];

  const metadataConfidence = averageConfidence(allTraits, heuristics);

  return {
    ...profile,
    layers: {
      ...profile.layers,
      inferred: {
        ...profile.layers.inferred,
        core: {
          traits: coreTraits
        },
        education: {
          traits: educationTraits
        },
        productivity: {
          traits: productivityTraits
        },
        heuristics,
        contradictions: contradictionSignals,
        last_modeled_at: new Date().toISOString()
      }
    },
    cognitive_model: {
      ...profile.cognitive_model,
      thinking_style: {
        ...profile.cognitive_model.thinking_style,
        problem_solving_style: coreTraits.find((trait) => trait.key === "problem_solving_style")?.value ?? null
      },
      learning_style: {
        ...profile.cognitive_model.learning_style,
        primary_mode: coreTraits.find((trait) => trait.key === "learning_mode")?.value ?? null,
        explanation_preference:
          coreTraits.find((trait) => trait.key === "explanation_preference")?.value ?? null
      }
    },
    behavioral_model: {
      ...profile.behavioral_model,
      decision_functions: heuristics,
      action_patterns: [
        ...coreTraits.filter((trait) => trait.key === "task_start_pattern"),
        ...educationTraits.filter((trait) => trait.key === "study_start_pattern")
      ],
      motivation_model: {
        ...profile.behavioral_model.motivation_model,
        deadline_effect: coreTraits.find((trait) => trait.key === "deadline_effect")?.value ?? null
      }
    },
    metadata: {
      ...profile.metadata,
      confidence: metadataConfidence
    }
  };
}

export async function deriveInferredProfileWithProvider(
  profile: PsonProfile,
  options?: ProfileStoreOptions
): Promise<PsonProfile> {
  const ruleProfile = deriveInferredProfile(profile);
  const providerInsight = await deriveProviderModelingInsight(ruleProfile, options);
  return providerInsight ? applyProviderInsight(ruleProfile, providerInsight) : ruleProfile;
}

export function getModeledFieldPaths(profile: PsonProfile): string[] {
  const inferred = asRecord(profile.layers.inferred);
  const paths = ["layers.inferred", "cognitive_model", "behavioral_model", "metadata.confidence"];

  if (asRecord(inferred?.core)?.traits) {
    paths.push("layers.inferred.core.traits");
  }
  if (asRecord(inferred?.education)?.traits) {
    paths.push("layers.inferred.education.traits");
  }
  if (asRecord(inferred?.productivity)?.traits) {
    paths.push("layers.inferred.productivity.traits");
  }
  if (Array.isArray(inferred?.heuristics)) {
    paths.push("layers.inferred.heuristics");
  }
  if (asRecord(inferred?.ai_model)) {
    paths.push("layers.inferred.ai_model");
    paths.push("cognitive_model.processing_patterns.provider_summary");
  }

  return paths;
}

export const modelingEngineStatus = {
  phase: "implemented",
  next_step: "Expand contradiction handling, decay recalculation, and richer cross-domain heuristic extraction."
} as const;
