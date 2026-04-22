import type {
  AgentContextOptions,
  AiProviderName,
  DomainModuleDefinition,
  ExportProfileOptions,
  LearnRequest,
  LearnResult,
  ImportProfileOptions,
  InitProfileInput,
  LearningSessionResult,
  ProfileStoreOptions,
  PsonProfile,
  ValidationResult
} from "@pson5/core-types";
import {
  getBuiltInQuestionRegistry,
  getNextQuestions,
  getQuestionRegistry,
  listDomainModules,
  saveDomainModules,
  submitLearningAnswers
} from "@pson5/acquisition-engine";
import { buildAgentContext, buildStoredAgentContext } from "@pson5/agent-context";
import { explainPredictionSupport } from "@pson5/graph-engine";
import {
  clearStoredProviderConfig,
  getProviderPolicyStatus,
  getProviderStatusFromEnv,
  getStoredProviderConfig,
  saveProviderConfig
} from "@pson5/provider-engine";
import {
  createEmptyProfile,
  exportProfile,
  exportStoredProfile,
  findProfilesByUserId,
  importProfileDocument,
  initProfile,
  loadProfile,
  loadProfileByUserId,
  validateProfile
} from "@pson5/serialization-engine";
import { simulateStoredProfile, type SimulationRequest, type SimulationResponse } from "@pson5/simulation-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

export class PsonClient {
  public getQuestionRegistry() {
    return getBuiltInQuestionRegistry();
  }

  public async getResolvedQuestionRegistry(options?: ProfileStoreOptions) {
    return getQuestionRegistry(options);
  }

  public async listDomainModules(options?: ProfileStoreOptions) {
    return listDomainModules(options);
  }

  public async saveDomainModules(modules: DomainModuleDefinition[], options?: ProfileStoreOptions) {
    return saveDomainModules(modules, options);
  }

  public createProfile(input: InitProfileInput): PsonProfile {
    return createEmptyProfile(input);
  }

  public async createAndSaveProfile(input: InitProfileInput, options?: ProfileStoreOptions): Promise<PsonProfile> {
    return initProfile(input, options);
  }

  public async loadProfile(profileId: string, options?: ProfileStoreOptions): Promise<PsonProfile> {
    return loadProfile(profileId, options);
  }

  public async loadProfileByUserId(userId: string, options?: ProfileStoreOptions): Promise<PsonProfile> {
    return loadProfileByUserId(userId, options);
  }

  public async findProfilesByUserId(userId: string, options?: ProfileStoreOptions): Promise<string[]> {
    return findProfilesByUserId(userId, options);
  }

  public async import(document: unknown, options?: ImportProfileOptions): Promise<PsonProfile> {
    return importProfileDocument(document, options);
  }

  public async getNextQuestions(
    profileId: string,
    input: {
      session_id?: string;
      domains?: string[];
      depth?: "light" | "standard" | "deep";
      limit?: number;
    },
    options?: ProfileStoreOptions
  ): Promise<LearningSessionResult> {
    return getNextQuestions(profileId, input, options);
  }

  public async learn(input: LearnRequest, options?: ProfileStoreOptions): Promise<LearnResult> {
    return submitLearningAnswers(input, options);
  }

  public async simulate(request: SimulationRequest, options?: ProfileStoreOptions): Promise<SimulationResponse> {
    return simulateStoredProfile(request, options);
  }

  public async getGraphSupport(profileId: string, prediction: string, options?: ProfileStoreOptions): Promise<string[]> {
    const profile = await loadProfile(profileId, options);
    return explainPredictionSupport(profile, prediction);
  }

  public async getStateSnapshot(profileId: string, options?: ProfileStoreOptions) {
    const profile = await loadProfile(profileId, options);
    return getActiveStateSnapshot(profile);
  }

  public buildAgentContext(profile: PsonProfile, options: AgentContextOptions) {
    return buildAgentContext(profile, options);
  }

  public async getAgentContext(
    profileId: string,
    options: AgentContextOptions,
    storeOptions?: ProfileStoreOptions
  ) {
    return buildStoredAgentContext(profileId, options, storeOptions);
  }

  public getProviderStatus(options?: ProfileStoreOptions) {
    return getProviderStatusFromEnv(options);
  }

  public getStoredProviderConfig(options?: ProfileStoreOptions) {
    return getStoredProviderConfig(options);
  }

  public async configureProvider(
    input: {
      provider: AiProviderName;
      api_key: string;
      model?: string;
      base_url?: string;
      timeout_ms?: number;
      enabled?: boolean;
    },
    options?: ProfileStoreOptions
  ) {
    return saveProviderConfig(
      {
        provider: input.provider,
        api_key: input.api_key,
        model: input.model ?? null,
        base_url: input.base_url,
        timeout_ms: input.timeout_ms,
        enabled: input.enabled ?? true
      },
      options
    );
  }

  public async clearProviderConfig(options?: ProfileStoreOptions) {
    return clearStoredProviderConfig(options);
  }

  public async getProviderPolicy(
    profileId: string,
    operation: "modeling" | "simulation",
    options?: ProfileStoreOptions
  ) {
    const profile = await loadProfile(profileId, options);
    return getProviderPolicyStatus(profile, operation, options);
  }

  public validate(document: unknown): ValidationResult<PsonProfile> {
    return validateProfile(document);
  }

  public export(profile: PsonProfile, options?: { redaction_level?: "full" | "safe" }): string {
    return exportProfile(profile, options);
  }

  public async exportById(profileId: string, options?: ExportProfileOptions): Promise<string> {
    return exportStoredProfile(profileId, options);
  }

  public getPreference(profile: PsonProfile, key: string): unknown {
    return profile.layers.inferred[key] ?? profile.layers.observed[key] ?? null;
  }
}
