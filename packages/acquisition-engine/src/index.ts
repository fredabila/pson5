import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DomainModuleDefinition,
  LearnRequest,
  LearnResult,
  LearningSessionResult,
  LearningSessionState,
  ObservedAnswerRecord,
  ProfileStoreOptions,
  PsonDepth,
  PsonProfile,
  QuestionDefinition
} from "@pson5/core-types";
import { deriveKnowledgeGraph } from "@pson5/graph-engine";
import { deriveInferredProfileWithProvider, getModeledFieldPaths } from "@pson5/modeling-engine";
import { normalizeAnswerWithProvider } from "@pson5/provider-engine";
import { ProfileStoreError, loadProfile, resolveStoreRoot, saveProfile } from "@pson5/serialization-engine";
import { deriveStateProfile } from "@pson5/state-engine";

const DEPTH_ORDER: Record<PsonDepth, number> = {
  light: 0,
  standard: 1,
  deep: 2
};

const SESSION_DIRNAME = "sessions";
const ANSWER_PARSER_ID = "built_in_rule_v1";
const DOMAIN_CONFIG_DIR = "config";
const DOMAIN_CONFIG_FILE = "domains.json";

const BUILT_IN_QUESTIONS: QuestionDefinition[] = [
  {
    id: "core_problem_solving_style",
    domain: "core",
    prompt: "When solving a problem, do you prefer to plan first or figure it out as you go?",
    type: "single_choice",
    depth: "light",
    sensitivity: "low",
    information_targets: ["problem_solving_style"],
    follow_up_rules: [],
    choices: [
      { value: "plan_first", label: "Plan first" },
      { value: "figure_it_out", label: "Figure it out as I go" }
    ]
  },
  {
    id: "core_learning_mode",
    domain: "core",
    prompt: "Do you learn better by reading, watching, or doing?",
    type: "single_choice",
    depth: "light",
    sensitivity: "low",
    information_targets: ["learning_mode"],
    follow_up_rules: [],
    choices: [
      { value: "reading", label: "Reading" },
      { value: "watching", label: "Watching" },
      { value: "doing", label: "Doing" }
    ]
  },
  {
    id: "core_explanation_preference",
    domain: "core",
    prompt: "Do you prefer quick summaries or deep explanations?",
    type: "single_choice",
    depth: "standard",
    sensitivity: "low",
    information_targets: ["explanation_preference"],
    follow_up_rules: [],
    choices: [
      { value: "summary", label: "Quick summaries" },
      { value: "deep", label: "Deep explanations" }
    ]
  },
  {
    id: "core_task_start_pattern",
    domain: "core",
    prompt: "When you have a task, do you start immediately or delay?",
    type: "single_choice",
    depth: "standard",
    sensitivity: "low",
    information_targets: ["task_start_pattern"],
    follow_up_rules: [],
    choices: [
      { value: "start_immediately", label: "Start immediately" },
      { value: "delay_start", label: "Delay" }
    ]
  },
  {
    id: "core_deadline_effect",
    domain: "core",
    prompt: "Do deadlines help you focus, stress you, or both?",
    type: "single_choice",
    depth: "deep",
    sensitivity: "low",
    information_targets: ["deadline_effect"],
    follow_up_rules: [],
    choices: [
      { value: "helps_focus", label: "Helps me focus" },
      { value: "causes_stress", label: "Stresses me" },
      { value: "mixed", label: "Both" }
    ]
  },
  {
    id: "edu_study_start_pattern",
    domain: "education",
    prompt: "How do you usually start studying for an important exam?",
    type: "single_choice",
    depth: "light",
    sensitivity: "standard",
    information_targets: ["study_start_pattern"],
    follow_up_rules: [],
    choices: [
      { value: "early", label: "Start early" },
      { value: "steady", label: "Study steadily" },
      { value: "last_minute", label: "Mostly last minute" }
    ]
  },
  {
    id: "edu_revision_style",
    domain: "education",
    prompt: "After learning something new, do you revise it or move on?",
    type: "single_choice",
    depth: "standard",
    sensitivity: "standard",
    information_targets: ["revision_style"],
    follow_up_rules: [],
    choices: [
      { value: "revise", label: "Revise it" },
      { value: "move_on", label: "Move on" }
    ]
  },
  {
    id: "edu_focus_barrier",
    domain: "education",
    prompt: "What most often breaks your focus during study sessions?",
    type: "free_text",
    depth: "deep",
    sensitivity: "standard",
    information_targets: ["focus_barrier"],
    follow_up_rules: []
  },
  {
    id: "prod_best_time_of_day",
    domain: "productivity",
    prompt: "What time of day are you usually most productive?",
    type: "single_choice",
    depth: "light",
    sensitivity: "standard",
    information_targets: ["best_time_of_day"],
    follow_up_rules: [],
    choices: [
      { value: "morning", label: "Morning" },
      { value: "afternoon", label: "Afternoon" },
      { value: "night", label: "Night" }
    ]
  },
  {
    id: "prod_planning_style",
    domain: "productivity",
    prompt: "Do you prefer structured plans or flexible task lists?",
    type: "single_choice",
    depth: "standard",
    sensitivity: "standard",
    information_targets: ["planning_style"],
    follow_up_rules: [],
    choices: [
      { value: "structured", label: "Structured plans" },
      { value: "flexible", label: "Flexible tasks" }
    ]
  },
  {
    id: "prod_main_distraction",
    domain: "productivity",
    prompt: "What distracts you most when trying to get work done?",
    type: "free_text",
    depth: "deep",
    sensitivity: "standard",
    information_targets: ["main_distraction"],
    follow_up_rules: []
  }
];

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function createSessionId(now = new Date()): string {
  return `learn_${now.getTime()}`;
}

