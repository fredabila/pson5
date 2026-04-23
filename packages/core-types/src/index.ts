export type PsonDepth = "light" | "standard" | "deep";
export type AccessLevel = "public" | "private" | "restricted";
export type ConfidenceMethod = "rule" | "statistical" | "hybrid";
export type QuestionType = "single_choice" | "free_text" | "scenario";
export type QuestionSensitivity = "low" | "standard" | "restricted";
/**
 * Name of a provider adapter. The built-in adapters are `"openai"`,
 * `"anthropic"`, and `"openai-compatible"`, but any string accepted by the
 * provider-engine registry is valid — custom adapters registered via
 * `registerProviderAdapter(...)` can carry their own name.
 */
export type AiProviderName = string;

/** Names of the adapters shipped with @pson5/provider-engine. */
export type BuiltInProviderName = "openai" | "anthropic" | "openai-compatible";
export type ProviderOperation = "modeling" | "simulation";
export type ExportRedactionLevel = "full" | "safe";
export type ProviderConfigSource = "env" | "file" | "none";
export type AgentContextSource = "observed" | "inferred" | "simulation";
export type AgentContextCategory =
  | "preferences"
  | "communication_style"
  | "behavioral_patterns"
  | "learning_profile"
  | "current_state"
  | "predictions";
export type EvidenceSourceType =
  | "answer"
  | "event"
  | "correction"
  | "import"
  | "simulation_feedback"
  | "ai_modeling";

export interface ConsentRecord {
  granted: boolean;
  scopes: string[];
  policy_version: string;
  updated_at: string;
}

export interface DomainConfig {
  active: string[];
  depth: PsonDepth;
}

export interface EvidenceReference {
  source_type: EvidenceSourceType;
  source_id: string;
  recorded_at: string;
  weight: number;
}

export interface ConfidenceRecord {
  score: number;
  method: ConfidenceMethod;
  last_validated_at: string;
  decay_policy: {
    kind: "time_decay";
    half_life_days: number;
  };
  evidence: EvidenceReference[];
}

export interface AccessTag {
  level: AccessLevel;
  scope: string;
  reason: string;
}

export interface StateDefinition {
  id: string;
  label: string;
  triggers: string[];
  behavior_shifts: string[];
  duration_tendency?: string;
  recovery_signals?: string[];
  confidence?: ConfidenceRecord;
}

