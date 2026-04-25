import type { LearningSessionState, PsonProfile, ProfileStoreOptions } from "@pson5/core-types";
import {
  createPsonAgentToolExecutor,
  getPsonAgentToolDefinitions,
  PsonClient,
  type PsonAgentToolCall,
  type PsonAgentToolDefinition,
  type PsonAgentToolExecutor,
  type PsonAgentToolName
} from "@pson5/sdk";
import {
  appendGeneratedQuestions,
  openGenerativeSession,
  readSession
} from "@pson5/acquisition-engine";
import { deriveGenerativeQuestions } from "@pson5/provider-engine";
import { findProfilesByUserId, initProfile, loadProfile } from "@pson5/serialization-engine";

/**
 * Per-browser-tab chat state. Identical in shape to the original
 * chat-app's session, but with three additions for chat-app-pro:
 *
 *   • the storeOptions carries the Postgres adapter — every SDK call
 *     reads/writes profile documents against Neon;
 *   • the tool set includes a custom `pson_generate_domain_questions`
 *     tool that opens a generative session for a user-stated topic and
 *     has Claude author its own questions;
 *   • activeGenerativeSessionId is tracked per session so follow-up
 *     `pson_learn` calls resolve the generated question ids.
 */
export class ChatSession {
  public readonly sessionId: string;
  public readonly userId: string;
  public readonly storeOptions: ProfileStoreOptions;
  public readonly tools: PsonAgentToolDefinition[];
  public readonly executor: PsonAgentToolExecutor;
  public readonly messages: ChatTurn[] = [];

  private readonly client: PsonClient;
  public profileId: string | null = null;
  public activeGenerativeSessionId: string | null = null;

  constructor(sessionId: string, userId: string, storeOptions: ProfileStoreOptions) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.storeOptions = storeOptions;
    this.client = new PsonClient();
    this.tools = [...getPsonAgentToolDefinitions(), GENERATE_DOMAIN_TOOL_DEF];
    this.executor = createPsonAgentToolExecutor(this.client, this.storeOptions);
  }

  async ensureProfile(): Promise<PsonProfile> {
    if (this.profileId) {
      return loadProfile(this.profileId, this.storeOptions);
    }

    const existing = await findProfilesByUserId(this.userId, this.storeOptions);
    if (existing.length > 0) {
      this.profileId = existing[0]!;
      return loadProfile(this.profileId, this.storeOptions);
    }

    // NOTE: serialization-engine seeds new profiles with the legacy scope
    // strings ["core:read","core:write","simulation:run"], but the
    // privacy module actually requires ["ai:use","ai:modeling",
    // "ai:simulation"] — a string mismatch in the SDK that causes
    // pson_get_provider_policy to deny every modeling and simulation
    // call on a fresh profile. Until the SDK reconciles those names, we
    // grant the full set explicitly here.
    const profile = await initProfile(
      {
        user_id: this.userId,
        domains: ["core"],
        depth: "standard",
        consent: {
          granted: true,
          scopes: [
            "core:read",
            "core:write",
            "simulation:run",
            "ai:use",
            "ai:modeling",
            "ai:simulation"
          ]
        }
      },
      this.storeOptions
    );
    this.profileId = profile.profile_id;
    return profile;
  }

  async runToolCall(call: PsonAgentToolCall): Promise<{
    name: string;
    result: unknown;
    durationMs: number;
  }> {
    const start = Date.now();

    // Intercept the one custom tool that isn't part of the SDK's built-in
    // registry — everything else routes through the SDK's executor.
    if (call.name === ("pson_generate_domain_questions" as PsonAgentToolName)) {
      const result = await this.runGenerateDomainQuestions(call.arguments ?? {});
      return { name: call.name, result, durationMs: Date.now() - start };
    }

    const result = await this.executor.execute(call);
    return { name: call.name, result, durationMs: Date.now() - start };
  }

  /**
   * Handle pson_generate_domain_questions:
   *   • open (or reuse) a generative session for the given domain id
   *   • ask the provider engine (Claude, via @pson5/provider-engine) to
   *     author N brand-new questions from the brief + current profile
   *   • register them via appendGeneratedQuestions so subsequent
   *     pson_learn calls can resolve the new ids
   */
  private async runGenerateDomainQuestions(args: Record<string, unknown>): Promise<unknown> {
    if (!this.profileId) {
      throw new Error("No profile loaded. Send a message first.");
    }
    const domainId = String(args.domain_id ?? "").trim();
    const title = String(args.title ?? "").trim() || domainId;
    const description = String(args.description ?? "").trim();
    const targets = Array.isArray(args.target_areas) ? (args.target_areas as string[]) : [];
    const count = clampInt(args.question_count, 1, 5, 3);

    if (!domainId) {
      throw new Error("domain_id is required (snake_case slug like 'wedding_planning').");
    }
    if (targets.length === 0) {
      throw new Error("target_areas must be a non-empty list of fact keys this domain will collect.");
    }

    // Open or reuse the generative session.
    if (!this.activeGenerativeSessionId) {
      const session = await openGenerativeSession(
        this.profileId,
        { domains: [domainId] },
        this.storeOptions
      );
      this.activeGenerativeSessionId = session.session_id;
    }

    const profile = await loadProfile(this.profileId, this.storeOptions);
    const fullState = await this.loadSessionState();

    const questions = await deriveGenerativeQuestions(
      {
        profile,
        brief: {
          id: domainId,
          title,
          description,
          target_areas: targets,
          sensitivity: "standard"
        },
        strategy: "broad_scan",
        question_count: count,
        // Narrow to the fields deriveGenerativeQuestions declares; the
        // acquisition engine stores optionals, the provider engine
        // requires concrete arrays here.
        session_state: {
          session_id: fullState.session_id,
          asked_question_ids: fullState.asked_question_ids,
          answered_question_ids: fullState.answered_question_ids,
          confidence_gaps: fullState.confidence_gaps ?? [],
          fatigue_score: fullState.fatigue_score ?? 0
        }
      },
      { rootDir: this.storeOptions.rootDir }
    );

    if (!questions || questions.stop) {
      return {
        ok: true,
        stop: true,
        stop_reason: questions?.stop_reason ?? "provider_not_configured_or_brief_saturated",
        questions: []
      };
    }

    const updated = await appendGeneratedQuestions(
      this.activeGenerativeSessionId,
      questions.questions,
      this.storeOptions
    );

    return {
      ok: true,
      stop: false,
      session_id: updated.session_id,
      questions: questions.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        domain: q.domain,
        information_targets: q.information_targets,
        choices: q.choices
      }))
    };
  }

  private async loadSessionState(): Promise<LearningSessionState> {
    if (!this.activeGenerativeSessionId) {
      throw new Error("No active generative session.");
    }
    return readSession(this.activeGenerativeSessionId, this.storeOptions);
  }
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" ? Math.trunc(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ─── Tool definition for the one custom tool ────────────────────────────

