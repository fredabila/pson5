import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const PROVIDER_CALL_AUDIT_FILE = "provider-call.jsonl";
const DEFAULT_MAX_PROVIDER_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 500;
const DEFAULT_BACKOFF_CAP_MS = 8000;
const MAX_RETRY_AFTER_HONOURED_MS = 15000;
const CHARS_PER_TOKEN_ESTIMATE = 4;

interface ProviderCallAuditRecord {
  timestamp: string;
  provider: string;
  model: string;
  base_url: string;
  endpoint: string;
  schema_name: string;
  attempts: number;
  final_status_code: number | null;
  final_error: string | null;
  estimated_prompt_tokens: number;
  estimated_response_tokens: number;
  duration_ms: number;
  success: boolean;
}

interface FetchWithRetryResult {
  response: Response | null;
  body_text: string | null;
  attempts: number;
  final_status_code: number | null;
  final_error: string | null;
  duration_ms: number;
}

export function estimateTokens(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE));
}

export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status < 600 && status !== 501);
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_HONOURED_MS);
  }
  const dateMs = Date.parse(header.trim());
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? Math.min(delta, MAX_RETRY_AFTER_HONOURED_MS) : 0;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  limits: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<FetchWithRetryResult> {
  const maxAttempts = Math.max(1, limits.maxAttempts ?? DEFAULT_MAX_PROVIDER_ATTEMPTS);
  const baseDelayMs = limits.baseDelayMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxDelayMs = limits.maxDelayMs ?? DEFAULT_BACKOFF_CAP_MS;
  const startedAt = Date.now();

  let attempt = 0;
  let lastError: string | null = null;
  let lastStatus: number | null = null;
  let lastResponse: Response | null = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const response = await fetch(url, init);
      lastResponse = response;
      lastStatus = response.status;

      if (response.ok) {
        const bodyText = await response.text();
        return {
          response,
          body_text: bodyText,
          attempts: attempt,
          final_status_code: response.status,
          final_error: null,
          duration_ms: Date.now() - startedAt
        };
      }

      const errorText = await response.text().catch(() => "");
      if (!shouldRetryStatus(response.status) || attempt >= maxAttempts) {
        return {
          response,
          body_text: errorText || null,
          attempts: attempt,
          final_status_code: response.status,
          final_error: `HTTP ${response.status}`,
          duration_ms: Date.now() - startedAt
        };
      }

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      const backoffMs = retryAfterMs ?? Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(backoffMs);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= maxAttempts) {
        break;
      }
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }

  return {
    response: lastResponse,
    body_text: null,
    attempts: attempt,
    final_status_code: lastStatus,
    final_error: lastError ?? (lastStatus !== null ? `HTTP ${lastStatus}` : "unknown provider failure"),
    duration_ms: Date.now() - startedAt
  };
}

export async function readProviderCallAuditRecords(
  options?: ProfileStoreOptions
): Promise<ProviderCallAuditRecord[]> {
  try {
    const rootDir = resolveStoreRoot(options);
    const auditPath = path.join(rootDir, "audit", PROVIDER_CALL_AUDIT_FILE);
    const raw = await readFile(auditPath, "utf8");
    const records: ProviderCallAuditRecord[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      try {
        records.push(JSON.parse(trimmed) as ProviderCallAuditRecord);
      } catch {
        // Skip malformed lines.
      }
    }
    return records;
  } catch {
    return [];
  }
}