export interface StateTransition {
  from: string;
  to: string;
  triggers: string[];
  likelihood: number;
  duration_window?: string;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface ScenarioRecord {
  id: string;
  context: Record<string, unknown>;
  prediction: string;
  confidence: number;
  created_at: string;
  profile_revision: number;
}

export interface PrivacyConfig {
  encryption: boolean;
  access_levels: Record<string, AccessTag>;
  local_only: boolean;
  restricted_fields: string[];
}

export interface PsonMetadata {
  confidence: number;
  created_at: string;
  updated_at: string;
  source_count: number;
  revision: number;
}

export interface PsonProfile {
  pson_version: string;
  profile_id: string;
  user_id: string;
  tenant_id?: string;
  consent: ConsentRecord;
  domains: DomainConfig;
  layers: {
    observed: Record<string, unknown>;
    inferred: Record<string, unknown>;
    simulated: Record<string, unknown>;
  };
  cognitive_model: {
    thinking_style: Record<string, unknown>;
    learning_style: Record<string, unknown>;
    processing_patterns: Record<string, unknown>;
  };
  behavioral_model: {
    decision_functions: unknown[];
    action_patterns: unknown[];
    motivation_model: Record<string, unknown>;
  };
  state_model: {
    states: StateDefinition[];
    transitions: StateTransition[];
  };
  knowledge_graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  simulation_profiles: {
    scenarios: ScenarioRecord[];
    domains: Record<string, unknown>;
  };
  privacy: PrivacyConfig;
  metadata: PsonMetadata;
}

export interface InitProfileInput {
  user_id: string;
  tenant_id?: string;
  domains?: string[];
  depth?: PsonDepth;
  consent?: Partial<ConsentRecord>;
  privacy?: Partial<PrivacyConfig> & {
    allow_sensitive?: boolean;
  };
}

export interface QuestionChoice {
  value: string;
  label: string;
}

export interface QuestionDefinition {
  id: string;
  domain: string;
  prompt: string;
  type: QuestionType;
  depth: PsonDepth;
  sensitivity: QuestionSensitivity;
  information_targets: string[];
  follow_up_rules: string[];
  choices?: QuestionChoice[];
  generated_by?: "registry" | "provider";
  answer_style_hint?: string;
  source_question_id?: string;
  generation_rationale?: string;
}

export interface DomainModuleDefinition {
  id: string;
  version: string;
  description?: string;
  questions: QuestionDefinition[];
}

export interface LearningSessionState {
  session_id: string;
  profile_id: string;
  domains: string[];
  depth: PsonDepth;
  asked_question_ids: string[];
  answered_question_ids: string[];
  generated_questions?: QuestionDefinition[];
  contradiction_flags?: Array<{
    target: string;
    previous_value: unknown;
    incoming_value: unknown;
    question_id: string;
    detected_at: string;
  }>;
  confidence_gaps?: string[];
  fatigue_score?: number;
  stop_reason?: string | null;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
}

export interface LearningSessionResult {
  session: LearningSessionState;
  questions: QuestionDefinition[];
}

export interface AnswerSubmission {
  question_id: string;
  value: string | number | boolean | string[];
  domain?: string;
}

export interface ObservedAnswerRecord {
  source_id: string;
  question_id: string;
  source_question_id?: string;
  domain: string;
  prompt: string;
  raw_value: string | number | boolean | string[];
  normalized_value: unknown;
  information_targets: string[];
  recorded_at: string;
  parser: string;
}

export interface InferredTraitRecord {
  key: string;
  value: unknown;
  confidence: ConfidenceRecord;
  domain: string;
  source_question_ids: string[];
}

export interface HeuristicRecord {
  id: string;
  domain: string;
  description: string;
  when: Record<string, unknown>;
  outcome: string;
  confidence: ConfidenceRecord;
}

export interface LearnRequest {
  profile_id: string;
  session_id?: string;
  domains?: string[];
  depth?: PsonDepth;
  domain?: string;
  answers: AnswerSubmission[];
  options?: {
    return_next_questions?: boolean;
    next_question_limit?: number;
  };
}

export interface LearnResult {
  session: LearningSessionState;
  profile: PsonProfile;
  updated_fields: string[];
  next_questions: QuestionDefinition[];
}

export interface ProfileStoreOptions {
  rootDir?: string;
  adapter?: ProfileStoreAdapter;
}

export interface ProfileStoreAdapter {
  kind: string;
  saveProfile(profile: PsonProfile, options?: ProfileStoreOptions): Promise<PsonProfile>;
  loadProfile(profileId: string, options?: ProfileStoreOptions): Promise<PsonProfile>;
  profileExists(profileId: string, options?: ProfileStoreOptions): Promise<boolean>;
  listProfileRevisions(profileId: string, options?: ProfileStoreOptions): Promise<number[]>;
  findProfilesByUserId(userId: string, options?: ProfileStoreOptions): Promise<string[]>;
  loadProfileByUserId(userId: string, options?: ProfileStoreOptions): Promise<PsonProfile>;
}

export interface ImportProfileOptions extends ProfileStoreOptions {
  overwrite?: boolean;
}

export interface ExportProfileOptions extends ProfileStoreOptions {
  redaction_level?: ExportRedactionLevel;
}

export interface AiProviderConfig {
  provider: AiProviderName | null;
  enabled: boolean;
  model: string | null;
  base_url?: string;
  timeout_ms?: number;
}

export interface StoredAiProviderConfig extends AiProviderConfig {
  api_key?: string;
}

export interface AiProviderStatus extends AiProviderConfig {
  configured: boolean;
  reason?: string;
  capabilities: string[];
  source?: ProviderConfigSource;
}

export interface Neo4jConfig {
  uri: string | null;
  username: string | null;
  password?: string;
  database?: string | null;
  enabled: boolean;
}

export interface Neo4jStoredConfigStatus extends Neo4jConfig {
  path: string;
  configured: boolean;
  has_password: boolean;
  source: "env" | "file" | "none";
}

export interface Neo4jStatus {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  uri: string | null;
  database: string | null;
  username: string | null;
  source: "env" | "file" | "none";
  reason?: string;
  server_agent?: string;
  server_protocol_version?: string;
}

export interface Neo4jSyncResult {
  profile_id: string;
  user_id: string;
  node_count: number;
  edge_count: number;
  uri: string | null;
  database: string | null;
  synced_at: string;
}

export interface ProviderPolicyDecision {
  allowed: boolean;
  operation: ProviderOperation;
  reason?: string;
  required_scopes: string[];
  missing_scopes: string[];
  redacted_fields: string[];
}

export interface AiTraitCandidate {
  key: string;
  domain: string;
  value: string;
  confidence: number;
  rationale: string;
}

export interface AiHeuristicCandidate {
  id: string;
  domain: string;
  description: string;
  outcome: string;
  confidence: number;
}

export interface AiModelingInsight {
  provider: AiProviderName;
  model: string;
  generated_at: string;
  summary: string;
  trait_candidates: AiTraitCandidate[];
  heuristic_candidates: AiHeuristicCandidate[];
  caveats: string[];
  overall_confidence: number;
}

export interface AiSimulationInsight {
  provider: AiProviderName;
  model: string;
  generated_at: string;
  prediction: string;
  confidence: number;
  reasoning: string[];
  caveats: string[];
  alternatives: string[];
}

export interface AgentContextEntry {
  key: string;
  value: unknown;
  domain: string;
  category: AgentContextCategory;
  source: AgentContextSource;
  confidence: number;
  relevance: number;
  rationale: string;
}

export interface AgentContextConstraints {
  restricted_fields: string[];
  local_only: boolean;
  allowed_for_agent: string[];
}

export interface AgentReasoningPolicy {
  treat_as_fact: string[];
  treat_as_inference: string[];
  treat_as_prediction: string[];
}

export type AgentContextRedactionReason =
  | "restricted_field"
  | "low_confidence"
  | "consent_not_granted"
  | "local_only";

export interface AgentContextRedactionNote {
  path: string;
  reason: AgentContextRedactionReason;
  category?: AgentContextCategory;
  detail?: string;
}

export interface AgentContextOptions {
  intent: string;
  domains?: string[];
  max_items?: number;
  include_predictions?: boolean;
  min_confidence?: number;
  task_context?: Record<string, unknown>;
}

export interface PsonAgentContext {
  profile_id: string;
  pson_version: string;
  context_version: "1.0";
  intent: string;
  generated_at: string;
  personal_data: {
    preferences: AgentContextEntry[];
    communication_style: AgentContextEntry[];
    behavioral_patterns: AgentContextEntry[];
    learning_profile: AgentContextEntry[];
    current_state: AgentContextEntry[];
    predictions: AgentContextEntry[];
  };
  constraints: AgentContextConstraints;
  reasoning_policy: AgentReasoningPolicy;
  redaction_notes?: AgentContextRedactionNote[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  issues: ValidationIssue[];
  value?: T;
}