function supportsDepth(questionDepth: PsonDepth, requestedDepth: PsonDepth): boolean {
  return DEPTH_ORDER[questionDepth] <= DEPTH_ORDER[requestedDepth];
}

function getSessionsRoot(rootDir: string): string {
  return path.join(rootDir, SESSION_DIRNAME);
}

function getDomainConfigPath(rootDir: string): string {
  return path.join(rootDir, DOMAIN_CONFIG_DIR, DOMAIN_CONFIG_FILE);
}

function getSessionPath(sessionId: string, rootDir: string): string {
  return path.join(getSessionsRoot(rootDir), `${sessionId}.json`);
}

async function saveSession(session: LearningSessionState, options?: ProfileStoreOptions): Promise<LearningSessionState> {
  const rootDir = resolveStoreRoot(options);
  await mkdir(getSessionsRoot(rootDir), { recursive: true });
  await writeFile(getSessionPath(session.session_id, rootDir), `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return session;
}

async function loadSession(sessionId: string, options?: ProfileStoreOptions): Promise<LearningSessionState> {
  const rootDir = resolveStoreRoot(options);

  try {
    const raw = await readFile(getSessionPath(sessionId, rootDir), "utf8");
    return JSON.parse(raw) as LearningSessionState;
  } catch {
    throw new ProfileStoreError("profile_not_found", `Learning session '${sessionId}' was not found.`);
  }
}

function parseDomainModules(value: unknown): DomainModuleDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const modules: DomainModuleDefinition[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const version = typeof record.version === "string" ? record.version.trim() : "";
    const description = typeof record.description === "string" ? record.description : undefined;
    const questions = Array.isArray(record.questions)
      ? record.questions.filter(
          (question): question is QuestionDefinition =>
            typeof question === "object" &&
            question !== null &&
            !Array.isArray(question) &&
            typeof (question as QuestionDefinition).id === "string" &&
            typeof (question as QuestionDefinition).domain === "string" &&
            typeof (question as QuestionDefinition).prompt === "string" &&
            typeof (question as QuestionDefinition).type === "string" &&
            typeof (question as QuestionDefinition).depth === "string" &&
            typeof (question as QuestionDefinition).sensitivity === "string" &&
            Array.isArray((question as QuestionDefinition).information_targets) &&
            Array.isArray((question as QuestionDefinition).follow_up_rules)
        )
      : [];

    if (!id || !version || questions.length === 0) {
      continue;
    }

    modules.push({
      id,
      version,
      description,
      questions
    });
  }

  return modules;
}

async function loadConfiguredDomainModules(options?: ProfileStoreOptions): Promise<DomainModuleDefinition[]> {
  const rootDir = resolveStoreRoot(options);

  try {
    const raw = await readFile(getDomainConfigPath(rootDir), "utf8");
    return parseDomainModules(JSON.parse(raw));
  } catch {
    return [];
  }
}

function getObservedAnswerIds(profile: PsonProfile): Set<string> {
  const observedAnswerIds = new Set<string>();

  for (const value of Object.values(profile.layers.observed)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }

    const answers = (value as { answers?: Record<string, unknown> }).answers ?? {};
    for (const questionId of Object.keys(answers)) {
      observedAnswerIds.add(questionId);
    }
  }

  return observedAnswerIds;
}

function findQuestion(questionId: string, registry: QuestionDefinition[]): QuestionDefinition | undefined {
  return registry.find((question) => question.id === questionId);
}

function getEffectiveDomains(profile: PsonProfile, domains?: string[]): string[] {
  return domains && domains.length > 0 ? domains : profile.domains.active;
}

function getEffectiveDepth(profile: PsonProfile, depth?: PsonDepth): PsonDepth {
  return depth ?? profile.domains.depth;
}

function normalizeFreeformChoice(question: QuestionDefinition, rawValue: string): string | null {
  const normalized = rawValue.trim().toLowerCase();
  const choices = question.choices ?? [];

  const exactValue = choices.find((choice) => choice.value.toLowerCase() === normalized);
  if (exactValue) {
    return exactValue.value;
  }

  const exactLabel = choices.find((choice) => choice.label.toLowerCase() === normalized);
  if (exactLabel) {
    return exactLabel.value;
  }

  const compactValue = normalized.replace(/[_\s-]+/g, "");
  const compactMatch = choices.find(
    (choice) =>
      choice.value.toLowerCase().replace(/[_\s-]+/g, "") === compactValue ||
      choice.label.toLowerCase().replace(/[_\s-]+/g, "") === compactValue
  );
  if (compactMatch) {
    return compactMatch.value;
  }

  const partialMatch = choices.find(
    (choice) => normalized.includes(choice.label.toLowerCase()) || normalized.includes(choice.value.toLowerCase())
  );
  return partialMatch?.value ?? null;
}

async function normalizeAnswerValue(
  profile: PsonProfile,
  question: QuestionDefinition,
  value: string | number | boolean | string[],
  options?: ProfileStoreOptions
): Promise<{ normalized_value: unknown; parser: string }> {
  if (question.type === "single_choice") {
    if (typeof value !== "string") {
      throw new ProfileStoreError("validation_error", `Question '${question.id}' expects a string choice.`);
    }

    const localMatch = normalizeFreeformChoice(question, value);
    if (localMatch) {
      return {
        normalized_value: localMatch,
        parser: localMatch === value ? ANSWER_PARSER_ID : "built_in_flexible_choice_v1"
      };
    }

    const providerMatch = await normalizeAnswerWithProvider(profile, question, value, { rootDir: options?.rootDir });
    if (providerMatch?.normalized_value) {
      return {
        normalized_value: providerMatch.normalized_value,
        parser: "provider_choice_normalizer_v1"
      };
    }

    throw new ProfileStoreError("validation_error", `Invalid choice '${value}' for question '${question.id}'.`);
  }

  if (typeof value === "string") {
    return {
      normalized_value: value.trim(),
      parser: ANSWER_PARSER_ID
    };
  }

  return {
    normalized_value: value,
    parser: ANSWER_PARSER_ID
  };
}

async function buildObservedAnswerRecord(
  profile: PsonProfile,
  question: QuestionDefinition,
  value: string | number | boolean | string[],
  options?: ProfileStoreOptions,
  now = new Date()
): Promise<ObservedAnswerRecord> {
  const recordedAt = nowIso(now);
  const normalized = await normalizeAnswerValue(profile, question, value, options);

  return {
    source_id: `answer_${now.getTime()}_${question.id}`,
    question_id: question.id,
    domain: question.domain,
    prompt: question.prompt,
    raw_value: value,
    normalized_value: normalized.normalized_value,
    information_targets: question.information_targets,
    recorded_at: recordedAt,
    parser: normalized.parser
  };
}

function writeObservedAnswer(profile: PsonProfile, record: ObservedAnswerRecord): PsonProfile {
  const existingDomain =
    typeof profile.layers.observed[record.domain] === "object" &&
    profile.layers.observed[record.domain] !== null &&
    !Array.isArray(profile.layers.observed[record.domain])
      ? (profile.layers.observed[record.domain] as Record<string, unknown>)
      : {};

  const existingAnswers =
    typeof existingDomain.answers === "object" && existingDomain.answers !== null && !Array.isArray(existingDomain.answers)
      ? (existingDomain.answers as Record<string, unknown>)
      : {};

  const existingFacts =
    typeof existingDomain.facts === "object" && existingDomain.facts !== null && !Array.isArray(existingDomain.facts)
      ? (existingDomain.facts as Record<string, unknown>)
      : {};

  const nextFacts = { ...existingFacts };
  for (const target of record.information_targets) {
    nextFacts[target] = record.normalized_value;
  }

  return {
    ...profile,
    layers: {
      ...profile.layers,
      observed: {
        ...profile.layers.observed,
        [record.domain]: {
          ...existingDomain,
          answers: {
            ...existingAnswers,
            [record.question_id]: record
          },
          facts: nextFacts,
          last_updated_at: record.recorded_at
        }
      }
    }
  };
}

function reviseProfile(profile: PsonProfile, answerCount: number, now = new Date()): PsonProfile {
  return {
    ...profile,
    metadata: {
      ...profile.metadata,
      revision: profile.metadata.revision + 1,
      updated_at: nowIso(now),
      source_count: profile.metadata.source_count + answerCount
    }
  };
}

function mergeQuestionRegistry(modules: DomainModuleDefinition[]): QuestionDefinition[] {
  const merged = new Map<string, QuestionDefinition>();

  BUILT_IN_QUESTIONS.forEach((question) => {
    merged.set(question.id, question);
  });

  modules.forEach((moduleDefinition) => {
    moduleDefinition.questions.forEach((question) => {
      merged.set(question.id, question);
    });
  });

  return [...merged.values()];
}

export function getBuiltInQuestionRegistry(): QuestionDefinition[] {
  return [...BUILT_IN_QUESTIONS];
}

export async function getQuestionRegistry(options?: ProfileStoreOptions): Promise<QuestionDefinition[]> {
  const modules = await loadConfiguredDomainModules(options);
  return mergeQuestionRegistry(modules);
}

export async function listDomainModules(options?: ProfileStoreOptions): Promise<DomainModuleDefinition[]> {
  return loadConfiguredDomainModules(options);
}

export async function saveDomainModules(
  modules: DomainModuleDefinition[],
  options?: ProfileStoreOptions
): Promise<{ path: string; count: number }> {
  const rootDir = resolveStoreRoot(options);
  const configPath = getDomainConfigPath(rootDir);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(modules, null, 2)}\n`, "utf8");
  return {
    path: configPath,
    count: modules.length
  };
}