async function appendProviderCallAuditLog(
  record: ProviderCallAuditRecord,
  options?: ProfileStoreOptions
): Promise<void> {
  try {
    const rootDir = resolveStoreRoot(options);
    const auditDir = path.join(rootDir, "audit");
    await mkdir(auditDir, { recursive: true });
    await writeFile(path.join(auditDir, PROVIDER_CALL_AUDIT_FILE), `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      flag: "a"
    });
  } catch {
    // Audit is best-effort; never block the provider call on logging I/O.
  }
}

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

// ---------------------------------------------------------------------------
// Provider adapter contract + registry
//
// Any model can plug into PSON5 by implementing this interface and calling
// `registerProviderAdapter(adapter)`. The built-in adapters (openai,
// anthropic, openai-compatible) are registered on module load.
// ---------------------------------------------------------------------------

/** Inputs handed to an adapter for a single structured JSON call. */
export interface ProviderAdapterCallArgs {
  /**
   * Fully resolved provider config for this call: provider name, model,
   * base_url, timeout_ms, api_key.
   */
  config: StoredAiProviderConfig;
  /** JSON-Schema structured-output hint. */
  format: OpenAiResponseFormat;
  /** Developer-level instructions to steer the model. */
  instructions: string;
  /** Arbitrary JSON payload that becomes the "user" message content. */
  payload: Record<string, unknown>;
  /** Abort signal bound to the PSON5 timeout. */
  signal: AbortSignal;
}

/** Result of a single adapter call. Metrics are always returned so PSON5 can audit. */
export interface ProviderAdapterCallResult {
  /** Parsed JSON object the model returned, or null if parsing failed. */
  parsed: Record<string, unknown> | null;
  /** Raw metrics from the underlying HTTP attempt(s). */
  attempt: FetchWithRetryResult;
  /** Endpoint that was hit — used to populate the per-call audit record. */
  endpoint: string;
}

/** Pluggable adapter for a concrete model provider. */
export interface ProviderAdapter {
  /** Registry key. Lowercase, stable. */
  readonly name: string;
  /** Used when no base_url is configured. */
  readonly default_base_url: string;
  /** Used when no model is configured. */
  readonly default_model: string;
  /** Friendly label for UI / audits. */
  readonly display_name?: string;
  /** Perform a single structured JSON call against this provider. */
  callJson(args: ProviderAdapterCallArgs): Promise<ProviderAdapterCallResult>;
}

const providerAdapterRegistry = new Map<string, ProviderAdapter>();

/** Register (or replace) a provider adapter by name. */
export function registerProviderAdapter(adapter: ProviderAdapter): void {
  providerAdapterRegistry.set(adapter.name.toLowerCase(), adapter);
}

/** Remove a provider adapter by name. Returns true if the adapter was registered. */
export function unregisterProviderAdapter(name: string): boolean {
  return providerAdapterRegistry.delete(name.toLowerCase());
}

/** Look up a provider adapter by name. */
export function getProviderAdapter(name: string | null | undefined): ProviderAdapter | undefined {
  if (!name) {
    return undefined;
  }
  return providerAdapterRegistry.get(name.toLowerCase());
}

/** List every registered provider adapter, in registration order. */
export function listProviderAdapters(): ProviderAdapter[] {
  return [...providerAdapterRegistry.values()];
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

function asProviderName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
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
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const generalKey = process.env.PSON_AI_API_KEY?.trim();
  const baseUrl = process.env.PSON_AI_BASE_URL?.trim();
  const modelOverride = process.env.PSON_AI_MODEL?.trim();
  const timeout = Number(process.env.PSON_AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  const resolveKey = (preferred?: string): string | undefined =>
    preferred && preferred.length > 0 ? preferred : generalKey && generalKey.length > 0 ? generalKey : undefined;

  // Explicit provider wins. Otherwise infer from which key is set; falling back
  // to OpenAI when no signal is available keeps the historical default.
  if (providerValue) {
    const adapter = getProviderAdapter(providerValue);
    if (adapter) {
      return {
        provider: adapter.name,
        enabled: true,
        model: modelOverride || adapter.default_model,
        base_url: baseUrl || adapter.default_base_url,
        timeout_ms: timeout,
        api_key:
          adapter.name === "anthropic"
            ? resolveKey(anthropicKey)
            : adapter.name === "openai"
              ? resolveKey(openaiKey)
              : resolveKey()
      };
    }
    // Unknown provider name — no config.
    return null;
  }

  if (anthropicKey && !openaiKey) {
    return {
      provider: "anthropic",
      enabled: true,
      model: modelOverride || DEFAULT_ANTHROPIC_MODEL,
      base_url: baseUrl || DEFAULT_ANTHROPIC_BASE_URL,
      timeout_ms: timeout,
      api_key: anthropicKey
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      enabled: true,
      model: modelOverride || DEFAULT_OPENAI_MODEL,
      base_url: baseUrl || DEFAULT_OPENAI_BASE_URL,
      timeout_ms: timeout,
      api_key: openaiKey
    };
  }

  return null;
}

function getConfigFromStore(options?: ProfileStoreOptions): StoredAiProviderConfig | null {
  const stored = readStoredProviderConfig(options);
  if (!stored?.provider || !stored.enabled) {
    return stored;
  }

  const adapter = getProviderAdapter(stored.provider);
  if (!adapter) {
    return stored;
  }

  return {
    provider: adapter.name,
    enabled: true,
    model: stored.model ?? adapter.default_model,
    base_url: stored.base_url ?? adapter.default_base_url,
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

  const adapter = getProviderAdapter(config.provider);
  if (!adapter) {
    return {
      ...publicConfig,
      configured: false,
      reason: `Provider adapter '${config.provider}' is not registered.`,
      capabilities: [],
      source
    };
  }

  if (!getProviderApiKey(config)) {
    return {
      ...publicConfig,
      configured: false,
      reason: `API key for provider '${config.provider}' is missing.`,
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

// ---------------------------------------------------------------------------
// Built-in provider adapters
// ---------------------------------------------------------------------------

const openaiAdapter: ProviderAdapter = {
  name: "openai",
  display_name: "OpenAI",
  default_base_url: DEFAULT_OPENAI_BASE_URL,
  default_model: DEFAULT_OPENAI_MODEL,
  async callJson(args) {
    const baseUrl = args.config.base_url ?? DEFAULT_OPENAI_BASE_URL;
    const endpoint = `${baseUrl}/responses`;
    const requestBody = JSON.stringify({
      model: args.config.model ?? DEFAULT_OPENAI_MODEL,
      input: [
        {
          role: "developer",
          content: [
            { type: "input_text", text: `${args.instructions} Return valid JSON only.` }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(args.payload) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: args.format.name,
          strict: true,
          schema: args.format.schema
        }
      }
    });

    const attempt = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${getProviderApiKey(args.config) ?? ""}`
      },
      body: requestBody,
      signal: args.signal
    });

    let parsed: Record<string, unknown> | null = null;
    if (attempt.response?.ok && attempt.body_text) {
      try {
        const body = JSON.parse(attempt.body_text) as JsonSchemaResponse;
        const text = getResponseText(body);
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }
    }

    return { parsed, attempt, endpoint };
  }
};