const GENERATE_DOMAIN_TOOL_DEF: PsonAgentToolDefinition = {
  type: "function",
  name: "pson_generate_domain_questions" as PsonAgentToolName,
  description:
    "Start (or continue) a generative question flow for a user-chosen topic. Call this when the user says something like 'I want to plan my wedding' or 'help me think about my career' — anything domain-specific that the built-in question registry doesn't cover. The provider engine (Claude) authors fresh questions from the brief you pass, registers them in a learning session, and returns them so you can ask the user one at a time. Subsequent pson_learn calls with the returned question_ids will save the answers correctly.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      domain_id: {
        type: "string",
        description: "snake_case slug naming this domain (e.g. 'wedding_planning', 'marathon_training', 'career_pivot')."
      },
      title: {
        type: "string",
        description: "Short human-readable title for the domain (e.g. 'Wedding planning')."
      },
      description: {
        type: "string",
        description: "One-paragraph brief describing what this domain is about and what you want to learn."
      },
      target_areas: {
        type: "array",
        items: { type: "string" },
        description: "5–10 specific fact keys the flow will try to fill in (e.g. ['venue_preference', 'guest_count_range', 'budget_tier', 'priority_ranking'])."
      },
      question_count: {
        type: "number",
        description: "How many new questions to generate this turn. 1–5. Defaults to 3."
      }
    },
    required: ["domain_id", "description", "target_areas"]
  }
};

export interface ChatTurn {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
      >;
}

export class SessionStore {
  private sessions = new Map<string, ChatSession>();
  private readonly storeOptions: ProfileStoreOptions;

  constructor(storeOptions: ProfileStoreOptions) {
    this.storeOptions = storeOptions;
  }

  getOrCreate(sessionId: string, userId: string): ChatSession {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const next = new ChatSession(sessionId, userId, this.storeOptions);
    this.sessions.set(sessionId, next);
    return next;
  }

  get(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }
}