export function getQuestionsForDomains(
  registry: QuestionDefinition[],
  domains: string[],
  depth: PsonDepth
): QuestionDefinition[] {
  return registry.filter(
    (question) => domains.includes(question.domain) && supportsDepth(question.depth, depth)
  );
}

export async function getNextQuestions(
  profileId: string,
  input: {
    session_id?: string;
    domains?: string[];
    depth?: PsonDepth;
    limit?: number;
  },
  options?: ProfileStoreOptions
): Promise<LearningSessionResult> {
  const profile = await loadProfile(profileId, options);
  const registry = await getQuestionRegistry(options);
  const session =
    input.session_id !== undefined
      ? await loadSession(input.session_id, options)
      : {
          session_id: createSessionId(),
          profile_id: profile.profile_id,
          domains: getEffectiveDomains(profile, input.domains),
          depth: getEffectiveDepth(profile, input.depth),
          asked_question_ids: [],
          answered_question_ids: [],
          status: "active",
          created_at: nowIso(),
          updated_at: nowIso()
        };

  const seenQuestionIds = new Set<string>([...session.asked_question_ids, ...session.answered_question_ids]);
  for (const questionId of getObservedAnswerIds(profile)) {
    seenQuestionIds.add(questionId);
  }

  const candidates = getQuestionsForDomains(registry, session.domains, session.depth).filter(
    (question) => !seenQuestionIds.has(question.id)
  );

  const selectedQuestions = candidates.slice(0, input.limit ?? 1);
  const nextSession: LearningSessionState = {
    ...session,
    asked_question_ids: [...session.asked_question_ids, ...selectedQuestions.map((question) => question.id)],
    updated_at: nowIso(),
    status: selectedQuestions.length === 0 ? "completed" : "active"
  };

  await saveSession(nextSession, options);

  return {
    session: nextSession,
    questions: selectedQuestions
  };
}

