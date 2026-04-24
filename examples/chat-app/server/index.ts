import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool,
  ToolUseBlock
} from "@anthropic-ai/sdk/resources/messages";
import type { PsonAgentToolName } from "@pson5/sdk";
import { loadProfile } from "@pson5/serialization-engine";
import { ChatSession, SessionStore, type ChatTurn } from "./chat-session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── .env loader ────────────────────────────────────────────────────────
//
// Dependency-free parser so this example doesn't need `dotenv` as a dep.
// Respects simple KEY=VALUE lines, handles surrounding quotes, skips
// comments and blanks. Does NOT override values already in process.env,
// so `ANTHROPIC_API_KEY=sk-... npm run dev` still wins.

function loadDotenv(path: string): boolean {
  if (!existsSync(path)) return false;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

// examples/chat-app/.env is one level up from server/.
const envPath = resolve(__dirname, "..", ".env");
const loaded = loadDotenv(envPath);
if (loaded) {
  console.log(`[env] loaded ${envPath}`);
}

// ─── Config ─────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3030);
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
const STORE_DIR = process.env.PSON_STORE_DIR?.trim() || ".pson5-store";
const LOG_TOOLS = process.env.CHAT_APP_LOG_TOOLS === "true";
const STATIC_ROOT = resolve(__dirname, "..", "web", "dist");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
if (!ANTHROPIC_API_KEY) {
  console.error(
    [
      "",
      "✗ ANTHROPIC_API_KEY is not set.",
      "",
      `  Expected .env at: ${envPath}`,
      loaded
        ? "  The file loaded, but it didn't contain ANTHROPIC_API_KEY=<value>."
        : "  No .env file found at that path. Copy from .env.example and fill it in.",
      ""
    ].join("\n")
  );
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const storeOptions = { rootDir: STORE_DIR };
const sessionStore = new SessionStore(storeOptions);

// Max tool-use iterations per user turn. If Claude goes past this, we stop
// looping and return what we have — prevents runaway tool churn.
const MAX_TOOL_ITERATIONS = 8;

// ─── System prompt ──────────────────────────────────────────────────────
//
// The system prompt frames Claude as a PSON-aware assistant that should
// actively use the profile tools rather than asking the user to repeat
// themselves. It names the session's profile_id and user_id so Claude
// doesn't have to guess.

function buildSystemPrompt(profileId: string, userId: string): string {
  return [
    "You are a personal assistant backed by PSON5 — an open-source personalization",
    "infrastructure that stores user profiles as three distinct layers: observed",
    "(what the user said), inferred (what you deduced with confidence), and",
    "simulated (what the engine predicts in context).",
    "",
    `The current user's id is: ${userId}`,
    `Their PSON profile_id is: ${profileId}`,
    "",
    "# How you save what you learn",
    "",
    "You have TWO save paths. Pick the right one every time:",
    "",
    "## 1. pson_learn — answers to registry questions",
    "",
    "When YOU asked a question that came from pson_get_next_questions,",
    "use pson_learn with the EXACT question_id the engine returned plus",
    "the user's value mapped to the expected shape (a choice slug for",
    "single_choice, a string for free_text, etc.).",
    "",
    "Never invent a question_id here. The engine will reject it.",
    "",
    "## 2. pson_observe_fact — free-form facts the user volunteered",
    "",
    "When the user states something about themselves that you did NOT",
    "ask about — their name, their city, a pet, a goal, a preference",
    "mentioned in passing — use pson_observe_fact. You pick the domain",
    "('core', 'personal', 'professional', or a descriptive slug) and a",
    "snake_case key ('preferred_name', 'current_city', 'pet_species').",
    "Confidence defaults to 1.0 for user statements; lower it if you're",
    "paraphrasing or inferring from indirect context.",
    "",
    "# Opening the conversation",
    "",
    "On the first turn with a fresh profile (revision 1, empty observed),",
    "call pson_get_next_questions(profile_id, limit: 3) and ask the user",
    "the first returned question in a warm, short way.",
    "",
    "As the conversation flows, you will typically:",
    "  • Capture volunteered facts via pson_observe_fact as they arrive.",
    "  • Interleave a structured question from pson_get_next_questions",
    "    every few turns; save the answer via pson_learn.",
    "",
    "# Reading vs. predicting",
    "",
    "1. Before giving advice grounded in the profile, call",
    "   pson_get_agent_context with an `intent` that describes your aim.",
    "   Use the returned personal_data to ground your response — do not",
    "   invent preferences you can't cite.",
    "2. For `what would I likely do in situation X?` questions, call",
    "   pson_simulate with a concrete context object. Present the",
    "   prediction + confidence + reasoning + caveats in your reply.",
    "3. You never read the raw profile — use pson_get_agent_context for",
    "   consent-scoped, redaction-aware projections. Never claim certainty",
    "   you don't have.",
    "",
    "# Tone",
    "",
    "Be warm but concise. One short paragraph per reply. Don't over-",
    "explain the mechanics — the side panel already shows what you're",
    "learning; you don't need to announce every save."
  ].join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────────────

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage, maxBytes = 1 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      req.destroy();
      throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (err) {
    throw Object.assign(new Error("Invalid JSON body."), { statusCode: 400 });
  }
}

function toAnthropicTool(def: { name: PsonAgentToolName; description: string; input_schema: Record<string, unknown> }): Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: def.input_schema as Tool["input_schema"]
  };
}

// ─── SSE framing ────────────────────────────────────────────────────────
//
// The streaming endpoint speaks Server-Sent Events. Event types we emit:
//   ready          {profile_id}
//   assistant-delta {text}
//   tool-start     {id, name, arguments}
//   tool-end       {id, name, duration_ms, result_preview}
//   assistant-end  {stop_reason}
//   error          {message}
//   done

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Routes ─────────────────────────────────────────────────────────────

