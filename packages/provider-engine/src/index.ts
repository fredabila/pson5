import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AiHeuristicCandidate,
  AiModelingInsight,
  AiProviderConfig,
  AiProviderStatus,
  AiSimulationInsight,
  AiTraitCandidate,
  QuestionDefinition,
  ProviderOperation,
  ProviderPolicyDecision,
  PsonProfile,
  ProfileStoreOptions,
  StoredAiProviderConfig
} from "@pson5/core-types";
import {
  filterSensitiveProviderCandidates,
  getProviderPolicyDecision,
  sanitizeProfileForProvider
} from "@pson5/privacy";
import { resolveStoreRoot } from "@pson5/serialization-engine";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 20000;
const PROVIDER_CONFIG_DIR = "config";
const PROVIDER_CONFIG_FILE = "provider.json";

interface JsonSchemaResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

interface OpenAiResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface AuditLogInput {
  profile_id: string;
  operation: ProviderOperation;
  allowed: boolean;
  provider: string | null;
  model: string | null;
  reason?: string;
  redacted_fields: string[];
  success: boolean;
  rootDir?: string;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getProviderConfigPath(options?: ProfileStoreOptions): string {
  return path.join(resolveStoreRoot(options), PROVIDER_CONFIG_DIR, PROVIDER_CONFIG_FILE);
}

function asProviderName(value: unknown): "openai" | "anthropic" | null {
  return value === "openai" || value === "anthropic" ? value : null;
}

function parseStoredProviderConfig(value: unknown): StoredAiProviderConfig | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const provider = asProviderName(record.provider);
  const enabled = Boolean(record.enabled);
  const model = typeof record.model === "string" && record.model.trim().length > 0 ? record.model.trim() : null;
  const base_url =
    typeof record.base_url === "string" && record.base_url.trim().length > 0 ? record.base_url.trim() : undefined;
  const timeout_ms = typeof record.timeout_ms === "number" ? record.timeout_ms : undefined;
  const api_key =
    typeof record.api_key === "string" && record.api_key.trim().length > 0 ? record.api_key.trim() : undefined;

  return {
    provider,
    enabled,
    model,
    base_url,
    timeout_ms,
    api_key
  };
}

