import type { ExportRedactionLevel, ProviderOperation, ProviderPolicyDecision, PsonProfile } from "@pson5/core-types";

export interface ScopeEvaluationResult {
  allowed: boolean;
  missing_scopes: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

const SENSITIVE_HINTS = [
  "health",
  "mental",
  "medical",
  "relig",
  "politic",
  "sexual",
  "race",
  "ethnic",
  "income",
  "debt"
];

export function evaluateScopes(profile: PsonProfile, requiredScopes: string[]): ScopeEvaluationResult {
  const grantedScopes = new Set(profile.consent.scopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));

  return {
    allowed: profile.consent.granted && missingScopes.length === 0,
    missing_scopes: missingScopes
  };
}

export function getRequiredProviderScopes(operation: ProviderOperation): string[] {
  return operation === "modeling" ? ["ai:use", "ai:modeling"] : ["ai:use", "ai:simulation"];
}

export function getProviderPolicyDecision(
  profile: PsonProfile,
  operation: ProviderOperation,
  redactedFields: string[] = []
): ProviderPolicyDecision {
  const requiredScopes = getRequiredProviderScopes(operation);
  const scopeCheck = evaluateScopes(profile, requiredScopes);

  if (!profile.consent.granted) {
    return {
      allowed: false,
      operation,
      reason: "User consent is not granted.",
      required_scopes: requiredScopes,
      missing_scopes: requiredScopes,
      redacted_fields: redactedFields
    };
  }

  if (profile.privacy.local_only) {
    return {
      allowed: false,
      operation,
      reason: "Profile is marked local_only, so remote AI providers are disabled.",
      required_scopes: requiredScopes,
      missing_scopes: [],
      redacted_fields: redactedFields
    };
  }

  if (!scopeCheck.allowed) {
    return {
      allowed: false,
      operation,
      reason: "Required AI consent scopes are missing.",
      required_scopes: requiredScopes,
      missing_scopes: scopeCheck.missing_scopes,
      redacted_fields: redactedFields
    };
  }

  return {
    allowed: true,
    operation,
    required_scopes: requiredScopes,
    missing_scopes: [],
    redacted_fields: redactedFields
  };
}

export function sanitizeProfileForProvider(profile: PsonProfile): {
  sanitized_profile: Record<string, unknown>;
  redacted_fields: string[];
} {
  const redactedFields = [...profile.privacy.restricted_fields];
  const restricted = new Set(redactedFields);

  const observed = Object.fromEntries(
    Object.entries(profile.layers.observed).map(([domain, value]) => {
      const record = asRecord(value) ?? {};
      const facts = asRecord(record.facts) ?? {};
      const safeFacts = Object.fromEntries(
        Object.entries(facts).filter(([key]) => !restricted.has(`layers.observed.${domain}.facts.${key}`))
      );

      return [domain, { facts: safeFacts }];
    })
  );

  const inferred = asRecord(profile.layers.inferred) ?? {};
  const core = asRecord(inferred.core) ?? {};
  const education = asRecord(inferred.education) ?? {};
  const productivity = asRecord(inferred.productivity) ?? {};

  return {
    sanitized_profile: {
      profile_id: profile.profile_id,
      domains: profile.domains,
      observed,
      inferred: {
        core: core.traits ?? [],
        education: education.traits ?? [],
        productivity: productivity.traits ?? [],
        heuristics: inferred.heuristics ?? [],
        contradictions: inferred.contradictions ?? []
      },
      cognitive_model: profile.cognitive_model,
      behavioral_model: profile.behavioral_model,
      state_model: {
        states: profile.state_model.states.map((state) => ({
          id: state.id,
          label: state.label
        })),
        transitions: profile.state_model.transitions
      },
      privacy: {
        local_only: profile.privacy.local_only,
        restricted_fields: profile.privacy.restricted_fields
      }
    },
    redacted_fields: redactedFields
  };
}

export function isSensitiveProviderCandidate(value: string): boolean {
  const normalized = normalizeText(value);
  return SENSITIVE_HINTS.some((hint) => normalized.includes(hint));
}

export function filterSensitiveProviderCandidates<T>(
  candidates: T[],
  toText: (candidate: T) => string
): { allowed: T[]; removed_count: number } {
  const allowed = candidates.filter((candidate) => !isSensitiveProviderCandidate(toText(candidate)));
  return {
    allowed,
    removed_count: candidates.length - allowed.length
  };
}

export function redactProfileForExport(profile: PsonProfile, level: ExportRedactionLevel): PsonProfile {
  if (level === "full") {
    return profile;
  }

  const restricted = new Set(profile.privacy.restricted_fields);
  const observed = Object.fromEntries(
    Object.entries(profile.layers.observed).map(([domain, value]) => {
      const record = asRecord(value) ?? {};
      const facts = asRecord(record.facts) ?? {};
      const safeFacts = Object.fromEntries(
        Object.entries(facts).filter(([key]) => !restricted.has(`layers.observed.${domain}.facts.${key}`))
      );

      return [
        domain,
        {
          facts: safeFacts,
          last_updated_at: record.last_updated_at ?? null
        }
      ];
    })
  );

  return {
    ...profile,
    user_id: "redacted",
    layers: {
      ...profile.layers,
      observed,
      inferred: {
        ...profile.layers.inferred,
        ai_model: undefined
      }
    },
    privacy: {
      ...profile.privacy,
      access_levels: {},
      restricted_fields: [...profile.privacy.restricted_fields]
    }
  };
}

export const privacyStatus = {
  phase: "implemented",
  next_step: "Extend audit trails and field-level access tags."
} as const;