const anthropicAdapter: ProviderAdapter = {
  name: "anthropic",
  display_name: "Anthropic",
  default_base_url: DEFAULT_ANTHROPIC_BASE_URL,
  default_model: DEFAULT_ANTHROPIC_MODEL,
  async callJson(args) {
    const baseUrl = args.config.base_url ?? DEFAULT_ANTHROPIC_BASE_URL;
    const endpoint = `${baseUrl}/messages`;
    const schemaSnippet = JSON.stringify(args.format.schema);
    const requestBody = JSON.stringify({
      model: args.config.model ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `${args.instructions}\nReturn only one valid JSON object matching this schema: ${schemaSnippet}\nPayload:\n${JSON.stringify(args.payload)}`
        }
      ]
    });

    const attempt = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": getProviderApiKey(args.config) ?? "",
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: requestBody,
      signal: args.signal
    });

    let parsed: Record<string, unknown> | null = null;
    if (attempt.response?.ok && attempt.body_text) {
      try {
        const body = JSON.parse(attempt.body_text) as AnthropicMessageResponse;
        const text = body.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text ?? "")
          .join("\n")
          .trim();
        parsed = text ? extractJsonObject(text) : null;
      } catch {
        parsed = null;
      }
    }

    return { parsed, attempt, endpoint };
  }
};

/**
 * Universal OpenAI-compatible adapter. Works against any server that speaks
 * the OpenAI chat-completions shape (Ollama, vLLM, LiteLLM, OpenRouter, Groq,
 * Together, Fireworks, Azure OpenAI, and so on). Point it at any `base_url`
 * ending in `/v1` and PSON5 will use `/chat/completions` with JSON-mode
 * structured outputs.
 */
