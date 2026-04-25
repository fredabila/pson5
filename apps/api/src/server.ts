import { createServer } from "node:http";
import {
  createHmac,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify as verifySignature
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InitProfileInput, ProfileStoreOptions, PsonProfile } from "@pson5/core-types";
import { redactProfileForExport } from "@pson5/privacy";
import { getNextQuestions, submitLearningAnswers } from "@pson5/acquisition-engine";
import { buildStoredAgentContext } from "@pson5/agent-context";
import { explainPredictionSupport } from "@pson5/graph-engine";
import { getNeo4jStatus, syncStoredProfileKnowledgeGraph } from "@pson5/neo4j-store";
import { getProviderPolicyStatus, getProviderStatusFromEnv } from "@pson5/provider-engine";
import {
  createPsonAgentToolExecutor,
  getPsonAgentToolDefinitions,
  PsonClient,
  type PsonAgentToolCall,
  type PsonAgentToolDefinition,
  type PsonAgentToolName
} from "@pson5/sdk";
import {
  createMemoryProfileStoreAdapter,
  exportStoredProfile,
  findProfilesByUserId,
  importProfileDocument,
  initProfile,
  loadProfile,
  loadProfileByUserId,
  ProfileStoreError,
  resolveStoreRoot,
  validateProfile
} from "@pson5/serialization-engine";
import { PsonError } from "@pson5/core-types";
import { simulateStoredProfile } from "@pson5/simulation-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

