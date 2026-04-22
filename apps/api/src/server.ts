import { createServer } from "node:http";
import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InitProfileInput, ProfileStoreOptions } from "@pson5/core-types";
import { getNextQuestions, submitLearningAnswers } from "@pson5/acquisition-engine";
import { buildStoredAgentContext } from "@pson5/agent-context";
import { explainPredictionSupport } from "@pson5/graph-engine";
import { getProviderPolicyStatus, getProviderStatusFromEnv } from "@pson5/provider-engine";
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
import { simulateStoredProfile } from "@pson5/simulation-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

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

type RouteAccessLevel = "viewer" | "editor" | "admin";
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

interface ApiAccessAuditRecord {
  method: string;
  route: string;
  operation: string;
  decision: "allowed" | "denied";
  status_code: number;
  reason?: string;
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

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getUrl(requestUrl: string): URL {
  return new URL(requestUrl, "http://localhost");
}

function writePayload(
  response: import("node:http").ServerResponse<import("node:http").IncomingMessage>,
  payload: { body: string; statusCode: number; headers: Record<string, string> }
): void {
  response.writeHead(payload.statusCode, payload.headers);
  response.end(payload.body);
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
  auth: { authSource: AuthSource; jwtClaims?: JwtIdentityClaims }
): { ok: true; context: CallerContext } | { ok: false; payload: ReturnType<typeof errorJson> } {
  const headerCallerId = getHeaderValue(request, callerIdHeaderName) ?? null;
  const headerSubjectUserId = getHeaderValue(request, subjectUserHeaderName) ?? null;
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
  const role = jwtClaims?.role ?? headerRole;
  const scopes = jwtClaims?.scopes ?? headerScopes;

  if (requireCallerId && !callerId) {
    return {
      ok: false,
      payload: errorJson("caller_required", `Missing required caller header '${callerIdHeaderName}'.`, 400)
    };
  }

  if (enforceSubjectUserBinding && !subjectUserId) {
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

    const callerValidation = getCallerContext(request, auth);
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
      writePayload(response, json({ session_id: result.session.session_id, questions: result.questions }));
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
        required_scopes: ["profiles:read"]
      });
      writePayload(response, json(profile));
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
        required_scopes: ["profiles:read"]
      });
      writePayload(response, json({ user_id: userId, profile, profile_ids: profileIds }));
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
      const statusCode = error.code === "profile_not_found" ? 404 : error.code === "conflict" ? 409 : 400;
      writePayload(response, errorJson(error.code, error.message, statusCode));
      return;
    }

    writePayload(
      response,
      errorJson("internal_error", error instanceof Error ? error.message : "Unknown error.", 500)
    );
  }
});

server.listen(port, () => {
  const location = storeRuntime.storeRoot ? ` using store ${storeRuntime.storeRoot}` : "";
  console.log(`PSON5 API listening on http://localhost:${port} with backend ${storeRuntime.backend}${location}`);
});