const openaiCompatibleAdapter: ProviderAdapter = {
  name: "openai-compatible",
  display_name: "OpenAI-compatible endpoint",
  default_base_url: "http://localhost:11434/v1",
  default_model: "",
  async callJson(args) {
    const baseUrl = args.config.base_url ?? this.default_base_url;
    const endpoint = `${baseUrl}/chat/completions`;
    const schemaSnippet = JSON.stringify(args.format.schema);
    const requestBody = JSON.stringify({
      model: args.config.model ?? this.default_model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${args.instructions}\nReply with ONE valid JSON object matching this schema: ${schemaSnippet}`
        },
        {
          role: "user",
          content: JSON.stringify(args.payload)
        }
      ]
    });

    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = getProviderApiKey(args.config);
    if (key) {
      headers.authorization = `Bearer ${key}`;
    }

    const attempt = await fetchWithRetry(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
      signal: args.signal
    });

    let parsed: Record<string, unknown> | null = null;
    if (attempt.response?.ok && attempt.body_text) {
      try {
        const body = JSON.parse(attempt.body_text) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = body.choices?.[0]?.message?.content?.trim();
        parsed = text ? extractJsonObject(text) : null;
      } catch {
        parsed = null;
      }
    }

    return { parsed, attempt, endpoint };
  }
};

registerProviderAdapter(openaiAdapter);
registerProviderAdapter(anthropicAdapter);
registerProviderAdapter(openaiCompatibleAdapter);

async function callProviderJson(
  format: OpenAiResponseFormat,
  instructions: string,
  payload: Record<string, unknown>,
  options?: ProfileStoreOptions
): Promise<Record<string, unknown> | null> {
  const status = getProviderStatusFromEnv(options);
  if (!status.configured || !status.provider || !status.model) {
    return null;
  }

  const adapter = getProviderAdapter(status.provider);
  if (!adapter) {
    return null;
  }

  const { config } = getResolvedProviderConfig(options);
  const timeoutMs = status.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const requestStartedAt = Date.now();
  let result: ProviderAdapterCallResult | null = null;
  let caughtError: unknown = null;

  try {
    result = await adapter.callJson({
      config,
      format,
      instructions,
      payload,
      signal: controller.signal
    });
  } catch (error) {
    caughtError = error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const responseText = result?.attempt.body_text ?? "";
  const success = Boolean(result?.parsed !== null && result?.parsed !== undefined);
  const endpoint =
    result?.endpoint ?? `${config.base_url ?? adapter.default_base_url}/<unknown>`;
  const estimatedPromptTokens = estimateTokens(JSON.stringify(payload) + instructions);

  await appendProviderCallAuditLog(
    {
      timestamp: new Date().toISOString(),
      provider: adapter.name,
      model: status.model,
      base_url: config.base_url ?? adapter.default_base_url,
      endpoint,
      schema_name: format.name,
      attempts: result?.attempt.attempts ?? 1,
      final_status_code: result?.attempt.final_status_code ?? null,
      final_error: success
        ? null
        : result?.attempt.final_error ??
          (caughtError instanceof Error
            ? caughtError.message
            : caughtError
              ? String(caughtError)
              : "response parse failure"),
      estimated_prompt_tokens: estimatedPromptTokens,
      estimated_response_tokens: estimateTokens(responseText),
      duration_ms: result?.attempt.duration_ms ?? Date.now() - requestStartedAt,
      success
    },
    options
  );

  return result?.parsed ?? null;
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

function consoleIntentSchema(): OpenAiResponseFormat {
  return {
    name: "pson_console_intent",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["action", "confidence", "rationale"],
      properties: {
        action: {
          type: "string",
          enum: [
            "help",
            "init_profile",
            "load_profile",
            "next_question",
            "answer_question",
            "simulate",
            "agent_context",
            "inspect",
            "state",
            "graph",
            "provider_status",
            "provider_policy",
            "neo4j_status",
            "neo4j_sync",
            "export",
            "explain",
            "noop"
          ]
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1
        },
        rationale: {
          type: "string"
        },
        user_id: {
          type: "string"
        },
        profile_id: {
          type: "string"
        },
        value: {
          type: "string"
        },
        intent: {
          type: "string"
        },
        task_text: {
          type: "string"
        },
        inspect_mode: {
          type: "string",
          enum: ["full", "observed", "inferred", "privacy"]
        },
        operation: {
          type: "string",
          enum: ["modeling", "simulation"]
        },
        prediction: {
          type: "string"
        },
        redaction_level: {
          type: "string",
          enum: ["full", "safe"]
        },
        reply: {
          type: "string"
        }
      }
    }
  };
}

function adaptiveQuestionSchema(): OpenAiResponseFormat {
  return {
    name: "pson_adaptive_question",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "question_mode",
        "selected_question_id",
        "rewritten_prompt",
        "answer_style_hint",
        "rationale",
        "stop_early"
      ],
      properties: {
        question_mode: {
          type: "string",
          enum: ["candidate", "follow_up"]
        },
        selected_question_id: {
          type: ["string", "null"]
        },
        rewritten_prompt: {
          type: ["string", "null"]
        },
        answer_style_hint: {
          type: ["string", "null"]
        },
        rationale: {
          type: "string"
        },
        stop_early: {
          type: "boolean"
        }
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

export async function deriveConsoleIntent(
  input: {
    message: string;
    profile_id?: string;
    session_id?: string;
    pending_question_id?: string;
    available_actions?: string[];
  },
  options?: { rootDir?: string }
): Promise<
  | {
      action:
        | "help"
        | "init_profile"
        | "load_profile"
        | "next_question"
        | "answer_question"
        | "simulate"
        | "agent_context"
        | "inspect"
        | "state"
        | "graph"
        | "provider_status"
        | "provider_policy"
        | "neo4j_status"
        | "neo4j_sync"
        | "export"
        | "explain"
        | "noop";
      confidence: number;
      rationale: string;
      user_id?: string;
      profile_id?: string;
      value?: string;
      intent?: string;
      task_text?: string;
      inspect_mode?: "full" | "observed" | "inferred" | "privacy";
      operation?: "modeling" | "simulation";
      prediction?: string;
      redaction_level?: "full" | "safe";
      reply?: string;
    }
  | null
> {
  const status = getProviderStatusFromEnv({ rootDir: options?.rootDir });
  if (!status.configured || !status.provider || !status.model) {
    return null;
  }

  const raw = await callProviderJson(
    consoleIntentSchema(),
    [
      "You are routing natural-language terminal input into a structured PSON5 console action.",
      "Choose the closest supported action from the schema.",
      "Be conservative. Use noop when the request is unclear or outside the available actions.",
      "Do not invent profile ids or sensitive data.",
      "Keep rationale short."
    ].join(" "),
    {
      task: "route_console_intent",
      message: input.message,
      context: {
        profile_id: input.profile_id ?? null,
        session_id: input.session_id ?? null,
        pending_question_id: input.pending_question_id ?? null,
        available_actions: input.available_actions ?? []
      }
    },
    { rootDir: options?.rootDir }
  );

  if (!raw || typeof raw.action !== "string") {
    return null;
  }

  const validActions = new Set([
    "help",
    "init_profile",
    "load_profile",
    "next_question",
    "answer_question",
    "simulate",
    "agent_context",
    "inspect",
    "state",
    "graph",
    "provider_status",
    "provider_policy",
    "neo4j_status",
    "neo4j_sync",
    "export",
    "explain",
    "noop"
  ]);

  if (!validActions.has(raw.action)) {
    return null;
  }

  return {
    action: raw.action as
      | "help"
      | "init_profile"
      | "load_profile"
      | "next_question"
      | "answer_question"
      | "simulate"
      | "agent_context"
      | "inspect"
      | "state"
      | "graph"
      | "provider_status"
      | "provider_policy"
      | "neo4j_status"
      | "neo4j_sync"
      | "export"
      | "explain"
      | "noop",
    confidence: clampConfidence(Number(raw.confidence ?? 0)),
    rationale: String(raw.rationale ?? ""),
    user_id: typeof raw.user_id === "string" ? raw.user_id : undefined,
    profile_id: typeof raw.profile_id === "string" ? raw.profile_id : undefined,
    value: typeof raw.value === "string" ? raw.value : undefined,
    intent: typeof raw.intent === "string" ? raw.intent : undefined,
    task_text: typeof raw.task_text === "string" ? raw.task_text : undefined,
    inspect_mode:
      raw.inspect_mode === "full" ||
      raw.inspect_mode === "observed" ||
      raw.inspect_mode === "inferred" ||
      raw.inspect_mode === "privacy"
        ? raw.inspect_mode
        : undefined,
    operation: raw.operation === "modeling" || raw.operation === "simulation" ? raw.operation : undefined,
    prediction: typeof raw.prediction === "string" ? raw.prediction : undefined,
    redaction_level: raw.redaction_level === "full" || raw.redaction_level === "safe" ? raw.redaction_level : undefined,
    reply: typeof raw.reply === "string" ? raw.reply : undefined
  };
}

export async function deriveAdaptiveQuestion(
  profile: PsonProfile,
  input: {
    candidates: QuestionDefinition[];
    session: {
      session_id: string;
      domains: string[];
      depth: string;
      asked_question_ids: string[];
      answered_question_ids: string[];
      contradiction_flags: Array<{
        target: string;
        previous_value: unknown;
        incoming_value: unknown;
        question_id: string;
        detected_at: string;
      }>;
      confidence_gaps: string[];
      fatigue_score: number;
    };
  },
  options?: { rootDir?: string }
): Promise<{
  question_mode: "candidate" | "follow_up";
  selected_question_id: string | null;
  rewritten_prompt: string | null;
  answer_style_hint: string | null;
  rationale: string;
  stop_early: boolean;
} | null> {
  const policyStatus = getProviderPolicyStatus(profile, "modeling", { rootDir: options?.rootDir });
  const status = policyStatus.provider_status;
  if (!policyStatus.allowed || !status.provider || !status.model) {
    return null;
  }

  if (input.candidates.length === 0) {
    return null;
  }

  const { sanitized_profile, redacted_fields } = sanitizeProfileForProvider(profile);
  const raw = await callProviderJson(
    adaptiveQuestionSchema(),
    [
      "You are choosing the next best personalization question for an adaptive acquisition system.",
      "Select from the provided candidate questions only.",
      "Rewrite the selected prompt so it sounds conversational and cognitively natural.",
      "Do not force multiple-choice wording unless necessary.",
      "Use confidence gaps, contradiction flags, and fatigue to decide whether to probe deeper or stop early.",
      "If contradictions exist, prefer a clarifying follow-up when a candidate can resolve them.",
      "If the profile already has enough signal or fatigue is high relative to remaining uncertainty, you may stop early.",
      "Be conservative and do not invent new question ids."
    ].join(" "),
    {
      task: "choose_next_personalization_question",
      policy: {
        operation: "modeling",
        redacted_fields
      },
      profile: sanitized_profile,
      session: input.session,
      candidates: input.candidates.map((question) => ({
        id: question.id,
        domain: question.domain,
        prompt: question.prompt,
        type: question.type,
        depth: question.depth,
        information_targets: question.information_targets,
        choices: question.choices ?? []
      }))
    },
    { rootDir: options?.rootDir }
  );

  if (!raw) {
    return null;
  }

  return {
    question_mode: raw.question_mode === "follow_up" ? "follow_up" : "candidate",
    selected_question_id: typeof raw.selected_question_id === "string" ? raw.selected_question_id : null,
    rewritten_prompt: typeof raw.rewritten_prompt === "string" ? raw.rewritten_prompt : null,
    answer_style_hint: typeof raw.answer_style_hint === "string" ? raw.answer_style_hint : null,
    rationale: String(raw.rationale ?? ""),
    stop_early: raw.stop_early === true
  };
}

export const providerEngineStatus = {
  phase: "implemented",
  provider: "multi",
  next_step: "Add adaptive acquisition prompts, retries, richer provider-specific validation, and shared adapter tests."
} as const;