async function handleChatStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as {
    session_id?: string;
    user_id?: string;
    message?: string;
  };

  if (!body.session_id || typeof body.session_id !== "string") {
    throw Object.assign(new Error("session_id is required"), { statusCode: 400 });
  }
  if (!body.user_id || typeof body.user_id !== "string") {
    throw Object.assign(new Error("user_id is required"), { statusCode: 400 });
  }
  if (!body.message || typeof body.message !== "string") {
    throw Object.assign(new Error("message is required"), { statusCode: 400 });
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.flushHeaders?.();

  const session = sessionStore.getOrCreate(body.session_id, body.user_id);

  try {
    const profile = await session.ensureProfile();
    writeSse(res, "ready", { profile_id: profile.profile_id });

    session.messages.push({ role: "user", content: body.message });

    const tools = session.tools.map(toAnthropicTool);
    const system = buildSystemPrompt(profile.profile_id, body.user_id);

    let iterations = 0;
    let stopReason: string | null = null;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations += 1;

      const messages: MessageParam[] = session.messages.map(asAnthropicMessage);

      const request: MessageCreateParamsNonStreaming = {
        model: MODEL,
        max_tokens: 2048,
        system,
        tools,
        messages
      };

      const response = await anthropic.messages.create(request);
      stopReason = response.stop_reason;

      // Emit text blocks incrementally to the client and collect
      // tool_use blocks so we can execute them after.
      const toolUses: ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          writeSse(res, "assistant-delta", { text: block.text });
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      // Record the assistant turn (full content so the next request sees it).
      session.messages.push({
        role: "assistant",
        content: response.content.map((b): NonNullable<ChatTurn["content"]> extends string | (infer T)[] ? T : never => {
          if (b.type === "text") return { type: "text", text: b.text };
          if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> };
          // Claude never emits tool_result itself — belt-and-braces.
          return { type: "text", text: "" };
        })
      });

      if (stopReason !== "tool_use" || toolUses.length === 0) {
        break;
      }

      // Execute each tool call and fold results back into the transcript.
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

      for (const use of toolUses) {
        writeSse(res, "tool-start", {
          id: use.id,
          name: use.name,
          arguments: use.input
        });

        try {
          const { result, durationMs } = await session.runToolCall({
            name: use.name as PsonAgentToolName,
            arguments: (use.input ?? {}) as Record<string, unknown>
          });
          if (LOG_TOOLS) {
            console.log(`[tool] ${use.name} (${durationMs}ms)`);
          }
          const resultJson = JSON.stringify(result);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: resultJson
          });
          writeSse(res, "tool-end", {
            id: use.id,
            name: use.name,
            duration_ms: durationMs,
            // Preview is truncated for the UI; full result stays on the server.
            result_preview: resultJson.length > 480 ? resultJson.slice(0, 480) + "…" : resultJson
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Tool call failed.";
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: message,
            is_error: true
          });
          writeSse(res, "tool-end", {
            id: use.id,
            name: use.name,
            error: message
          });
        }
      }

      session.messages.push({ role: "user", content: toolResults });
      // Loop: next messages.create will include the tool_results so Claude
      // can continue.
    }

    writeSse(res, "assistant-end", { stop_reason: stopReason });
    writeSse(res, "done", {});
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    writeSse(res, "error", { message });
    res.end();
  }
}

async function handleProfileSnapshot(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "", "http://localhost");
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    throw Object.assign(new Error("session_id query param is required"), { statusCode: 400 });
  }
  const session = sessionStore.get(sessionId);
  if (!session || !session.profileId) {
    json(res, 404, { error: "No profile for session yet. Send a message first." });
    return;
  }
  const profile = await loadProfile(session.profileId, storeOptions);
  json(res, 200, {
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    revision: profile.metadata.revision,
    confidence: profile.metadata.confidence,
    layers: {
      observed: profile.layers.observed,
      inferred: profile.layers.inferred,
      simulated: profile.layers.simulated
    },
    behavioral_model: profile.behavioral_model,
    knowledge_graph: profile.knowledge_graph
  });
}

// Serve the Vite-built web app in production. In dev the Vite server at
// :5173 proxies /api/* to this server so both origins feel like one.
async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!pathname.includes(".")) pathname = "/index.html"; // SPA fallback
  const filePath = resolve(join(STATIC_ROOT, pathname));

  if (!filePath.startsWith(STATIC_ROOT)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const content = await readFile(filePath);
    const contentType =
      {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png"
      }[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found." });
  }
}

// ─── Anthropic transcript adapter ───────────────────────────────────────
//
// Our internal ChatTurn shape mirrors Anthropic's but allows a string
// shorthand on user turns. Convert to MessageParam shape for the API.

function asAnthropicMessage(turn: ChatTurn): MessageParam {
  if (turn.role === "user") {
    return { role: "user", content: turn.content } as MessageParam;
  }
  return { role: "assistant", content: turn.content } as MessageParam;
}

// ─── Server ─────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChatStream(req, res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/profile") {
      await handleProfileSnapshot(req, res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, { ok: true, model: MODEL });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    json(res, 405, { error: "Method not allowed." });
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Unknown error.";
    if (!res.headersSent) {
      json(res, statusCode, { error: message });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`chat-app backend listening on http://localhost:${PORT}`);
  console.log(`  model:    ${MODEL}`);
  console.log(`  store:    ${resolve(STORE_DIR)}`);
  console.log(`  frontend: run \`npm run dev:web\` for the Vite dev server at :5173`);
});
