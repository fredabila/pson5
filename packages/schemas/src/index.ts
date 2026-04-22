import type { PsonProfile, ValidationIssue, ValidationResult } from "@pson5/core-types";
import { corePsonSchema } from "./core-schema.js";

const REQUIRED_ROOT_KEYS = [
  "pson_version",
  "profile_id",
  "user_id",
  "consent",
  "domains",
  "layers",
  "cognitive_model",
  "behavioral_model",
  "state_model",
  "knowledge_graph",
  "simulation_profiles",
  "privacy",
  "metadata"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function pushIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function validatePsonProfile(input: unknown): ValidationResult<PsonProfile> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      success: false,
      issues: [{ path: "$", message: "Profile must be an object." }]
    };
  }

  for (const key of REQUIRED_ROOT_KEYS) {
    if (!(key in input)) {
      pushIssue(issues, `$.${key}`, "Missing required field.");
    }
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  const profile = input as Record<string, unknown>;

  if (profile.pson_version !== "5.0") {
    pushIssue(issues, "$.pson_version", "PSON version must be 5.0.");
  }

  if (typeof profile.profile_id !== "string" || profile.profile_id.length === 0) {
    pushIssue(issues, "$.profile_id", "profile_id must be a non-empty string.");
  }

  if (typeof profile.user_id !== "string" || profile.user_id.length === 0) {
    pushIssue(issues, "$.user_id", "user_id must be a non-empty string.");
  }

  const consent = profile.consent;
  if (!isRecord(consent)) {
    pushIssue(issues, "$.consent", "consent must be an object.");
  } else {
    if (typeof consent.granted !== "boolean") {
      pushIssue(issues, "$.consent.granted", "granted must be a boolean.");
    }
    if (!Array.isArray(consent.scopes) || consent.scopes.some((scope) => typeof scope !== "string")) {
      pushIssue(issues, "$.consent.scopes", "scopes must be an array of strings.");
    }
    if (typeof consent.policy_version !== "string" || consent.policy_version.length === 0) {
      pushIssue(issues, "$.consent.policy_version", "policy_version must be a non-empty string.");
    }
    if (!isIsoDateString(consent.updated_at)) {
      pushIssue(issues, "$.consent.updated_at", "updated_at must be an ISO date string.");
    }
  }

  const domains = profile.domains;
  if (!isRecord(domains)) {
    pushIssue(issues, "$.domains", "domains must be an object.");
  } else {
    if (!Array.isArray(domains.active) || domains.active.length === 0 || domains.active.some((item) => typeof item !== "string")) {
      pushIssue(issues, "$.domains.active", "active must be a non-empty string array.");
    }
    if (!["light", "standard", "deep"].includes(String(domains.depth))) {
      pushIssue(issues, "$.domains.depth", "depth must be light, standard, or deep.");
    }
  }

  const layers = profile.layers;
  if (!isRecord(layers)) {
    pushIssue(issues, "$.layers", "layers must be an object.");
  } else {
    for (const key of ["observed", "inferred", "simulated"] as const) {
      if (!isRecord(layers[key])) {
        pushIssue(issues, `$.layers.${key}`, `${key} must be an object.`);
      }
    }
  }

  for (const key of ["cognitive_model", "behavioral_model", "state_model", "knowledge_graph", "simulation_profiles", "privacy", "metadata"] as const) {
    if (!isRecord(profile[key])) {
      pushIssue(issues, `$.${key}`, `${key} must be an object.`);
    }
  }

  const metadata = profile.metadata;
  if (isRecord(metadata)) {
    if (typeof metadata.confidence !== "number" || metadata.confidence < 0 || metadata.confidence > 1) {
      pushIssue(issues, "$.metadata.confidence", "confidence must be between 0 and 1.");
    }
    if (!isIsoDateString(metadata.created_at)) {
      pushIssue(issues, "$.metadata.created_at", "created_at must be an ISO date string.");
    }
    if (!isIsoDateString(metadata.updated_at)) {
      pushIssue(issues, "$.metadata.updated_at", "updated_at must be an ISO date string.");
    }
    if (typeof metadata.source_count !== "number" || !Number.isInteger(metadata.source_count) || metadata.source_count < 0) {
      pushIssue(issues, "$.metadata.source_count", "source_count must be a non-negative integer.");
    }
    if (typeof metadata.revision !== "number" || !Number.isInteger(metadata.revision) || metadata.revision < 1) {
      pushIssue(issues, "$.metadata.revision", "revision must be an integer >= 1.");
    }
  }

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, issues: [], value: input as unknown as PsonProfile };
}

export { corePsonSchema };
