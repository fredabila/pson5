import type { PsonProfile, ProfileStoreOptions } from "@pson5/core-types";
import {
  createPsonAgentToolExecutor,
  getPsonAgentToolDefinitions,
  PsonClient,
  type PsonAgentToolCall,
  type PsonAgentToolDefinition,
  type PsonAgentToolExecutor,
  type PsonAgentToolName
} from "@pson5/sdk";
import { initProfile, loadProfile, findProfilesByUserId } from "@pson5/serialization-engine";

/**
 * One `ChatSession` encapsulates everything that stays the same across
 * turns in a single browser tab: which PSON profile the conversation is
 * against, the rolling Anthropic transcript, and the wired-up agent-tool
 * executor.
 *
 * Sessions live in memory on the server. For a production deployment
 * you'd back this with Redis or similar. The PSON store itself IS durable,
 * so on process restart we just rebuild the transcript from scratch — the
 * learned profile persists.
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

  constructor(sessionId: string, userId: string, storeOptions: ProfileStoreOptions) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.storeOptions = storeOptions;
    this.client = new PsonClient();
    this.tools = getPsonAgentToolDefinitions();
    this.executor = createPsonAgentToolExecutor(this.client, this.storeOptions);
  }

  /**
   * Find or create the PSON profile for this user. Called lazily on the
   * first chat turn so an empty browser session doesn't pollute the store.
   */
  async ensureProfile(): Promise<PsonProfile> {
    if (this.profileId) {
      return loadProfile(this.profileId, this.storeOptions);
    }

    const existingIds = await findProfilesByUserId(this.userId, this.storeOptions);
    if (existingIds.length > 0) {
      this.profileId = existingIds[0]!;
      return loadProfile(this.profileId, this.storeOptions);
    }

    const profile = await initProfile(
      {
        user_id: this.userId,
        domains: ["core"],
        depth: "standard"
      },
      this.storeOptions
    );
    this.profileId = profile.profile_id;
    return profile;
  }

  /**
   * Execute a single Claude-requested tool call against the PSON SDK.
   * Returns a JSON-serialisable result suitable for the tool_result block.
   */
  async runToolCall(
    call: PsonAgentToolCall
  ): Promise<{ name: PsonAgentToolName; result: unknown; durationMs: number }> {
    const start = Date.now();
    const result = await this.executor.execute(call);
    return {
      name: call.name,
      result,
      durationMs: Date.now() - start
    };
  }
}

/** One turn in the rolling transcript Anthropic sees. */
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

/**
 * In-memory session registry. Keyed by opaque session_id from the client;
 * one session_id → one (user_id, profile).
 */
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