export async function submitLearningAnswers(
  input: LearnRequest,
  options?: ProfileStoreOptions
): Promise<LearnResult> {
  const profile = await loadProfile(input.profile_id, options);
  const registry = await getQuestionRegistry(options);
  const sessionResult = await getNextQuestions(
    input.profile_id,
    {
      session_id: input.session_id,
      domains: input.domains,
      depth: input.depth,
      limit: 0
    },
    options
  );

  let nextProfile = profile;
  const updatedFields = new Set<string>();
  const answeredQuestionIds: string[] = [];

  for (const answer of input.answers) {
    const question = findQuestion(answer.question_id, registry);
    if (!question) {
      throw new ProfileStoreError("validation_error", `Unknown question '${answer.question_id}'.`);
    }

    if (!sessionResult.session.domains.includes(question.domain)) {
      throw new ProfileStoreError(
        "validation_error",
        `Question '${answer.question_id}' is outside the active session domains.`
      );
    }

    const record = await buildObservedAnswerRecord(nextProfile, question, answer.value, options);
    nextProfile = writeObservedAnswer(nextProfile, record);
    updatedFields.add(`layers.observed.${question.domain}.answers.${question.id}`);
    updatedFields.add(`layers.observed.${question.domain}.facts`);
    answeredQuestionIds.push(question.id);
  }

  const modeledProfile = await deriveInferredProfileWithProvider(nextProfile, options);
  const statefulProfile = deriveStateProfile(modeledProfile);
  const graphedProfile = deriveKnowledgeGraph(statefulProfile);
  const revisedProfile = reviseProfile(graphedProfile, input.answers.length);
  const savedProfile = await saveProfile(revisedProfile, options);
  for (const fieldPath of getModeledFieldPaths(savedProfile)) {
    updatedFields.add(fieldPath);
  }
  updatedFields.add("state_model");
  updatedFields.add("knowledge_graph");

  const updatedSession: LearningSessionState = {
    ...sessionResult.session,
    answered_question_ids: Array.from(
      new Set([...sessionResult.session.answered_question_ids, ...answeredQuestionIds])
    ),
    updated_at: nowIso()
  };
  await saveSession(updatedSession, options);

  const nextQuestions = input.options?.return_next_questions
    ? (
        await getNextQuestions(
          input.profile_id,
          {
            session_id: updatedSession.session_id,
            limit: input.options.next_question_limit ?? 1
          },
          options
        )
      ).questions
    : [];

  return {
    session: updatedSession,
    profile: savedProfile,
    updated_fields: Array.from(updatedFields),
    next_questions: nextQuestions
  };
}

export const acquisitionEngineStatus = {
  phase: "implemented",
  next_step: "Add adaptive information-gain scoring and contradiction/fatigue handling."
} as const;