// Read the API's own version from its package.json so the MCP
// initialize handshake reports something accurate to clients (ChatGPT
// Apps in particular surfaces this in their app catalogue). The compiled
// server lives at apps/api/dist/apps/api/src/server.js, so the package
// manifest is four directories up from here.
const apiPackageVersion: string = (() => {
  try {
    const compiledDir = path.dirname(fileURLToPath(import.meta.url));
    const manifestPath = path.resolve(compiledDir, "../../../../package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const port = Number(process.env.PORT ?? 3000);
const configuredApiKey = process.env.PSON_API_KEY?.trim() ?? "";
const enforceTenant = process.env.PSON_ENFORCE_TENANT === "true";
const tenantHeaderName = (process.env.PSON_TENANT_HEADER?.trim().toLowerCase() || "x-pson-tenant-id") as
  | "x-pson-tenant-id"
  | string;
const requireCallerId = process.env.PSON_REQUIRE_CALLER_ID === "true";
const enforceSubjectUserBinding = process.env.PSON_ENFORCE_SUBJECT_USER === "true";
const callerIdHeaderName = process.env.PSON_CALLER_ID_HEADER?.trim().toLowerCase() || "x-pson-caller-id";
const subjectUserHeaderName = process.env.PSON_SUBJECT_USER_HEADER?.trim().toLowerCase() || "x-pson-user-id";
const roleHeaderName = process.env.PSON_ROLE_HEADER?.trim().toLowerCase() || "x-pson-role";
const scopeHeaderName = process.env.PSON_SCOPE_HEADER?.trim().toLowerCase() || "x-pson-scopes";
const accessAuditEnabled = process.env.PSON_ACCESS_AUDIT_ENABLED !== "false";
const accessAuditFilename = process.env.PSON_ACCESS_AUDIT_FILENAME?.trim() || "api-access.jsonl";
const jwtSecret = process.env.PSON_JWT_SECRET?.trim() ?? "";
const jwtPublicKey = process.env.PSON_JWT_PUBLIC_KEY?.trim() ?? "";
const jwtJwksJson = process.env.PSON_JWKS_JSON?.trim() ?? "";
const jwtJwksPath = process.env.PSON_JWKS_PATH?.trim() ?? "";
const jwtJwksUrl = process.env.PSON_JWKS_URL?.trim() ?? "";
const jwtJwksCacheTtlMs = Number(process.env.PSON_JWKS_CACHE_TTL_MS ?? 300000);
const jwtJwksTimeoutMs = Number(process.env.PSON_JWKS_TIMEOUT_MS ?? 5000);
const requireSignedIdentity = process.env.PSON_REQUIRE_SIGNED_IDENTITY === "true";
const jwtIssuer = process.env.PSON_JWT_ISSUER?.trim();
const jwtAudience = process.env.PSON_JWT_AUDIENCE?.trim();
const jwtCallerIdClaim = process.env.PSON_JWT_CALLER_ID_CLAIM?.trim() || "sub";
const jwtTenantClaim = process.env.PSON_JWT_TENANT_CLAIM?.trim() || "tenant_id";
const jwtSubjectUserClaim = process.env.PSON_JWT_USER_ID_CLAIM?.trim() || "user_id";
const jwtRoleClaim = process.env.PSON_JWT_ROLE_CLAIM?.trim() || "role";
const jwtScopesClaim = process.env.PSON_JWT_SCOPES_CLAIM?.trim() || "scopes";

type RouteAccessLevel = "anonymous" | "viewer" | "editor" | "admin";
type CallerRole = "anonymous" | "viewer" | "editor" | "admin";
type AuthSource = "none" | "api_key" | "jwt";
type SignedIdentityMode = "none" | "hs256" | "public_key" | "jwks";

interface JwtIdentityClaims {
  callerId: string | null;
  tenantId: string | null;
  subjectUserId: string | null;
  role: CallerRole;
  scopes: Set<string>;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwksKeyRecord {
  kid?: string;
  alg?: string;
  kty?: string;
  use?: string;
  [key: string]: unknown;
}

interface JwksDocument {
  keys: JwksKeyRecord[];
}

interface CallerContext {
  callerId: string | null;
  subjectUserId: string | null;
  role: CallerRole;
  scopes: Set<string>;
  authSource: AuthSource;
}

interface RemoteToolRoutePolicy {
  requiredRole: RouteAccessLevel;
  requiredScopes: string[];
  operation: string;
}

interface ApiAccessAuditRecord {
  method: string;
  route: string;
  operation: string;
  decision: "allowed" | "denied";
  status_code: number;
  reason?: string;
  request_id?: string;
  auth_source?: AuthSource;
  caller_id?: string | null;
  subject_user_id?: string | null;
  caller_role?: CallerRole;
  caller_scopes?: string[];
  tenant_id?: string | null;
  profile_id?: string | null;
  user_id?: string | null;
  required_role?: RouteAccessLevel;
  required_scopes?: string[];
  redaction_applied?: boolean;
  redaction_level?: "full" | "safe";
  duration_ms?: number;
}

const REQUEST_ID_HEADER = "x-pson-request-id";
const REQUEST_ID_SYMBOL = Symbol.for("pson5.request.id");
const REQUEST_STARTED_SYMBOL = Symbol.for("pson5.request.startedAt");

function attachRequestId(
  request: import("node:http").IncomingMessage,
  existing?: string | null
): string {
  const incoming = existing?.trim();
  const id = incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : `req_${randomUUID()}`;
  (request as unknown as { [key: symbol]: string })[REQUEST_ID_SYMBOL] = id;
  (request as unknown as { [key: symbol]: number })[REQUEST_STARTED_SYMBOL] = Date.now();
  return id;
}

function getRequestId(request: import("node:http").IncomingMessage): string | null {
  const value = (request as unknown as { [key: symbol]: unknown })[REQUEST_ID_SYMBOL];
  return typeof value === "string" ? value : null;
}

function getRequestDurationMs(request: import("node:http").IncomingMessage): number | undefined {
  const startedAt = (request as unknown as { [key: symbol]: unknown })[REQUEST_STARTED_SYMBOL];
  return typeof startedAt === "number" ? Date.now() - startedAt : undefined;
}

interface JsonRpcRequestBody {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

interface JsonRpcSuccessPayload {
  body: string;
  statusCode: number;
  headers: Record<string, string>;
}

let remoteJwksCache: {
  document: JwksDocument | null;
  fetchedAt: number;
} = {
  document: null,
  fetchedAt: 0
};

function json(body: unknown, statusCode = 200): { body: string; statusCode: number; headers: Record<string, string> } {
  return {
    body: JSON.stringify(
      {
        data: body,
        meta: {
          version: "v1",
          request_id: `req_${Date.now()}`,
          timestamp: new Date().toISOString()
        }
      },
      null,
      2
    ),
    statusCode,
    headers: {
      "content-type": "application/json"
    }
  };
}

function errorJson(
  code: string,
  message: string,
  statusCode: number,
  details: unknown[] = []
): { body: string; statusCode: number; headers: Record<string, string> } {
  return {
    body: JSON.stringify(
      {
        error: {
          code,
          message,
          details
        },
        meta: {
          version: "v1",
          request_id: `req_${Date.now()}`,
          timestamp: new Date().toISOString()
        }
      },
      null,
      2
    ),
    statusCode,
    headers: {
      "content-type": "application/json"
    }
  };
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcSuccessPayload {
  return {
    body: JSON.stringify(
      {
        jsonrpc: "2.0",
        id,
        result
      },
      null,
      2
    ),
    statusCode: 200,
    headers: {
      "content-type": "application/json"
    }
  };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcSuccessPayload {
  return {
    body: JSON.stringify(
      {
        jsonrpc: "2.0",
        id,
        error: {
          code,
          message,
          ...(data !== undefined ? { data } : {})
        }
      },
      null,
      2
    ),
    statusCode: 200,
    headers: {
      "content-type": "application/json"
    }
  };
}

// Cap request body size to prevent DoS via large uploads. Overridable via
// PSON_MAX_REQUEST_BYTES in the environment (min 1KB, max 50MB).
const DEFAULT_MAX_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MB

function resolveMaxRequestBytes(): number {
  const raw = process.env.PSON_MAX_REQUEST_BYTES;
  if (!raw) return DEFAULT_MAX_REQUEST_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1024) return DEFAULT_MAX_REQUEST_BYTES;
  return Math.min(parsed, 50 * 1024 * 1024);
}

const MAX_REQUEST_BYTES = resolveMaxRequestBytes();

async function readJson(
  request: import("node:http").IncomingMessage,
  options: { maxBytes?: number } = {}
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? MAX_REQUEST_BYTES;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      // Drain the rest so the client doesn't hang, then throw.
      request.destroy();
      throw errorJson(
        "payload_too_large",
        `Request body exceeds ${maxBytes} bytes (set PSON_MAX_REQUEST_BYTES to raise).`,
        413
      );
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (err) {
    throw errorJson(
      "invalid_json",
      err instanceof Error ? err.message : "Request body is not valid JSON.",
      400
    );
  }
}

function getUrl(requestUrl: string): URL {
  return new URL(requestUrl, "http://localhost");
}

function writePayload(
  response: import("node:http").ServerResponse<import("node:http").IncomingMessage>,
  payload: { body: string; statusCode: number; headers: Record<string, string> }
): void {
  const headers = { ...payload.headers };
  const request = response.req;
  if (request) {
    const requestId = getRequestId(request);
    if (requestId) {
      headers[REQUEST_ID_HEADER] = requestId;
    }
  }
  response.writeHead(payload.statusCode, headers);
  response.end(payload.body);
}

const MCP_SESSION_HEADER = "mcp-session-id";
const OPENAI_SUBJECT_META_KEY = "openai/subject";
const allowMcpArgumentSubjectFallback = process.env.PSON_MCP_ALLOW_ARGUMENT_SUBJECT_FALLBACK !== "false";

/**
 * Ensure a Streamable HTTP session id is in scope for the current MCP
 * exchange and propagate it to the response. Per the MCP 2025-03-26
 * Streamable HTTP transport, the server issues an `Mcp-Session-Id`
 * header on the initialize response and the client echoes it on
 * subsequent requests. We accept whatever the client sends back, and
 * mint a fresh UUID when none is provided (i.e. on the first request).
 *
 * Validation of returning session ids is intentionally permissive — we
 * don't track session state server-side because every MCP method we
 * expose is stateless. The header is still set so transports that
 * insist on its presence (notably the OpenAI/ChatGPT Apps client) keep
 * the connection.
 */
function ensureMcpSessionId(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse<import("node:http").IncomingMessage>
): string {
  const incoming = request.headers[MCP_SESSION_HEADER];
  const provided = Array.isArray(incoming) ? incoming[0] : incoming;
  const sessionId = typeof provided === "string" && provided.length > 0 ? provided : randomUUID();
  response.setHeader("Mcp-Session-Id", sessionId);
  return sessionId;
}

function isPrivilegedCaller(caller: CallerContext): boolean {
  return caller.role === "admin" || caller.scopes.has("profiles:admin");
}

function applyProfileRedactionForCaller(
  profile: PsonProfile,
  caller: CallerContext,
  requestedLevel?: "full" | "safe" | null
): { profile: PsonProfile; applied: boolean; level: "full" | "safe" } {
  if (requestedLevel === "safe") {
    return { profile: redactProfileForExport(profile, "safe"), applied: true, level: "safe" };
  }

  if (requestedLevel === "full" || isPrivilegedCaller(caller)) {
    return { profile, applied: false, level: "full" };
  }

  return { profile: redactProfileForExport(profile, "safe"), applied: true, level: "safe" };
}

async function appendApiAccessAuditLog(
  record: ApiAccessAuditRecord,
  storeOptions: ProfileStoreOptions
): Promise<void> {
  if (!accessAuditEnabled) {
    return;
  }

  const auditDir = path.join(resolveStoreRoot(storeOptions), "audit");
  const auditPath = path.join(auditDir, accessAuditFilename);
  const payload = {
    timestamp: new Date().toISOString(),
    ...record
  };

  await mkdir(auditDir, { recursive: true });
  await writeFile(auditPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8", flag: "a" });
}

function getErrorMessageFromPayload(payload: ReturnType<typeof errorJson>): string {
  try {
    const parsed = JSON.parse(payload.body) as { error?: { message?: string } };
    return parsed.error?.message ?? "Unknown error.";
  } catch {
    return "Unknown error.";
  }
}

function jsonRpcToolAuthError(
  id: string | number | null,
  payload: ReturnType<typeof errorJson>
): JsonRpcSuccessPayload {
  return jsonRpcError(
    id,
    -32001,
    `Unauthorized or invalid tool call: ${getErrorMessageFromPayload(payload)}`,
    payload
  );
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function encodeBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePem(value: string): string {
  return value.replace(/\\n/gu, "\n");
}

function getSignedIdentityMode(): SignedIdentityMode {
  if (jwtJwksJson || jwtJwksPath || jwtJwksUrl) {
    return "jwks";
  }

  if (jwtPublicKey) {
    return "public_key";
  }

  if (jwtSecret) {
    return "hs256";
  }

  return "none";
}

function parseJwksDocument(rawValue: string): JwksDocument | null {
  try {
    const parsed = JSON.parse(rawValue.replace(/^\uFEFF/u, "").trim()) as { keys?: unknown };
    const keys = Array.isArray(parsed.keys)
      ? parsed.keys.filter((value): value is JwksKeyRecord => typeof value === "object" && value !== null)
      : [];

    return { keys };
  } catch {
    return null;
  }
}

async function fetchRemoteJwks(forceRefresh = false): Promise<JwksDocument | null> {
  if (!jwtJwksUrl) {
    return null;
  }

  const cacheIsFresh =
    !forceRefresh &&
    remoteJwksCache.document !== null &&
    Date.now() - remoteJwksCache.fetchedAt < jwtJwksCacheTtlMs;

  if (cacheIsFresh) {
    return remoteJwksCache.document;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), jwtJwksTimeoutMs);

  try {
    const response = await fetch(jwtJwksUrl, {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return remoteJwksCache.document;
    }

    const raw = await response.text();
    const document = parseJwksDocument(raw);
    if (!document) {
      return remoteJwksCache.document;
    }

    remoteJwksCache = {
      document,
      fetchedAt: Date.now()
    };

    return document;
  } catch {
    return remoteJwksCache.document;
  } finally {
    clearTimeout(timeout);
  }
}

async function getConfiguredJwks(forceRefresh = false): Promise<JwksDocument | null> {
  const rawValue = jwtJwksJson
    || (jwtJwksPath && existsSync(jwtJwksPath) ? readFileSync(jwtJwksPath, "utf8") : "");

  if (rawValue) {
    return parseJwksDocument(rawValue);
  }

  return fetchRemoteJwks(forceRefresh);
}

async function selectJwksKey(header: JwtHeader): Promise<JwksKeyRecord | null> {
  const jwks = await getConfiguredJwks(false);
  if (!jwks || jwks.keys.length === 0) {
    return null;
  }

  const compatibleKeys = jwks.keys.filter((key) => {
    if (key.use && key.use !== "sig") {
      return false;
    }

    if (header.alg && key.alg && key.alg !== header.alg) {
      return false;
    }

    return true;
  });

  if (header.kid) {
    const directMatch = compatibleKeys.find((key) => key.kid === header.kid) ?? null;
    if (directMatch) {
      return directMatch;
    }

    if (jwtJwksUrl) {
      const refreshed = await getConfiguredJwks(true);
      const refreshedMatch = refreshed?.keys.find((key) => {
        if (key.kid !== header.kid) {
          return false;
        }

        if (key.use && key.use !== "sig") {
          return false;
        }

        if (header.alg && key.alg && key.alg !== header.alg) {
          return false;
        }

        return true;
      });

      return refreshedMatch ?? null;
    }

    return null;
  }

  return compatibleKeys.length === 1 ? compatibleKeys[0] : null;
}

function verifyHs256Signature(signingInput: string, encodedSignature: string): boolean {
  if (!jwtSecret) {
    return false;
  }

  const expectedSignature = encodeBase64Url(
    createHmac("sha256", jwtSecret).update(signingInput).digest()
  );

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(encodedSignature, "utf8");

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function verifyRs256Signature(signingInput: string, encodedSignature: string, header: JwtHeader): Promise<boolean> {
  const signature = Buffer.from(
    encodedSignature.replace(/-/gu, "+").replace(/_/gu, "/"),
    "base64"
  );

  const jwksKey = await selectJwksKey(header);
  const publicKeyInput = jwksKey
    ? createPublicKey({ key: jwksKey as never, format: "jwk" })
    : jwtPublicKey
      ? createPublicKey(normalizePem(jwtPublicKey))
      : null;

  if (!publicKeyInput) {
    return false;
  }

  return verifySignature("RSA-SHA256", Buffer.from(signingInput, "utf8"), publicKeyInput, signature);
}

async function auditDenied(
  request: import("node:http").IncomingMessage,
  storeOptions: ProfileStoreOptions,
  payload: ReturnType<typeof errorJson>,
  options: Omit<ApiAccessAuditRecord, "method" | "route" | "decision" | "status_code"> & {
    operation: string;
  }
): Promise<void> {
  await appendApiAccessAuditLog(
    {
      method: request.method ?? "UNKNOWN",
      route: request.url ? getUrl(request.url).pathname : "unknown",
      operation: options.operation,
      decision: "denied",
      status_code: payload.statusCode,
      reason: options.reason ?? getErrorMessageFromPayload(payload),
      request_id: getRequestId(request) ?? undefined,
      duration_ms: getRequestDurationMs(request),
      auth_source: options.auth_source,
      caller_id: options.caller_id ?? null,
      subject_user_id: options.subject_user_id ?? null,
      caller_role: options.caller_role,
      caller_scopes: options.caller_scopes,
      tenant_id: options.tenant_id ?? null,
      profile_id: options.profile_id ?? null,
      user_id: options.user_id ?? null,
      required_role: options.required_role,
      required_scopes: options.required_scopes
    },
    storeOptions
  );
}

async function auditAllowed(
  request: import("node:http").IncomingMessage,
  storeOptions: ProfileStoreOptions,
  options: Omit<ApiAccessAuditRecord, "method" | "route" | "decision" | "status_code"> & {
    operation: string;
    status_code?: number;
  }
): Promise<void> {
  await appendApiAccessAuditLog(
    {
      method: request.method ?? "UNKNOWN",
      route: request.url ? getUrl(request.url).pathname : "unknown",
      operation: options.operation,
      decision: "allowed",
      status_code: options.status_code ?? 200,
      reason: options.reason,
      request_id: getRequestId(request) ?? undefined,
      duration_ms: getRequestDurationMs(request),
      auth_source: options.auth_source,
      caller_id: options.caller_id ?? null,
      subject_user_id: options.subject_user_id ?? null,
      caller_role: options.caller_role,
      caller_scopes: options.caller_scopes,
      tenant_id: options.tenant_id ?? null,
      profile_id: options.profile_id ?? null,
      user_id: options.user_id ?? null,
      required_role: options.required_role,
      required_scopes: options.required_scopes,
      redaction_applied: options.redaction_applied,
      redaction_level: options.redaction_level
    },
    storeOptions
  );
}

function getHeaderValue(
  request: import("node:http").IncomingMessage,
  headerName: string
): string | undefined {
  const raw = request.headers[headerName];
  if (typeof raw === "string") {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    return raw[0]?.trim();
  }

  return undefined;
}

function getBearerToken(request: import("node:http").IncomingMessage): string | undefined {
  const authorization = getHeaderValue(request, "authorization");
  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/iu);
  return match?.[1]?.trim();
}

async function verifyJwtToken(token: string): Promise<{ ok: true; claims: JwtIdentityClaims } | { ok: false; message: string }> {
  if (getSignedIdentityMode() === "none") {
    return { ok: false, message: "Signed identity is not configured." };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, message: "Bearer token is not a valid JWT." };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = decodeBase64Url(encodedHeader);
  const payloadJson = decodeBase64Url(encodedPayload);

  if (!headerJson || !payloadJson) {
    return { ok: false, message: "JWT could not be decoded." };
  }

  let header: JwtHeader | null = null;
  let payload: Record<string, unknown> | null = null;

  try {
    header = asObject(JSON.parse(headerJson)) as JwtHeader | null;
    payload = asObject(JSON.parse(payloadJson));
  } catch {
    return { ok: false, message: "JWT JSON content is invalid." };
  }

  if (!header || !payload) {
    return { ok: false, message: "JWT payload is invalid." };
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  if (header.alg === "HS256") {
    if (!verifyHs256Signature(signingInput, encodedSignature)) {
      return { ok: false, message: "JWT signature verification failed." };
    }
  } else if (header.alg === "RS256") {
    if (!(await verifyRs256Signature(signingInput, encodedSignature, header))) {
      return { ok: false, message: "JWT signature verification failed." };
    }
  } else {
    return { ok: false, message: "Only HS256 and RS256 JWTs are supported in this runtime." };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSeconds) {
    return { ok: false, message: "JWT is expired." };
  }

  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) {
    return { ok: false, message: "JWT is not yet active." };
  }

  if (jwtIssuer && payload.iss !== jwtIssuer) {
    return { ok: false, message: "JWT issuer is invalid." };
  }

  if (jwtAudience) {
    const audienceMatches =
      payload.aud === jwtAudience ||
      (Array.isArray(payload.aud) && payload.aud.includes(jwtAudience));
    if (!audienceMatches) {
      return { ok: false, message: "JWT audience is invalid." };
    }
  }

  const rawScopes =
    Array.isArray(payload[jwtScopesClaim])
      ? payload[jwtScopesClaim]
      : typeof payload[jwtScopesClaim] === "string"
        ? String(payload[jwtScopesClaim]).split(/[,\s]+/u)
        : typeof payload.scope === "string"
          ? String(payload.scope).split(/[,\s]+/u)
          : [];

  return {
    ok: true,
    claims: {
      callerId: typeof payload[jwtCallerIdClaim] === "string" ? String(payload[jwtCallerIdClaim]) : null,
      tenantId:
        typeof payload[jwtTenantClaim] === "string"
          ? String(payload[jwtTenantClaim])
          : typeof payload.tenant === "string"
            ? String(payload.tenant)
            : null,
      subjectUserId:
        typeof payload[jwtSubjectUserClaim] === "string"
          ? String(payload[jwtSubjectUserClaim])
          : typeof payload.uid === "string"
            ? String(payload.uid)
            : null,
      role: parseRole(typeof payload[jwtRoleClaim] === "string" ? String(payload[jwtRoleClaim]) : undefined),
      scopes: new Set(rawScopes.filter((value): value is string => typeof value === "string" && value.length > 0))
    }
  };
}

async function authenticateRequest(
  request: import("node:http").IncomingMessage
): Promise<{ ok: true; authSource: AuthSource; jwtClaims?: JwtIdentityClaims } | { ok: false; payload: ReturnType<typeof errorJson> }> {
  const bearerToken = getBearerToken(request);
  const signedIdentityMode = getSignedIdentityMode();

  if (signedIdentityMode !== "none") {
    if (bearerToken) {
      const verification = await verifyJwtToken(bearerToken);
      if (!verification.ok) {
        return {
          ok: false,
          payload: errorJson("unauthorized", verification.message, 401)
        };
      }

      return { ok: true, authSource: "jwt", jwtClaims: verification.claims };
    }

    if (requireSignedIdentity) {
      return {
        ok: false,
        payload: errorJson("unauthorized", "A signed bearer token is required.", 401)
      };
    }
  }

  if (!configuredApiKey) {
    return { ok: true, authSource: "none" };
  }

  const requestApiKey = getHeaderValue(request, "x-api-key") ?? (!jwtSecret ? bearerToken : undefined);
  if (requestApiKey !== configuredApiKey) {
    return {
      ok: false,
      payload: errorJson("unauthorized", "A valid API key is required.", 401)
    };
  }

  return { ok: true, authSource: "api_key" };
}

function parseRole(rawRole: string | undefined): CallerRole {
  switch ((rawRole ?? "").trim().toLowerCase()) {
    case "admin":
      return "admin";
    case "editor":
      return "editor";
    case "viewer":
      return "viewer";
    default:
      return "anonymous";
  }
}

function getCallerContext(
  request: import("node:http").IncomingMessage,
  auth: { authSource: AuthSource; jwtClaims?: JwtIdentityClaims },
  options?: { skipSubjectUserCheck?: boolean }
): { ok: true; context: CallerContext } | { ok: false; payload: ReturnType<typeof errorJson> } {
  const headerCallerId = getHeaderValue(request, callerIdHeaderName) ?? null;
  const headerSubjectUserId =
    getHeaderValue(request, subjectUserHeaderName) ??
    getHeaderValue(request, "openai-user-id") ??
    getHeaderValue(request, "openai-subject") ??
    null;
  const headerRole = parseRole(getHeaderValue(request, roleHeaderName));
  const headerScopes = new Set(
    (getHeaderValue(request, scopeHeaderName) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
  const jwtClaims = auth.jwtClaims;

  if (jwtClaims) {
    if (headerCallerId && jwtClaims.callerId && headerCallerId !== jwtClaims.callerId) {
      return {
        ok: false,
        payload: errorJson("caller_mismatch", "Caller header does not match signed identity.", 403)
      };
    }

    if (headerSubjectUserId && jwtClaims.subjectUserId && headerSubjectUserId !== jwtClaims.subjectUserId) {
      return {
        ok: false,
        payload: errorJson("subject_user_mismatch", "Subject user header does not match signed identity.", 403)
      };
    }
  }

  const callerId = jwtClaims?.callerId ?? headerCallerId;
  const subjectUserId = jwtClaims?.subjectUserId ?? headerSubjectUserId;

  // For api-key auth, presenting the shared secret IS the authorization
  // — the bearer holder is acting on behalf of the deployment owner.
  // We default that caller to `editor` so MCP discovery (initialize,
  // tools/list, …) and tool-call operations work out of the box.
  // Override via the role header when finer-grained ranking is needed,
  // or set PSON_DEFAULT_API_KEY_ROLE to lock it down. For JWT-issued
  // identities the role still comes from the signed claims, since each
  // user there has their own claims.
  const apiKeyDefaultRole = parseRole(
    process.env.PSON_DEFAULT_API_KEY_ROLE?.trim() ?? "editor"
  );
  const role =
    jwtClaims?.role ??
    (headerRole !== "anonymous"
      ? headerRole
      : auth.authSource === "api_key"
        ? apiKeyDefaultRole
        : headerRole);
  const scopes = jwtClaims?.scopes ?? headerScopes;

  if (requireCallerId && !callerId) {
    return {
      ok: false,
      payload: errorJson("caller_required", `Missing required caller header '${callerIdHeaderName}'.`, 400)
    };
  }

  if (enforceSubjectUserBinding && !subjectUserId && !options?.skipSubjectUserCheck) {
    return {
      ok: false,
      payload: errorJson("subject_user_required", `Missing required subject user header '${subjectUserHeaderName}'.`, 400)
    };
  }

  return {
    ok: true,
    context: {
      callerId,
      subjectUserId,
      role,
      scopes,
      authSource: auth.authSource
    }
  };
}

function roleSatisfiesRequirement(role: CallerRole, required: RouteAccessLevel): boolean {
  const ranking: Record<CallerRole, number> = {
    anonymous: 0,
    viewer: 1,
    editor: 2,
    admin: 3
  };

  return ranking[role] >= ranking[required];
}

function authorizeCaller(
  caller: CallerContext,
  options: {
    requiredRole: RouteAccessLevel;
    requiredScopes?: string[];
    operation: string;
  }
): { ok: true } | { ok: false; payload: ReturnType<typeof errorJson> } {
  if (roleSatisfiesRequirement(caller.role, options.requiredRole)) {
    return { ok: true };
  }

  if (options.requiredScopes?.some((scope) => caller.scopes.has(scope))) {
    return { ok: true };
  }

  return {
    ok: false,
    payload: errorJson(
      "forbidden",
      `Caller is not authorized for operation '${options.operation}'.`,
      403,
      [
        {
          required_role: options.requiredRole,
          required_scopes: options.requiredScopes ?? [],
          caller_role: caller.role,
          caller_scopes: [...caller.scopes]
        }
      ]
    )
  };
}

function getToolRoutePolicy(toolName: PsonAgentToolName): RemoteToolRoutePolicy {
  switch (toolName) {
    case "pson_load_profile_by_user_id":
      return {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "tool-load-profile-by-user-id"
      };
    case "pson_create_profile":
      return {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "tool-create-profile"
      };
    case "pson_ensure_profile":
      return {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read", "profiles:write"],
        operation: "tool-ensure-profile"
      };
    case "pson_get_agent_context":
      return {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read", "agent-context:read"],
        operation: "tool-agent-context"
      };
    case "pson_get_next_questions":
      return {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "tool-next-questions"
      };
    case "pson_learn":
      return {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "tool-learn"
      };
    case "pson_observe_fact":
      return {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "tool-observe-fact"
      };
    case "pson_simulate":
      return {
        requiredRole: "editor",
        requiredScopes: ["profiles:write", "simulation:run"],
        operation: "tool-simulate"
      };
    case "pson_get_provider_policy":
      return {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "tool-provider-policy"
      };
  }
}

function toOpenAiStyleTools(definitions: PsonAgentToolDefinition[]) {
  return definitions.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema
  }));
}

function toMcpTools(definitions: PsonAgentToolDefinition[]) {
  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: getMcpInputSchema(tool)
  }));
}

function getMcpInputSchema(tool: PsonAgentToolDefinition): Record<string, unknown> {
  const schema = structuredClone(tool.input_schema);
  if (
    tool.name !== "pson_load_profile_by_user_id" &&
    tool.name !== "pson_create_profile" &&
    tool.name !== "pson_ensure_profile"
  ) {
    return schema;
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((field) => field !== "user_id")
    : [];
  const properties = asObject(schema.properties);
  const userIdProperty = properties ? asObject(properties.user_id) : null;
  if (userIdProperty) {
    userIdProperty.description =
      "Do not provide this in ChatGPT Apps. The server derives it from authenticated MCP subject metadata.";
  }

  if (properties) {
    delete properties.user_id;
  }

  return {
    ...schema,
    required
  };
}

function getMcpToolCallMeta(
  params: Record<string, unknown>,
  requestBody?: JsonRpcRequestBody
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const bodyMeta = asObject(requestBody?._meta);
  const paramsMeta = asObject(params._meta);
  const argumentsMeta = asObject(asObject(params.arguments)?._meta);

  for (const meta of [bodyMeta, paramsMeta, argumentsMeta]) {
    if (meta) {
      Object.assign(merged, meta);
    }
  }

  return merged;
}

function getMcpMetaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNestedMcpMetaString(meta: Record<string, unknown>, pathParts: string[]): string | null {
  let current: unknown = meta;
  for (const part of pathParts) {
    const currentObject = asObject(current);
    if (!currentObject) {
      return null;
    }
    current = currentObject[part];
  }

  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function resolveMcpSubjectUserId(
  caller: CallerContext,
  params: Record<string, unknown>,
  requestBody?: JsonRpcRequestBody
): { ok: true; subjectUserId: string | null } | { ok: false; payload: ReturnType<typeof errorJson> } {
  const meta = getMcpToolCallMeta(params, requestBody);
  const metaSubjectUserId =
    getMcpMetaString(meta, OPENAI_SUBJECT_META_KEY) ??
    getNestedMcpMetaString(meta, ["openai", "subject"]);
  if (caller.subjectUserId && metaSubjectUserId && caller.subjectUserId !== metaSubjectUserId) {
    return {
      ok: false,
      payload: errorJson(
        "subject_user_mismatch",
        `Tool-call _meta["${OPENAI_SUBJECT_META_KEY}"] does not match the authenticated subject user.`,
        403
      )
    };
  }

  return { ok: true, subjectUserId: caller.subjectUserId ?? metaSubjectUserId };
}

function withMcpSubjectUser(caller: CallerContext, subjectUserId: string | null): CallerContext {
  if (!subjectUserId || caller.subjectUserId === subjectUserId) {
    return caller;
  }

  return {
    ...caller,
    subjectUserId
  };
}

function withMcpSubjectDefaultRole(caller: CallerContext): CallerContext {
  if (!caller.subjectUserId || caller.role !== "anonymous") {
    return caller;
  }

  const configuredRole = parseRole(process.env.PSON_DEFAULT_MCP_SUBJECT_ROLE?.trim() ?? "editor");
  return {
    ...caller,
    role: configuredRole === "anonymous" ? "editor" : configuredRole
  };
}

function canDeriveMcpSubjectFromUserIdTool(name: PsonAgentToolName): boolean {
  return (
    name === "pson_load_profile_by_user_id" ||
    name === "pson_create_profile" ||
    name === "pson_ensure_profile"
  );
}

async function resolveMcpCallerForTool(
  caller: CallerContext,
  subjectUserId: string | null,
  name: PsonAgentToolName,
  args: Record<string, unknown>,
  tenantId: string | null,
  storeOptions: ProfileStoreOptions
): Promise<{ ok: true; caller: CallerContext } | { ok: false; payload: ReturnType<typeof errorJson> }> {
  const argumentUserId = typeof args.user_id === "string" && args.user_id.trim().length > 0
    ? args.user_id.trim()
    : null;
  let resolvedSubjectUserId =
    subjectUserId ??
    (allowMcpArgumentSubjectFallback && canDeriveMcpSubjectFromUserIdTool(name) ? argumentUserId : null);

  const profileId = typeof args.profile_id === "string" && args.profile_id.trim().length > 0
    ? args.profile_id.trim()
    : null;
  if (!resolvedSubjectUserId && profileId) {
    try {
      const profile = await loadProfile(profileId, storeOptions);
      const tenantAccess = assertTenantAccess(profile, tenantId);
      if (!tenantAccess.ok) {
        return { ok: false, payload: tenantAccess.payload };
      }
      resolvedSubjectUserId = profile.user_id;
    } catch (error) {
      if (error instanceof ProfileStoreError) {
        return {
          ok: false,
          payload: errorJson(error.storeCode, error.message, error.storeCode === "profile_not_found" ? 404 : 400)
        };
      }
      throw error;
    }
  }

  if (subjectUserId && argumentUserId && subjectUserId !== argumentUserId) {
    return {
      ok: false,
      payload: errorJson(
        "subject_user_mismatch",
        `Tool argument user_id does not match the authenticated MCP subject user.`,
        403
      )
    };
  }

  return {
    ok: true,
    caller: withMcpSubjectDefaultRole(withMcpSubjectUser(caller, resolvedSubjectUserId))
  };
}

function requiresMcpSubjectBeforeAuthorization(name: PsonAgentToolName): boolean {
  return true;
}

function normalizeMcpToolArguments(
  name: PsonAgentToolName,
  args: Record<string, unknown>,
  caller: CallerContext,
  tenantId: string | null
): Record<string, unknown> {
  const normalized = { ...args };
  if (
    (name === "pson_load_profile_by_user_id" ||
      name === "pson_create_profile" ||
      name === "pson_ensure_profile") &&
    typeof normalized.user_id !== "string" &&
    caller.subjectUserId
  ) {
    normalized.user_id = caller.subjectUserId;
  }

  if (
    (name === "pson_create_profile" || name === "pson_ensure_profile") &&
    typeof normalized.tenant_id !== "string" &&
    tenantId
  ) {
    normalized.tenant_id = tenantId;
  }

  return normalized;
}

function canAccessSubjectUser(caller: CallerContext, userId: string): boolean {
  if (!enforceSubjectUserBinding) {
    return true;
  }

  if (!caller.subjectUserId) {
    return false;
  }

  if (caller.subjectUserId === userId) {
    return true;
  }

  if (caller.role === "admin") {
    return true;
  }

  return caller.scopes.has("profiles:cross-user");
}

function assertSubjectUserAccess(
  caller: CallerContext,
  userId: string,
  label: string
): { ok: true } | { ok: false; payload: ReturnType<typeof errorJson> } {
  if (canAccessSubjectUser(caller, userId)) {
    return { ok: true };
  }

  return {
    ok: false,
    payload: errorJson(
      "subject_user_mismatch",
      `${label} is not accessible for subject user '${caller.subjectUserId ?? "unknown"}'.`,
      403
    )
  };
}

function getRequestTenantId(
  request: import("node:http").IncomingMessage,
  auth?: { jwtClaims?: JwtIdentityClaims }
): string | null {
  const headerTenantId = getHeaderValue(request, tenantHeaderName);
  const jwtTenantId = auth?.jwtClaims?.tenantId ?? null;

  if (jwtTenantId && headerTenantId && headerTenantId !== jwtTenantId) {
    return "__tenant_mismatch__";
  }

  const tenantId = jwtTenantId ?? headerTenantId;
  return tenantId && tenantId.length > 0 ? tenantId : null;
}

function validateTenantHeader(
  request: import("node:http").IncomingMessage,
  auth?: { jwtClaims?: JwtIdentityClaims }
): { ok: true; tenantId: string | null } | { ok: false; payload: ReturnType<typeof errorJson> } {
  const tenantId = getRequestTenantId(request, auth);

  if (tenantId === "__tenant_mismatch__") {
    return {
      ok: false,
      payload: errorJson("tenant_mismatch", "Tenant header does not match signed identity.", 403)
    };
  }

  if (enforceTenant && !tenantId) {
    return {
      ok: false,
      payload: errorJson("tenant_required", `Missing required tenant header '${tenantHeaderName}'.`, 400)
    };
  }

  return { ok: true, tenantId };
}

function assertTenantAccess(
  profile: { profile_id: string; tenant_id?: string },
  tenantId: string | null
): { ok: true } | { ok: false; payload: ReturnType<typeof errorJson> } {
  if (!enforceTenant) {
    return { ok: true };
  }

  if (!tenantId) {
    return {
      ok: false,
      payload: errorJson("tenant_required", `Missing required tenant header '${tenantHeaderName}'.`, 400)
    };
  }

  if (!profile.tenant_id) {
    return {
      ok: false,
      payload: errorJson(
        "tenant_mismatch",
        `Profile '${profile.profile_id}' has no tenant binding and cannot be accessed when tenant enforcement is enabled.`,
        403
      )
    };
  }

  if (profile.tenant_id !== tenantId) {
    return {
      ok: false,
      payload: errorJson("tenant_mismatch", `Profile '${profile.profile_id}' does not belong to tenant '${tenantId}'.`, 403)
    };
  }

  return { ok: true };
}

async function loadAuthorizedProfile(
  request: import("node:http").IncomingMessage,
  operation: string,
  profileId: string,
  tenantId: string | null,
  caller: CallerContext,
  storeOptions: ProfileStoreOptions
) {
  const profile = await loadProfile(profileId, storeOptions);
  const access = assertTenantAccess(profile, tenantId);
  if (!access.ok) {
    await auditDenied(request, storeOptions, access.payload, {
      operation,
      auth_source: caller.authSource,
      tenant_id: tenantId,
      caller_id: caller.callerId,
      subject_user_id: caller.subjectUserId,
      caller_role: caller.role,
      caller_scopes: [...caller.scopes],
      profile_id: profile.profile_id,
      user_id: profile.user_id
    });
    throw access.payload;
  }

  const userAccess = assertSubjectUserAccess(caller, profile.user_id, `Profile '${profileId}'`);
  if (!userAccess.ok) {
    await auditDenied(request, storeOptions, userAccess.payload, {
      operation,
      auth_source: caller.authSource,
      tenant_id: tenantId,
      caller_id: caller.callerId,
      subject_user_id: caller.subjectUserId,
      caller_role: caller.role,
      caller_scopes: [...caller.scopes],
      profile_id: profile.profile_id,
      user_id: profile.user_id
    });
    throw userAccess.payload;
  }

  return profile;
}

async function authorizeToolCall(
  request: import("node:http").IncomingMessage,
  caller: CallerContext,
  tenantId: string | null,
  toolCall: PsonAgentToolCall,
  storeOptions: ProfileStoreOptions
): Promise<void> {
  const policy = getToolRoutePolicy(toolCall.name);
  const authorization = authorizeCaller(caller, {
    requiredRole: policy.requiredRole,
    requiredScopes: policy.requiredScopes,
    operation: policy.operation
  });

  if (!authorization.ok) {
    await auditDenied(request, storeOptions, authorization.payload, {
      operation: policy.operation,
      tenant_id: tenantId,
      caller_id: caller.callerId,
      subject_user_id: caller.subjectUserId,
      caller_role: caller.role,
      caller_scopes: [...caller.scopes],
      required_role: policy.requiredRole,
      required_scopes: policy.requiredScopes
    });
    throw authorization.payload;
  }

  const args = toolCall.arguments ?? {};

  if (toolCall.name === "pson_create_profile" || toolCall.name === "pson_ensure_profile") {
    const userId = typeof args.user_id === "string" ? args.user_id : "";
    if (!userId) {
      throw errorJson("validation_error", `Tool ${toolCall.name} requires user_id.`, 400);
    }

    if (enforceTenant) {
      const bodyTenantId = typeof args.tenant_id === "string" ? args.tenant_id : null;
      if (bodyTenantId && bodyTenantId !== tenantId) {
        throw errorJson("tenant_mismatch", `Tool tenant_id must match header '${tenantHeaderName}'.`, 403);
      }
    }

    const subjectAccess = assertSubjectUserAccess(caller, userId, `User '${userId}'`);
    if (!subjectAccess.ok) {
      await auditDenied(request, storeOptions, subjectAccess.payload, {
        operation: policy.operation,
        tenant_id: tenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        user_id: userId,
        required_role: policy.requiredRole,
        required_scopes: policy.requiredScopes
      });
      throw subjectAccess.payload;
    }

    return;
  }

  if (toolCall.name === "pson_load_profile_by_user_id") {
    const userId = typeof args.user_id === "string" ? args.user_id : "";
    if (!userId) {
      throw errorJson("validation_error", "Tool pson_load_profile_by_user_id requires user_id.", 400);
    }

    const subjectAccess = assertSubjectUserAccess(caller, userId, `User '${userId}'`);
    if (!subjectAccess.ok) {
      await auditDenied(request, storeOptions, subjectAccess.payload, {
        operation: policy.operation,
        tenant_id: tenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        user_id: userId,
        required_role: policy.requiredRole,
        required_scopes: policy.requiredScopes
      });
      throw subjectAccess.payload;
    }

    const profile = await loadProfileByUserId(userId, storeOptions);
    const tenantAccess = assertTenantAccess(profile, tenantId);
    if (!tenantAccess.ok) {
      await auditDenied(request, storeOptions, tenantAccess.payload, {
        operation: policy.operation,
        tenant_id: tenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: policy.requiredRole,
        required_scopes: policy.requiredScopes
      });
      throw tenantAccess.payload;
    }

    return;
  }

  const profileId = typeof args.profile_id === "string" ? args.profile_id : "";
  if (!profileId) {
    throw errorJson("validation_error", `Tool ${toolCall.name} requires profile_id.`, 400);
  }

  await loadAuthorizedProfile(request, policy.operation, profileId, tenantId, caller, storeOptions);
}

async function buildStoreRuntime(): Promise<{
  storeOptions: ProfileStoreOptions;
  backend: string;
  storeRoot: string | null;
}> {
  const backend = (process.env.PSON_STORE_BACKEND ?? "file").trim().toLowerCase();
  const rootDir = process.env.PSON_STORE_DIR;

  if (backend === "memory") {
    return {
      storeOptions: {
        adapter: createMemoryProfileStoreAdapter()
      },
      backend: "memory",
      storeRoot: null
    };
  }

  if (backend === "postgres") {
    const connectionString =
      process.env.PSON_PG_CONNECTION_STRING?.trim() ?? process.env.DATABASE_URL?.trim() ?? "";

    if (!connectionString) {
      throw new Error("PSON_STORE_BACKEND=postgres requires PSON_PG_CONNECTION_STRING or DATABASE_URL.");
    }

    const pgModuleName = "pg";
    let pgModule: { Pool: new (config: { connectionString: string }) => { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }> } };
    try {
      pgModule = (await import(pgModuleName)) as typeof pgModule;
    } catch {
      throw new Error("Postgres backend requires the 'pg' package to be installed in the runtime environment.");
    }

    const { createDocumentProfileStoreAdapter } = await import("@pson5/serialization-engine");
    const {
      createPostgresProfileStoreArtifacts,
      createPostgresProfileStoreRepository,
      createPostgresQueryExecutor
    } = await import("@pson5/postgres-store");

    const pool = new pgModule.Pool({ connectionString });
    const executor = createPostgresQueryExecutor({
      async query<TRow extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) {
        return pool.query(sql, params) as Promise<{ rows: TRow[]; rowCount?: number }>;
      }
    });
    const schema = process.env.PSON_PG_SCHEMA?.trim() || "public";
    const artifacts = createPostgresProfileStoreArtifacts({ schema });

    if (process.env.PSON_PG_APPLY_SCHEMA === "true") {
      await executor(artifacts.schemaSql);
    }

    return {
      storeOptions: {
        adapter: createDocumentProfileStoreAdapter(createPostgresProfileStoreRepository(executor, { schema }))
      },
      backend: "postgres",
      storeRoot: null
    };
  }

  const storeRoot = resolveStoreRoot({ rootDir });
  return {
    storeOptions: { rootDir: storeRoot },
    backend: "file",
    storeRoot
  };
}

const storeRuntime = await buildStoreRuntime();

const server = createServer(async (request, response) => {
  const requestId = attachRequestId(request, request.headers[REQUEST_ID_HEADER] as string | undefined);
  response.setHeader(REQUEST_ID_HEADER, requestId);

  try {
    if (!request.url || !request.method) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "bad_request", message: "Missing request metadata." } }));
      return;
    }

    const url = getUrl(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const payload = json({
        status: "ok",
        service: "@pson5/api",
        provider: getProviderStatusFromEnv(storeRuntime.storeOptions),
        security: {
          api_key_required: configuredApiKey.length > 0,
          signed_identity_enabled: getSignedIdentityMode() !== "none",
          signed_identity_required: requireSignedIdentity,
          signed_identity_mode: getSignedIdentityMode(),
          jwt_issuer: jwtIssuer ?? null,
          jwt_audience: jwtAudience ?? null,
          jwks_url: jwtJwksUrl || null,
          jwks_cache_ttl_ms: getSignedIdentityMode() === "jwks" ? jwtJwksCacheTtlMs : null,
          tenant_enforced: enforceTenant,
          tenant_header: tenantHeaderName,
          caller_id_required: requireCallerId,
          caller_id_header: callerIdHeaderName,
          subject_user_enforced: enforceSubjectUserBinding,
          subject_user_header: subjectUserHeaderName,
          role_header: roleHeaderName,
          scope_header: scopeHeaderName
        },
        store: {
          backend: storeRuntime.backend,
          root_dir: storeRuntime.storeRoot
        }
      });
      writePayload(response, payload);
      return;
    }

    // GET on the MCP endpoint must be handled before the auth/tenant/
    // caller chain so the static 405 response is reachable without
    // credentials. Streamable HTTP clients (including OpenAI's ChatGPT
    // App scanner) probe this with GET to test whether the server
    // pushes notifications via SSE; we return 405 to signal sync-only
    // and they fall back to POST. Returning 405 from behind the auth
    // gate would have made the scanner see a 400 about missing user
    // headers instead — which it interprets as "endpoint exists but
    // not usable" and bails on verification.
    if (request.method === "GET" && url.pathname === "/v1/mcp") {
      response.setHeader("Allow", "POST");
      writePayload(
        response,
        errorJson(
          "method_not_allowed",
          "MCP endpoint is POST-only; this server does not push server-initiated messages.",
          405
        )
      );
      return;
    }

    // OpenAI ChatGPT Apps domain verification. The console asks for a
    // token to be served at this exact path so it can prove the
    // developer controls the origin. We pull the token from an env var
    // (so it can be rotated without redeploying code) and respond with
    // it as plain text. No auth — by design, this URL is meant to be
    // hit anonymously.
    if (
      request.method === "GET" &&
      url.pathname === "/.well-known/openai-apps-challenge"
    ) {
      const challengeToken = process.env.PSON_OPENAI_APPS_CHALLENGE_TOKEN?.trim() ?? "";
      if (!challengeToken) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Domain verification token not configured.");
        return;
      }
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(challengeToken);
      return;
    }

    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      await auditDenied(request, storeRuntime.storeOptions, auth.payload, {
        operation: "request-authentication",
        auth_source: "none"
      });
      writePayload(response, auth.payload);
      return;
    }

    const tenantValidation = validateTenantHeader(request, auth);
    if (!tenantValidation.ok) {
      await auditDenied(request, storeRuntime.storeOptions, tenantValidation.payload, {
        operation: "request-tenant-validation",
        auth_source: auth.authSource,
        tenant_id: getRequestTenantId(request, auth)
      });
      writePayload(response, tenantValidation.payload);
      return;
    }
    const requestTenantId = tenantValidation.tenantId;

    // The MCP endpoint multiplexes discovery methods (initialize,
    // tools/list, ping, prompts/list, resources/list, …) and the
    // user-data-touching tools/call. Discovery methods don't read or
    // write any user's profile, so requiring a subject user for them
    // rejects ChatGPT's app-scan probes — those run server-to-server
    // before any user is in the picture. We defer the subject-user
    // check into the /v1/mcp handler so it fires only on tools/call,
    // where ChatGPT supplies _meta["openai/subject"].
    const isMcpEndpoint = request.method === "POST" && url.pathname === "/v1/mcp";
    const callerValidation = getCallerContext(request, auth, {
      skipSubjectUserCheck: isMcpEndpoint
    });
    if (!callerValidation.ok) {
      await auditDenied(request, storeRuntime.storeOptions, callerValidation.payload, {
        operation: "request-caller-validation",
        auth_source: auth.authSource,
        tenant_id: requestTenantId,
        caller_id: auth.jwtClaims?.callerId ?? getHeaderValue(request, callerIdHeaderName) ?? null,
        subject_user_id: auth.jwtClaims?.subjectUserId ?? getHeaderValue(request, subjectUserHeaderName) ?? null
      });
      writePayload(response, callerValidation.payload);
      return;
    }
    const caller = callerValidation.context;

    if (request.method === "GET" && url.pathname === "/v1/pson/tools/definitions") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["system:read"],
        operation: "tools-definitions"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "tools-definitions",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["system:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const definitions = getPsonAgentToolDefinitions();
      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "tools-definitions",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        required_role: "viewer",
        required_scopes: ["system:read"]
      });
      writePayload(response, json({ tools: definitions, format: "pson" }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/pson/tools/openai") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["system:read"],
        operation: "tools-openai"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "tools-openai",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["system:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const definitions = toOpenAiStyleTools(getPsonAgentToolDefinitions());
      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "tools-openai",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        required_role: "viewer",
        required_scopes: ["system:read"]
      });
      writePayload(response, json({ tools: definitions, format: "openai" }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/mcp") {
      ensureMcpSessionId(request, response);
      const body = (await readJson(request)) as JsonRpcRequestBody;
      const id = body.id ?? null;

      if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
        writePayload(response, jsonRpcError(id, -32600, "Invalid JSON-RPC request."));
        return;
      }

      if (body.method === "notifications/initialized") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (body.method === "initialize") {
        const authorization = authorizeCaller(caller, {
          // MCP discovery is intentionally open — the request-level
          // bearer (when configured) is the gate. Initialize reveals
          // only the protocol version + capabilities, no user data.
          requiredRole: "anonymous",
          requiredScopes: ["system:read"],
          operation: "mcp-initialize"
        });
        if (!authorization.ok) {
          await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
            operation: "mcp-initialize",
            tenant_id: requestTenantId,
            caller_id: caller.callerId,
            subject_user_id: caller.subjectUserId,
            caller_role: caller.role,
            caller_scopes: [...caller.scopes],
            required_role: "viewer",
            required_scopes: ["system:read"]
          });
          writePayload(response, jsonRpcError(id, -32001, "Unauthorized.", authorization.payload));
          return;
        }

        await auditAllowed(request, storeRuntime.storeOptions, {
          operation: "mcp-initialize",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["system:read"]
        });

        writePayload(
          response,
          jsonRpcResult(id, {
            protocolVersion: "2025-03-26",
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
              prompts: { listChanged: false }
            },
            serverInfo: {
              name: "@pson5/api",
              version: apiPackageVersion
            }
          })
        );
        return;
      }

      if (body.method === "ping") {
        // Auth even the ping — otherwise an unauthenticated caller can probe
        // the server and confirm it exists, which is a trivial fingerprint
        // useful for reconnaissance.
        const authorization = authorizeCaller(caller, {
          requiredRole: "anonymous",
          requiredScopes: ["system:read"],
          operation: "mcp-ping"
        });
        if (!authorization.ok) {
          await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
            operation: "mcp-ping",
            tenant_id: requestTenantId,
            caller_id: caller.callerId,
            subject_user_id: caller.subjectUserId,
            caller_role: caller.role,
            caller_scopes: [...caller.scopes],
            required_role: "viewer",
            required_scopes: ["system:read"]
          });
          writePayload(response, jsonRpcError(id, -32001, "Unauthorized.", authorization.payload));
          return;
        }
        writePayload(response, jsonRpcResult(id, {}));
        return;
      }

      if (body.method === "tools/list") {
        const authorization = authorizeCaller(caller, {
          requiredRole: "anonymous",
          requiredScopes: ["system:read"],
          operation: "mcp-tools-list"
        });
        if (!authorization.ok) {
          await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
            operation: "mcp-tools-list",
            tenant_id: requestTenantId,
            caller_id: caller.callerId,
            subject_user_id: caller.subjectUserId,
            caller_role: caller.role,
            caller_scopes: [...caller.scopes],
            required_role: "viewer",
            required_scopes: ["system:read"]
          });
          writePayload(response, jsonRpcError(id, -32001, "Unauthorized.", authorization.payload));
          return;
        }

        await auditAllowed(request, storeRuntime.storeOptions, {
          operation: "mcp-tools-list",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["system:read"]
        });

        writePayload(response, jsonRpcResult(id, { tools: toMcpTools(getPsonAgentToolDefinitions()) }));
        return;
      }

      if (body.method === "tools/call") {
        const params = typeof body.params === "object" && body.params !== null ? body.params : {};
        const mcpSubject = resolveMcpSubjectUserId(caller, params, body);
        if (!mcpSubject.ok) {
          writePayload(response, jsonRpcToolAuthError(id, mcpSubject.payload));
          return;
        }

        const name = params.name;
        const args =
          typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments)
            ? params.arguments
            : {};
        const validToolNames = new Set(getPsonAgentToolDefinitions().map((tool) => tool.name));

        if (typeof name !== "string" || !validToolNames.has(name as PsonAgentToolName)) {
          writePayload(response, jsonRpcError(id, -32602, "Invalid tool call parameters."));
          return;
        }

        const mcpCallerResult = await resolveMcpCallerForTool(
          caller,
          mcpSubject.subjectUserId,
          name as PsonAgentToolName,
          args as Record<string, unknown>,
          requestTenantId,
          storeRuntime.storeOptions
        );
        if (!mcpCallerResult.ok) {
          writePayload(response, jsonRpcToolAuthError(id, mcpCallerResult.payload));
          return;
        }
        const mcpCaller = mcpCallerResult.caller;

        if (requiresMcpSubjectBeforeAuthorization(name as PsonAgentToolName) && !mcpCaller.subjectUserId) {
          const missingSubjectPayload = errorJson(
            "subject_user_required",
            `Tool ${name} requires a subject user before authorization. Provide '${subjectUserHeaderName}', 'openai-user-id', 'openai-subject', tool-call _meta["${OPENAI_SUBJECT_META_KEY}"], or arguments.user_id.`,
            400
          );
          writePayload(response, jsonRpcToolAuthError(id, missingSubjectPayload));
          return;
        }

        // tools/call is the only MCP method that touches user data, so
        // the subject-user binding is enforced here rather than in the
        // request-level caller-validation step (which is bypassed for
        // MCP so OpenAI's discovery probes — initialize, tools/list,
        // ping, …  — work without a user being in scope yet).
        if (enforceSubjectUserBinding && !mcpCaller.subjectUserId) {
          const missingSubjectPayload = errorJson(
            "subject_user_required",
            `Missing subject user for tools/call. Provide '${subjectUserHeaderName}', 'openai-user-id', 'openai-subject', tool-call _meta["${OPENAI_SUBJECT_META_KEY}"], or user_id for subject-bound profile tools.`,
            400
          );
          writePayload(
            response,
            jsonRpcToolAuthError(id, missingSubjectPayload)
          );
          return;
        }

        const toolCall: PsonAgentToolCall = {
          name: name as PsonAgentToolName,
          arguments: normalizeMcpToolArguments(
            name as PsonAgentToolName,
            args as Record<string, unknown>,
            mcpCaller,
            requestTenantId
          )
        };

        try {
          await authorizeToolCall(request, mcpCaller, requestTenantId, toolCall, storeRuntime.storeOptions);
        } catch (payload) {
          if (
            typeof payload === "object" &&
            payload !== null &&
            "body" in payload &&
            "statusCode" in payload &&
            "headers" in payload
          ) {
            writePayload(
              response,
              jsonRpcToolAuthError(
                id,
                payload as { body: string; statusCode: number; headers: Record<string, string> }
              )
            );
            return;
          }

          throw payload;
        }

        try {
          const toolClient = new PsonClient();
          const executor = createPsonAgentToolExecutor(toolClient, storeRuntime.storeOptions);
          const result = await executor.execute(toolCall);
          const policy = getToolRoutePolicy(toolCall.name);

          await auditAllowed(request, storeRuntime.storeOptions, {
            operation: `mcp-${policy.operation}`,
            tenant_id: requestTenantId,
            caller_id: mcpCaller.callerId,
            subject_user_id: mcpCaller.subjectUserId,
            caller_role: mcpCaller.role,
            caller_scopes: [...mcpCaller.scopes],
            profile_id: typeof toolCall.arguments.profile_id === "string" ? toolCall.arguments.profile_id : null,
            user_id: typeof toolCall.arguments.user_id === "string" ? toolCall.arguments.user_id : null,
            required_role: policy.requiredRole,
            required_scopes: policy.requiredScopes
          });

          writePayload(
            response,
            jsonRpcResult(id, {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ],
              structuredContent: result
            })
          );
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool execution failed.";
          writePayload(response, jsonRpcError(id, -32002, message));
          return;
        }
      }

      // MCP 2025-03-26 clients (notably ChatGPT Apps) call resources/list
      // and prompts/list during the handshake even when they don't intend
      // to use either surface. Returning -32601 for these makes some
      // clients reject the connection. We declare empty lists here; if we
      // later expose a `pson://profile/me` resource or a prompt template,
      // the existing capabilities block already advertises support.
      if (
        body.method === "resources/list" ||
        body.method === "resources/templates/list" ||
        body.method === "prompts/list"
      ) {
        const authorization = authorizeCaller(caller, {
          requiredRole: "anonymous",
          requiredScopes: ["system:read"],
          operation: `mcp-${body.method.replace("/", "-")}`
        });
        if (!authorization.ok) {
          writePayload(response, jsonRpcError(id, -32001, "Unauthorized.", authorization.payload));
          return;
        }
        const payload =
          body.method === "prompts/list"
            ? { prompts: [] }
            : body.method === "resources/templates/list"
              ? { resourceTemplates: [] }
              : { resources: [] };
        writePayload(response, jsonRpcResult(id, payload));
        return;
      }

      if (body.method === "resources/read" || body.method === "prompts/get") {
        // No resources or prompts are defined yet, so any read by URI or
        // prompt name is a not-found. Returning a structured JSON-RPC
        // error (rather than -32601) tells the client the method exists
        // but the requested item doesn't.
        writePayload(
          response,
          jsonRpcError(id, -32602, `No item registered for ${body.method}.`)
        );
        return;
      }

      writePayload(response, jsonRpcError(id, -32601, `Unsupported MCP method '${body.method}'.`));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/tools/execute") {
      const body = (await readJson(request)) as {
        name?: PsonAgentToolName;
        arguments?: Record<string, unknown>;
      };

      const validToolNames = new Set(getPsonAgentToolDefinitions().map((tool) => tool.name));
      if (!body.name || !validToolNames.has(body.name)) {
        writePayload(response, errorJson("validation_error", "A valid tool name is required.", 400));
        return;
      }

      const toolCall: PsonAgentToolCall = {
        name: body.name,
        arguments:
          typeof body.arguments === "object" && body.arguments !== null && !Array.isArray(body.arguments)
            ? body.arguments
            : {}
      };

      try {
        await authorizeToolCall(request, caller, requestTenantId, toolCall, storeRuntime.storeOptions);
      } catch (payload) {
        if (
          typeof payload === "object" &&
          payload !== null &&
          "body" in payload &&
          "statusCode" in payload &&
          "headers" in payload
        ) {
          writePayload(
            response,
            payload as { body: string; statusCode: number; headers: Record<string, string> }
          );
          return;
        }

        throw payload;
      }

      const toolClient = new PsonClient();
      const executor = createPsonAgentToolExecutor(toolClient, storeRuntime.storeOptions);
      const result = await executor.execute(toolCall);
      const policy = getToolRoutePolicy(toolCall.name);

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: policy.operation,
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: typeof toolCall.arguments.profile_id === "string" ? toolCall.arguments.profile_id : null,
        user_id: typeof toolCall.arguments.user_id === "string" ? toolCall.arguments.user_id : null,
        required_role: policy.requiredRole,
        required_scopes: policy.requiredScopes
      });

      writePayload(
        response,
        json({
          tool: toolCall.name,
          result
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/pson/provider/status") {
      const profileId = url.searchParams.get("profile_id");
      const operationParam = url.searchParams.get("operation");

      if (profileId) {
        const authorization = authorizeCaller(caller, {
          requiredRole: "viewer",
          requiredScopes: ["profiles:read"],
          operation: "provider-status"
        });
        if (!authorization.ok) {
          await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
            operation: "provider-status",
            tenant_id: requestTenantId,
            caller_id: caller.callerId,
            subject_user_id: caller.subjectUserId,
            caller_role: caller.role,
            caller_scopes: [...caller.scopes],
            profile_id: profileId,
            required_role: "viewer",
            required_scopes: ["profiles:read"]
          });
          writePayload(response, authorization.payload);
          return;
        }

        if (operationParam !== "modeling" && operationParam !== "simulation") {
          writePayload(response, errorJson("validation_error", "operation must be modeling or simulation.", 400));
          return;
        }

        const profile = await loadAuthorizedProfile(
          request,
          "provider-status",
          profileId,
          requestTenantId,
          caller,
          storeRuntime.storeOptions
        );
        await auditAllowed(request, storeRuntime.storeOptions, {
          operation: "provider-status",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          profile_id: profile.profile_id,
          user_id: profile.user_id,
          required_role: "viewer",
          required_scopes: ["profiles:read"]
        });
        writePayload(response, json(getProviderPolicyStatus(profile, operationParam, storeRuntime.storeOptions)));
        return;
      }

      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["system:read"],
        operation: "provider-status-global"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "provider-status-global",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["system:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "provider-status-global",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        required_role: "viewer",
        required_scopes: ["system:read"]
      });
      writePayload(response, json(getProviderStatusFromEnv(storeRuntime.storeOptions)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/pson/neo4j/status") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["system:read"],
        operation: "neo4j-status"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "neo4j-status",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["system:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "neo4j-status",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        required_role: "viewer",
        required_scopes: ["system:read"]
      });
      writePayload(response, json(await getNeo4jStatus(storeRuntime.storeOptions)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/init") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "profile-init"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "profile-init",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as InitProfileInput;
      if (enforceTenant) {
        if (body.tenant_id && body.tenant_id !== requestTenantId) {
          writePayload(
            response,
            errorJson("tenant_mismatch", `Body tenant_id must match header '${tenantHeaderName}'.`, 403)
          );
          return;
        }
      }

      const subjectAccess = assertSubjectUserAccess(caller, body.user_id, `User '${body.user_id}'`);
      if (!subjectAccess.ok) {
        await auditDenied(request, storeRuntime.storeOptions, subjectAccess.payload, {
          operation: "profile-init",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          user_id: body.user_id,
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, subjectAccess.payload);
        return;
      }

      const profile = await initProfile(
        {
          ...body,
          tenant_id: body.tenant_id ?? requestTenantId ?? undefined
        },
        storeRuntime.storeOptions
      );
      const access = assertTenantAccess(profile, requestTenantId);
      if (!access.ok) {
        await auditDenied(request, storeRuntime.storeOptions, access.payload, {
          operation: "profile-init",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          profile_id: profile.profile_id,
          user_id: profile.user_id,
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, access.payload);
        return;
      }

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "profile-init",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "editor",
        required_scopes: ["profiles:write"],
        status_code: 200
      });
      writePayload(
        response,
        json({
          profile_id: profile.profile_id,
          tenant_id: profile.tenant_id ?? null,
          revision: profile.metadata.revision,
          next_action: "learn"
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/question/next") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "question-next"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "question-next",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as {
        profile_id?: string;
        session_id?: string;
        domains?: string[];
        depth?: "light" | "standard" | "deep";
        limit?: number;
      };

      if (!body.profile_id) {
        writePayload(response, errorJson("validation_error", "profile_id is required.", 400));
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        "question-next",
        body.profile_id,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );

      const result = await getNextQuestions(
        body.profile_id,
        {
          session_id: body.session_id,
          domains: body.domains,
          depth: body.depth,
          limit: body.limit
        },
        storeRuntime.storeOptions
      );

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "question-next",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "editor",
        required_scopes: ["profiles:write"]
      });
      writePayload(
        response,
        json({ session_id: result.session.session_id, session: result.session, questions: result.questions })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/learn") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "learn"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "learn",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as {
        profile_id?: string;
        session_id?: string;
        domains?: string[];
        depth?: "light" | "standard" | "deep";
        domain?: string;
        answers?: Array<{ question_id: string; value: string | number | boolean | string[]; domain?: string }>;
        options?: {
          return_next_questions?: boolean;
          next_question_limit?: number;
        };
      };

      if (!body.profile_id || !body.answers || body.answers.length === 0) {
        writePayload(response, errorJson("validation_error", "profile_id and answers are required.", 400));
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        "learn",
        body.profile_id,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );

      const result = await submitLearningAnswers(
        {
          profile_id: body.profile_id,
          session_id: body.session_id,
          domains: body.domains,
          depth: body.depth,
          domain: body.domain,
          answers: body.answers,
          options: body.options
        },
        storeRuntime.storeOptions
      );

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "learn",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "editor",
        required_scopes: ["profiles:write"]
      });
      writePayload(
        response,
        json({
          session_id: result.session.session_id,
          session: result.session,
          revision: result.profile.metadata.revision,
          updated_fields: result.updated_fields,
          next_questions: result.next_questions
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/simulate") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "editor",
        requiredScopes: ["profiles:write", "simulation:run"],
        operation: "simulate"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "simulate",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "editor",
          required_scopes: ["profiles:write", "simulation:run"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as {
        profile_id?: string;
        context?: Record<string, unknown>;
        domains?: string[];
        options?: {
          include_reasoning?: boolean;
          include_evidence?: boolean;
          explanation_level?: "minimal" | "standard" | "detailed";
          scenario_label?: string;
        };
      };

      if (!body.profile_id || !body.context) {
        writePayload(response, errorJson("validation_error", "profile_id and context are required.", 400));
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        "simulate",
        body.profile_id,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );

      const result = await simulateStoredProfile(
        {
          profile_id: body.profile_id,
          context: body.context,
          domains: body.domains,
          options: body.options
        },
        storeRuntime.storeOptions
      );

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "simulate",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "editor",
        required_scopes: ["profiles:write", "simulation:run"]
      });
      writePayload(response, json(result));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/agent-context") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read", "agent-context:read"],
        operation: "agent-context"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "agent-context",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["profiles:read", "agent-context:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as {
        profile_id?: string;
        intent?: string;
        domains?: string[];
        max_items?: number;
        include_predictions?: boolean;
        min_confidence?: number;
        task_context?: Record<string, unknown>;
      };

      if (!body.profile_id || !body.intent) {
        writePayload(response, errorJson("validation_error", "profile_id and intent are required.", 400));
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        "agent-context",
        body.profile_id,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );

      const result = await buildStoredAgentContext(
        body.profile_id,
        {
          intent: body.intent,
          domains: body.domains,
          max_items: body.max_items,
          include_predictions: body.include_predictions,
          min_confidence: body.min_confidence,
          task_context: body.task_context
        },
        storeRuntime.storeOptions
      );

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "agent-context",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "viewer",
        required_scopes: ["profiles:read", "agent-context:read"]
      });
      writePayload(response, json(result));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/pson/graph/")) {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "graph-read"
      });
      if (!authorization.ok) {
        writePayload(response, authorization.payload);
        return;
      }

      const profileId = url.pathname.replace("/v1/pson/graph/", "");
      const profile = await loadAuthorizedProfile(
        request,
        "graph-read",
        profileId,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );
      writePayload(response, json(profile.knowledge_graph));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/neo4j/sync") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "editor",
        requiredScopes: ["profiles:write", "graph:write"],
        operation: "neo4j-sync"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "neo4j-sync",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "editor",
          required_scopes: ["profiles:write", "graph:write"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as { profile_id?: string };
      if (!body.profile_id) {
        writePayload(response, errorJson("validation_error", "profile_id is required.", 400));
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        "neo4j-sync",
        body.profile_id,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );
      const syncResult = await syncStoredProfileKnowledgeGraph(profile.profile_id, storeRuntime.storeOptions);
      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "neo4j-sync",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "editor",
        required_scopes: ["profiles:write", "graph:write"]
      });
      writePayload(response, json(syncResult));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/pson/state/")) {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "state-read"
      });
      if (!authorization.ok) {
        writePayload(response, authorization.payload);
        return;
      }

      const profileId = url.pathname.replace("/v1/pson/state/", "");
      const profile = await loadAuthorizedProfile(
        request,
        "state-read",
        profileId,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );
      writePayload(response, json(getActiveStateSnapshot(profile)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/pson/explain") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "explain"
      });
      if (!authorization.ok) {
        writePayload(response, authorization.payload);
        return;
      }

      const profileId = url.searchParams.get("profile_id");
      const prediction = url.searchParams.get("prediction");

      if (!profileId || !prediction) {
        writePayload(response, errorJson("validation_error", "profile_id and prediction are required.", 400));
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        "explain",
        profileId,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );
      writePayload(response, json({ support: explainPredictionSupport(profile, prediction) }));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/pson/profile/")) {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "profile-read"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "profile-read",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["profiles:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const profileId = url.pathname.replace("/v1/pson/profile/", "");
      const profile = await loadAuthorizedProfile(
        request,
        "profile-read",
        profileId,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );
      const requestedLevel = url.searchParams.get("redaction_level");
      if (requestedLevel !== null && requestedLevel !== "full" && requestedLevel !== "safe") {
        writePayload(response, errorJson("validation_error", "redaction_level must be full or safe.", 400));
        return;
      }
      if (requestedLevel === "full" && !isPrivilegedCaller(caller)) {
        const denial = errorJson(
          "forbidden",
          "Caller is not permitted to request an unredacted profile view.",
          403
        );
        await auditDenied(request, storeRuntime.storeOptions, denial, {
          operation: "profile-read",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          profile_id: profile.profile_id,
          user_id: profile.user_id
        });
        writePayload(response, denial);
        return;
      }
      const redaction = applyProfileRedactionForCaller(
        profile,
        caller,
        (requestedLevel as "full" | "safe" | null) ?? null
      );
      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "profile-read",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "viewer",
        required_scopes: ["profiles:read"],
        redaction_applied: redaction.applied,
        redaction_level: redaction.level
      });
      writePayload(response, json(redaction.profile));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/pson/profile-by-user") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["profiles:read"],
        operation: "profile-by-user"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "profile-by-user",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "viewer",
          required_scopes: ["profiles:read"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const userId = url.searchParams.get("user_id");
      if (!userId) {
        writePayload(response, errorJson("validation_error", "user_id query parameter is required.", 400));
        return;
      }

      const subjectAccess = assertSubjectUserAccess(caller, userId, `User '${userId}'`);
      if (!subjectAccess.ok) {
        await auditDenied(request, storeRuntime.storeOptions, subjectAccess.payload, {
          operation: "profile-by-user",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          user_id: userId,
          required_role: "viewer",
          required_scopes: ["profiles:read"]
        });
        writePayload(response, subjectAccess.payload);
        return;
      }

      const profile = await loadProfileByUserId(userId, storeRuntime.storeOptions);
      const access = assertTenantAccess(profile, requestTenantId);
      if (!access.ok) {
        await auditDenied(request, storeRuntime.storeOptions, access.payload, {
          operation: "profile-by-user",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          profile_id: profile.profile_id,
          user_id: profile.user_id,
          required_role: "viewer",
          required_scopes: ["profiles:read"]
        });
        writePayload(response, access.payload);
        return;
      }

      const profileIds = await findProfilesByUserId(userId, storeRuntime.storeOptions);
      const redaction = applyProfileRedactionForCaller(profile, caller, null);
      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "profile-by-user",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "viewer",
        required_scopes: ["profiles:read"],
        redaction_applied: redaction.applied,
        redaction_level: redaction.level
      });
      writePayload(
        response,
        json({ user_id: userId, profile: redaction.profile, profile_ids: profileIds })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/pson/export") {
      const profileId = url.searchParams.get("profile_id");
      const redactionLevel = url.searchParams.get("redaction_level");

      if (!profileId) {
        writePayload(response, errorJson("validation_error", "profile_id query parameter is required.", 400));
        return;
      }

      if (redactionLevel !== null && redactionLevel !== "full" && redactionLevel !== "safe") {
        writePayload(response, errorJson("validation_error", "redaction_level must be full or safe.", 400));
        return;
      }

      const authorization = authorizeCaller(caller, {
        requiredRole: redactionLevel === "full" ? "admin" : "viewer",
        requiredScopes: redactionLevel === "full" ? ["export:full"] : ["profiles:read", "export:safe"],
        operation: redactionLevel === "full" ? "export-full" : "export-safe"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: redactionLevel === "full" ? "export-full" : "export-safe",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          profile_id: profileId,
          required_role: redactionLevel === "full" ? "admin" : "viewer",
          required_scopes: redactionLevel === "full" ? ["export:full"] : ["profiles:read", "export:safe"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const profile = await loadAuthorizedProfile(
        request,
        redactionLevel === "full" ? "export-full" : "export-safe",
        profileId,
        requestTenantId,
        caller,
        storeRuntime.storeOptions
      );

      const document = await exportStoredProfile(profileId, {
        ...storeRuntime.storeOptions,
        redaction_level: redactionLevel === null ? undefined : redactionLevel
      });
      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: redactionLevel === "full" ? "export-full" : "export-safe",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: redactionLevel === "full" ? "admin" : "viewer",
        required_scopes: redactionLevel === "full" ? ["export:full"] : ["profiles:read", "export:safe"]
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(document);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/import") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "editor",
        requiredScopes: ["profiles:write"],
        operation: "import"
      });
      if (!authorization.ok) {
        await auditDenied(request, storeRuntime.storeOptions, authorization.payload, {
          operation: "import",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, authorization.payload);
        return;
      }

      const body = (await readJson(request)) as { document?: unknown; overwrite?: boolean };
      const importedDocument =
        typeof body.document === "object" && body.document !== null ? (body.document as Record<string, unknown>) : null;

      const importedUserId =
        importedDocument && typeof importedDocument.user_id === "string" ? importedDocument.user_id : undefined;
      if (importedUserId) {
        const subjectAccess = assertSubjectUserAccess(caller, importedUserId, `User '${importedUserId}'`);
        if (!subjectAccess.ok) {
          await auditDenied(request, storeRuntime.storeOptions, subjectAccess.payload, {
            operation: "import",
            tenant_id: requestTenantId,
            caller_id: caller.callerId,
            subject_user_id: caller.subjectUserId,
            caller_role: caller.role,
            caller_scopes: [...caller.scopes],
            user_id: importedUserId,
            required_role: "editor",
            required_scopes: ["profiles:write"]
          });
          writePayload(response, subjectAccess.payload);
          return;
        }
      }

      if (enforceTenant) {
        const documentTenantId =
          importedDocument && typeof importedDocument.tenant_id === "string" ? importedDocument.tenant_id : undefined;

        if (documentTenantId !== requestTenantId) {
          writePayload(
            response,
            errorJson("tenant_mismatch", `Imported profile tenant_id must match header '${tenantHeaderName}'.`, 403)
          );
          return;
        }
      }

      const profile = await importProfileDocument(body.document, {
        ...storeRuntime.storeOptions,
        overwrite: body.overwrite
      });
      const access = assertTenantAccess(profile, requestTenantId);
      if (!access.ok) {
        await auditDenied(request, storeRuntime.storeOptions, access.payload, {
          operation: "import",
          tenant_id: requestTenantId,
          caller_id: caller.callerId,
          subject_user_id: caller.subjectUserId,
          caller_role: caller.role,
          caller_scopes: [...caller.scopes],
          profile_id: profile.profile_id,
          user_id: profile.user_id,
          required_role: "editor",
          required_scopes: ["profiles:write"]
        });
        writePayload(response, access.payload);
        return;
      }

      await auditAllowed(request, storeRuntime.storeOptions, {
        operation: "import",
        tenant_id: requestTenantId,
        caller_id: caller.callerId,
        subject_user_id: caller.subjectUserId,
        caller_role: caller.role,
        caller_scopes: [...caller.scopes],
        profile_id: profile.profile_id,
        user_id: profile.user_id,
        required_role: "editor",
        required_scopes: ["profiles:write"]
      });
      writePayload(
        response,
        json({
          profile_id: profile.profile_id,
          tenant_id: profile.tenant_id ?? null,
          revision: profile.metadata.revision,
          imported: true
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pson/validate") {
      const authorization = authorizeCaller(caller, {
        requiredRole: "viewer",
        requiredScopes: ["system:read"],
        operation: "validate"
      });
      if (!authorization.ok) {
        writePayload(response, authorization.payload);
        return;
      }

      const body = await readJson(request);
      const result = validateProfile(body);
      writePayload(response, json(result, result.success ? 200 : 400));
      return;
    }

    writePayload(response, errorJson("not_found", "Route not found.", 404));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "body" in error &&
      "statusCode" in error &&
      "headers" in error
    ) {
      writePayload(
        response,
        error as { body: string; statusCode: number; headers: Record<string, string> }
      );
      return;
    }

    if (error instanceof ProfileStoreError) {
      const statusCode =
        error.storeCode === "profile_not_found"
          ? 404
          : error.storeCode === "conflict"
            ? 409
            : 400;
      writePayload(response, errorJson(error.storeCode, error.message, statusCode));
      return;
    }

    if (error instanceof PsonError) {
      const statusCode =
        error.code === "not_found"
          ? 404
          : error.code === "conflict"
            ? 409
            : error.code === "unauthorized"
              ? 401
              : error.code === "forbidden"
                ? 403
                : error.code === "payload_too_large"
                  ? 413
                  : error.code === "validation_error"
                    ? 400
                    : 500;
      writePayload(response, errorJson(error.code, error.message, statusCode));
      return;
    }

    writePayload(
      response,
      errorJson("internal_error", error instanceof Error ? error.message : "Unknown error.", 500)
    );
  }
});

// --- startup safety ----------------------------------------------------
//
// A hand-rolled HTTP server that defaults to permissive auth is a liability.
// Refuse to bind to a non-loopback interface when none of the three auth
// mechanisms is configured. Operators can opt out with
// PSON_ALLOW_UNAUTHED_BIND=true for deliberate local-network tests.
//
// Exit code 78 (EX_CONFIG from sysexits.h) — "configuration error".

const bindHost = process.env.HOST?.trim() || "0.0.0.0";
const isLoopback =
  bindHost === "127.0.0.1" ||
  bindHost === "localhost" ||
  bindHost === "::1" ||
  bindHost === "::ffff:127.0.0.1";

const hasAnyAuth = Boolean(
  configuredApiKey ||
    jwtSecret ||
    jwtPublicKey ||
    jwtJwksJson ||
    jwtJwksPath ||
    jwtJwksUrl
);

const allowUnauthedBind = process.env.PSON_ALLOW_UNAUTHED_BIND === "true";

if (!isLoopback && !hasAnyAuth && !allowUnauthedBind) {
  console.error(
    [
      "",
      "Refusing to start: PSON5 API is binding to a non-loopback address",
      `(HOST=${bindHost}) with no auth configured.`,
      "",
      "Set ONE of the following:",
      "  PSON_API_KEY=...                    (simple shared-secret auth)",
      "  PSON_JWT_SECRET=...                 (HS256 JWT)",
      "  PSON_JWT_PUBLIC_KEY=... / PSON_JWKS_URL=...   (asymmetric JWT)",
      "",
      "Or for deliberate local-network testing, explicitly set:",
      "  PSON_ALLOW_UNAUTHED_BIND=true",
      "",
      "See docs/usage/agent-auth.md for the full auth model.",
      ""
    ].join("\n")
  );
  process.exit(78);
}

if (!hasAnyAuth) {
  console.warn(
    `[pson5] no auth configured; listening on loopback only. ` +
      `Set PSON_API_KEY or PSON_JWT_* before exposing this API.`
  );
}

server.listen(port, () => {
  const location = storeRuntime.storeRoot ? ` using store ${storeRuntime.storeRoot}` : "";
  const authLabel = hasAnyAuth
    ? configuredApiKey
      ? "api-key auth"
      : "signed-identity auth"
    : "no auth (loopback only)";
  console.log(
    `PSON5 API listening on http://${bindHost}:${port} with backend ${storeRuntime.backend}${location} · ${authLabel}`
  );
});