function readStoredProviderConfig(options?: ProfileStoreOptions): StoredAiProviderConfig | null {
  const configPath = getProviderConfigPath(options);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    return parseStoredProviderConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getConfigFromEnv(): StoredAiProviderConfig | null {
  const providerValue = process.env.PSON_AI_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (providerValue === "anthropic" || (!providerValue && !apiKey && Boolean(anthropicApiKey))) {
    return {
      provider: "anthropic",
      enabled: true,
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      base_url: process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL,
      timeout_ms: Number(process.env.PSON_AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
      api_key: anthropicApiKey
    };
  }

  const enabled = providerValue === "openai" || (!providerValue && Boolean(apiKey));

  if (!enabled) {
    return null;
  }

  return {
    provider: "openai",
    enabled: true,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    base_url: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL,
    timeout_ms: Number(process.env.PSON_AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    api_key: apiKey
  };
}

function getConfigFromStore(options?: ProfileStoreOptions): StoredAiProviderConfig | null {
  const stored = readStoredProviderConfig(options);
  if (!stored?.provider || !stored.enabled) {
    return stored;
  }

  if (stored.provider === "openai") {
    return {
      provider: "openai",
      enabled: true,
      model: stored.model ?? DEFAULT_OPENAI_MODEL,
      base_url: stored.base_url ?? DEFAULT_OPENAI_BASE_URL,
      timeout_ms: stored.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      api_key: stored.api_key
    };
  }

  return {
    provider: "anthropic",
    enabled: true,
    model: stored.model ?? DEFAULT_ANTHROPIC_MODEL,
    base_url: stored.base_url ?? DEFAULT_ANTHROPIC_BASE_URL,
    timeout_ms: stored.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    api_key: stored.api_key
  };
}

function getResolvedProviderConfig(
  options?: ProfileStoreOptions
): { config: StoredAiProviderConfig; source: "env" | "file" | "none" } {
  const envConfig = getConfigFromEnv();
  if (envConfig) {
    return { config: envConfig, source: "env" };
  }

  const fileConfig = getConfigFromStore(options);
  if (fileConfig) {
    return { config: fileConfig, source: "file" };
  }

  return {
    config: {
      provider: null,
      enabled: false,
      model: null
    },
    source: "none"
  };
}

function getProviderApiKey(config: StoredAiProviderConfig): string | undefined {
  return config.api_key;
}

export async function saveProviderConfig(
  config: StoredAiProviderConfig,
  options?: ProfileStoreOptions
): Promise<{ path: string; provider: string | null; model: string | null; enabled: boolean; has_api_key: boolean }> {
  const configPath = getProviderConfigPath(options);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        provider: config.provider,
        enabled: config.enabled,
        model: config.model,
        base_url: config.base_url,
        timeout_ms: config.timeout_ms,
        api_key: config.api_key
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    path: configPath,
    provider: config.provider,
    model: config.model,
    enabled: config.enabled,
    has_api_key: Boolean(config.api_key)
  };
}

export function getStoredProviderConfig(
  options?: ProfileStoreOptions
): { path: string; configured: boolean; provider: string | null; model: string | null; enabled: boolean; has_api_key: boolean } {
  const configPath = getProviderConfigPath(options);
  const config = readStoredProviderConfig(options);
  return {
    path: configPath,
    configured: Boolean(config?.provider && config?.enabled),
    provider: config?.provider ?? null,
    model: config?.model ?? null,
    enabled: config?.enabled ?? false,
    has_api_key: Boolean(config?.api_key)
  };
}

export async function clearStoredProviderConfig(options?: ProfileStoreOptions): Promise<{ path: string; cleared: boolean }> {
  const configPath = getProviderConfigPath(options);
  if (existsSync(configPath)) {
    await rm(configPath, { force: true });
  }

  return {
    path: configPath,
    cleared: true
  };
}

export function getProviderStatusFromEnv(options?: ProfileStoreOptions): AiProviderStatus {
  const { config, source } = getResolvedProviderConfig(options);
  const publicConfig: AiProviderConfig = {
    provider: config.provider,
    enabled: config.enabled,
    model: config.model,
    base_url: config.base_url,
    timeout_ms: config.timeout_ms
  };

  if (!config.enabled || !config.provider) {
    return {
      ...publicConfig,
      configured: false,
      reason: "No AI provider configuration is available.",
      capabilities: [],
      source
    };
  }

  if (config.provider === "anthropic" && !getProviderApiKey(config)) {
    return {
      ...publicConfig,
      configured: false,
      reason: "Anthropic API key is missing.",
      capabilities: [],
      source
    };
  }

  if (config.provider === "openai" && !getProviderApiKey(config)) {
    return {
      ...publicConfig,
      configured: false,
      reason: "OpenAI API key is missing.",
      capabilities: [],
      source
    };
  }

  return {
    ...publicConfig,
    configured: true,
    capabilities: ["modeling", "simulation", "structured_json"],
    source
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function getResponseText(response: JsonSchemaResponse): string | null {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return null;
}

async function callOpenAiJson(
  format: OpenAiResponseFormat,
  instructions: string,
  payload: Record<string, unknown>,
  options?: ProfileStoreOptions
): Promise<Record<string, unknown> | null> {
  const { config } = getResolvedProviderConfig(options);
  const status = getProviderStatusFromEnv(options);
  if (!status.configured || status.provider !== "openai" || !status.model) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), status.timeout_ms ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${status.base_url ?? DEFAULT_OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${getProviderApiKey(config)}`
      },
      body: JSON.stringify({
        model: status.model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: `${instructions} Return valid JSON only.`
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(payload)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: format.name,
            strict: true,
            schema: format.schema
          }
        }
      }),
      signal: controller.signal
    });

    const body = (await response.json()) as JsonSchemaResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenAI request failed with status ${response.status}.`);
    }

    const text = getResponseText(body);
    return text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropicJson(
  format: OpenAiResponseFormat,
  instructions: string,
  payload: Record<string, unknown>,
  options?: ProfileStoreOptions
): Promise<Record<string, unknown> | null> {
  const { config } = getResolvedProviderConfig(options);
  const status = getProviderStatusFromEnv(options);
  if (!status.configured || status.provider !== "anthropic" || !status.model) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), status.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const schemaSnippet = JSON.stringify(format.schema);

  try {
    const response = await fetch(`${status.base_url ?? DEFAULT_ANTHROPIC_BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": getProviderApiKey(config) ?? "",
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify({
        model: status.model,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              `${instructions}\nReturn only one valid JSON object matching this schema: ${schemaSnippet}\nPayload:\n${JSON.stringify(payload)}`
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    const body = (await response.json()) as AnthropicMessageResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `Anthropic request failed with status ${response.status}.`);
    }

    const text = body.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    return text ? extractJsonObject(text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callProviderJson(
  format: OpenAiResponseFormat,
  instructions: string,
  payload: Record<string, unknown>,
  options?: ProfileStoreOptions
): Promise<Record<string, unknown> | null> {
  const status = getProviderStatusFromEnv(options);

  if (status.provider === "openai") {
    return callOpenAiJson(format, instructions, payload, options);
  }

  if (status.provider === "anthropic") {
    return callAnthropicJson(format, instructions, payload, options);
  }

  return null;
}

async function appendProviderAuditLog(input: AuditLogInput): Promise<void> {
  const rootDir = resolveStoreRoot({ rootDir: input.rootDir });
  const auditDir = path.join(rootDir, "audit");
  const auditPath = path.join(auditDir, "provider.jsonl");
  const record = {
    timestamp: new Date().toISOString(),
    profile_id: input.profile_id,
    operation: input.operation,
    allowed: input.allowed,
    provider: input.provider,
    model: input.model,
    reason: input.reason ?? null,
    redacted_fields: input.redacted_fields,
    success: input.success
  };

  await mkdir(auditDir, { recursive: true });
  await writeFile(auditPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
}

export function getProviderPolicyStatus(
  profile: PsonProfile,
  operation: ProviderOperation,
  options?: ProfileStoreOptions
): ProviderPolicyDecision & { provider_status: AiProviderStatus } {
  const providerStatus = getProviderStatusFromEnv(options);
  const { redacted_fields } = sanitizeProfileForProvider(profile);
  const policyDecision = getProviderPolicyDecision(profile, operation, redacted_fields);

  if (!providerStatus.configured) {
    return {
      ...policyDecision,
      allowed: false,
      reason: providerStatus.reason ?? "AI provider is not configured.",
      provider_status: providerStatus
    };
  }

  if (!policyDecision.allowed) {
    return {
      ...policyDecision,
      provider_status: providerStatus
    };
  }

  return {
    ...policyDecision,
    provider_status: providerStatus
  };
}

function modelingSchema(): OpenAiResponseFormat {
  return {
    name: "pson_modeling_insight",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "summary",
        "overall_confidence",
        "trait_candidates",
        "heuristic_candidates",
        "caveats"
      ],
      properties: {
        summary: { type: "string" },
        overall_confidence: { type: "number" },
        caveats: {
          type: "array",
          items: { type: "string" }
        },
        trait_candidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "domain", "value", "confidence", "rationale"],
            properties: {
              key: { type: "string" },
              domain: { type: "string" },
              value: { type: "string" },
              confidence: { type: "number" },
              rationale: { type: "string" }
            }
          }
        },
        heuristic_candidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "domain", "description", "outcome", "confidence"],
            properties: {
              id: { type: "string" },
              domain: { type: "string" },
              description: { type: "string" },
              outcome: { type: "string" },
              confidence: { type: "number" }
            }
          }
        }
      }
    }
  };
}

function simulationSchema(): OpenAiResponseFormat {
  return {
    name: "pson_simulation_prediction",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["prediction", "confidence", "reasoning", "caveats", "alternatives"],
      properties: {
        prediction: { type: "string" },
        confidence: { type: "number" },
        reasoning: {
          type: "array",
          items: { type: "string" }
        },
        caveats: {
          type: "array",
          items: { type: "string" }
        },
        alternatives: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  };
}

function answerNormalizationSchema(): OpenAiResponseFormat {
  return {
    name: "pson_answer_normalization",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["matched", "normalized_value", "confidence", "rationale"],
      properties: {
        matched: { type: "boolean" },
        normalized_value: {
          anyOf: [{ type: "string" }, { type: "null" }]
        },
        confidence: { type: "number" },
        rationale: { type: "string" }
      }
    }
  };
}

function normalizeTraitCandidates(value: unknown): AiTraitCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      key: String(entry.key ?? ""),
      domain: String(entry.domain ?? "core"),
      value: String(entry.value ?? ""),
      confidence: clampConfidence(Number(entry.confidence ?? 0)),
      rationale: String(entry.rationale ?? "")
    }))
    .filter((entry) => entry.key.length > 0 && entry.value.length > 0);
}

function normalizeHeuristicCandidates(value: unknown): AiHeuristicCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      id: String(entry.id ?? ""),
      domain: String(entry.domain ?? "core"),
      description: String(entry.description ?? ""),
      outcome: String(entry.outcome ?? ""),
      confidence: clampConfidence(Number(entry.confidence ?? 0))
    }))
    .filter((entry) => entry.id.length > 0 && entry.description.length > 0);
}

export async function deriveProviderModelingInsight(
  profile: PsonProfile,
  options?: { rootDir?: string }
): Promise<AiModelingInsight | null> {
  const policyStatus = getProviderPolicyStatus(profile, "modeling", { rootDir: options?.rootDir });
  const status = policyStatus.provider_status;
  if (!policyStatus.allowed || !status.provider || !status.model) {
    await appendProviderAuditLog({
      profile_id: profile.profile_id,
      operation: "modeling",
      allowed: policyStatus.allowed,
      provider: status.provider,
      model: status.model,
      reason: policyStatus.reason,
      redacted_fields: policyStatus.redacted_fields,
      success: false,
      rootDir: options?.rootDir
    });
    return null;
  }

  const { sanitized_profile, redacted_fields } = sanitizeProfileForProvider(profile);

  const raw = await callProviderJson(
    modelingSchema(),
    [
      "You are analyzing a personalization profile for an AI system.",
      "Use only the supplied profile snapshot.",
      "Do not infer protected or highly sensitive attributes.",
      "Produce compact trait and heuristic candidates that can help future simulations.",
      "Prefer uncertainty over overclaiming."
    ].join(" "),
    {
      task: "model_profile",
      policy: {
        operation: "modeling",
        redacted_fields
      },
      profile: sanitized_profile
    },
    { rootDir: options?.rootDir }
  );

  if (!raw) {
    await appendProviderAuditLog({
      profile_id: profile.profile_id,
      operation: "modeling",
      allowed: true,
      provider: status.provider,
      model: status.model,
      reason: "Provider result unavailable.",
      redacted_fields,
      success: false,
      rootDir: options?.rootDir
    });
    return null;
  }

  const traitFilter = filterSensitiveProviderCandidates(
    normalizeTraitCandidates(raw.trait_candidates),
    (entry) => `${entry.key} ${entry.value} ${entry.rationale}`
  );
  const heuristicFilter = filterSensitiveProviderCandidates(
    normalizeHeuristicCandidates(raw.heuristic_candidates),
    (entry) => `${entry.id} ${entry.description} ${entry.outcome}`
  );
  const caveats = getStringArray(raw.caveats);
  if (traitFilter.removed_count > 0 || heuristicFilter.removed_count > 0) {
    caveats.push("Some AI-generated candidates were removed by restricted-inference policy.");
  }

  await appendProviderAuditLog({
    profile_id: profile.profile_id,
    operation: "modeling",
    allowed: true,
    provider: status.provider,
    model: status.model,
    redacted_fields,
    success: true,
    rootDir: options?.rootDir
  });

  return {
    provider: status.provider,
    model: status.model,
    generated_at: new Date().toISOString(),
    summary: String(raw.summary ?? ""),
    trait_candidates: traitFilter.allowed,
    heuristic_candidates: heuristicFilter.allowed,
    caveats,
    overall_confidence: clampConfidence(Number(raw.overall_confidence ?? 0))
  };
}

export async function deriveProviderSimulationInsight(
  profile: PsonProfile,
  context: Record<string, unknown>,
  options?: { rootDir?: string }
): Promise<AiSimulationInsight | null> {
  const policyStatus = getProviderPolicyStatus(profile, "simulation", { rootDir: options?.rootDir });
  const status = policyStatus.provider_status;
  if (!policyStatus.allowed || !status.provider || !status.model) {
    await appendProviderAuditLog({
      profile_id: profile.profile_id,
      operation: "simulation",
      allowed: policyStatus.allowed,
      provider: status.provider,
      model: status.model,
      reason: policyStatus.reason,
      redacted_fields: policyStatus.redacted_fields,
      success: false,
      rootDir: options?.rootDir
    });
    return null;
  }

  const { sanitized_profile, redacted_fields } = sanitizeProfileForProvider(profile);

  const raw = await callProviderJson(
    simulationSchema(),
    [
      "You are simulating likely user behavior for a personalization engine.",
      "Use only the supplied profile snapshot and context.",
      "Be probabilistic and concise.",
      "Do not assume certainty.",
      "Return a likely behavioral prediction with reasoning, caveats, and alternatives."
    ].join(" "),
    {
      task: "simulate_user_behavior",
      policy: {
        operation: "simulation",
        redacted_fields
      },
      profile: sanitized_profile,
      context
    },
    { rootDir: options?.rootDir }
  );

  if (!raw) {
    await appendProviderAuditLog({
      profile_id: profile.profile_id,
      operation: "simulation",
      allowed: true,
      provider: status.provider,
      model: status.model,
      reason: "Provider result unavailable.",
      redacted_fields,
      success: false,
      rootDir: options?.rootDir
    });
    return null;
  }

  await appendProviderAuditLog({
    profile_id: profile.profile_id,
    operation: "simulation",
    allowed: true,
    provider: status.provider,
    model: status.model,
    redacted_fields,
    success: true,
    rootDir: options?.rootDir
  });

  return {
    provider: status.provider,
    model: status.model,
    generated_at: new Date().toISOString(),
    prediction: String(raw.prediction ?? "insufficient_signal"),
    confidence: clampConfidence(Number(raw.confidence ?? 0)),
    reasoning: getStringArray(raw.reasoning),
    caveats: getStringArray(raw.caveats),
    alternatives: getStringArray(raw.alternatives)
  };
}

export async function normalizeAnswerWithProvider(
  profile: PsonProfile,
  question: QuestionDefinition,
  rawAnswer: string,
  options?: { rootDir?: string }
): Promise<{ normalized_value: string | null; confidence: number; rationale: string } | null> {
  const policyStatus = getProviderPolicyStatus(profile, "modeling", { rootDir: options?.rootDir });
  const status = policyStatus.provider_status;
  if (!policyStatus.allowed || !status.provider || !status.model) {
    return null;
  }

  if (question.type !== "single_choice" || !question.choices?.length) {
    return null;
  }

  const raw = await callProviderJson(
    answerNormalizationSchema(),
    [
      "You normalize a free-form user answer into one allowed structured choice.",
      "Use only the listed choices.",
      "If none fit confidently, return matched false and normalized_value null.",
      "Be conservative and do not over-interpret."
    ].join(" "),
    {
      task: "normalize_user_answer",
      question: {
        id: question.id,
        prompt: question.prompt,
        choices: question.choices
      },
      raw_answer: rawAnswer
    },
    { rootDir: options?.rootDir }
  );

  if (!raw || raw.matched !== true) {
    return null;
  }

  const normalizedValue =
    typeof raw.normalized_value === "string" && raw.normalized_value.trim().length > 0
      ? raw.normalized_value.trim()
      : null;

  if (!normalizedValue || !question.choices.some((choice) => choice.value === normalizedValue)) {
    return null;
  }

  return {
    normalized_value: normalizedValue,
    confidence: clampConfidence(Number(raw.confidence ?? 0)),
    rationale: String(raw.rationale ?? "")
  };
}

export const providerEngineStatus = {
  phase: "implemented",
  provider: "multi",
  next_step: "Add adaptive acquisition prompts, retries, richer provider-specific validation, and shared adapter tests."
} as const;
