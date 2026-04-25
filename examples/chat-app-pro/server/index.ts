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
import { buildStoreOptions } from "./db.js";
import { ChatSession, SessionStore, type ChatTurn } from "./chat-session.js";
import { buildProfileGraph } from "./graph.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── .env loader ────────────────────────────────────────────────────────

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
    if (key && !(key in process.env)) process.env[key] = value;
  }
  return true;
}

const envPath = resolve(__dirname, "..", ".env");
const envLoaded = loadDotenv(envPath);
if (envLoaded) console.log(`[env] loaded ${envPath}`);

// ─── Config ─────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3031);
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
const LOG_TOOLS = process.env.CHAT_APP_LOG_TOOLS === "true";
const STATIC_ROOT = resolve(__dirname, "..", "web", "dist");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
if (!ANTHROPIC_API_KEY) {
  console.error(
    [
      "",
      "✗ ANTHROPIC_API_KEY is not set.",
      `  Expected .env at: ${envPath}`,
      "  Copy .env.example to .env and fill it in.",
      ""
    ].join("\n")
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error(
    [
      "",
      "✗ DATABASE_URL is not set.",
      "  Set it to your Neon Postgres connection string in .env.",
      ""
    ].join("\n")
  );
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const storeOptions = buildStoreOptions();
const sessionStore = new SessionStore(storeOptions);

const MAX_TOOL_ITERATIONS = 10;

// ─── System prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(profileId: string, userId: string): string {
  return [
    "You are a personal assistant backed by PSON5 — an open-source",
    "personalization infrastructure that stores user profiles as three",
    "strictly-separated layers: observed (what the user said), inferred",
    "(what you deduced, with confidence), simulated (what the engine",
    "predicts in context).",
    "",
    `The current user's id is: ${userId}`,
    `Their PSON profile_id is: ${profileId}`,
    "",
    "# Save paths (three, use the right one)",
    "",
    "1. pson_observe_fact — for durable facts the user volunteers.",
    "   Choose the domain and a snake_case key. This is the default path;",
    "   use it whenever the user states something meaningful about",
    "   themselves.",
    "",
    "2. pson_learn — answers to questions that came from",
    "   pson_get_next_questions (or from pson_generate_domain_questions).",
    "   question_id MUST be one of those — never invent an id.",
    "",
    "3. pson_generate_domain_questions — the generative flow. Call this",
    "   when the user signals a topic they want to think through in a",
    "   structured way (e.g. 'I want to plan my wedding', 'help me",
    "   strategise my career move'). You compose a one-paragraph brief",
    "   and 5-10 target_areas (fact keys you'd want filled). Claude then",
    "   authors fresh questions for that domain and registers them. Ask",
    "   the user the returned questions one at a time; record their",
    "   answers with pson_learn.",
    "",
    "# Reading",
    "",
    "Before any substantive personal answer, call pson_get_agent_context",
    "with an intent string. Use the returned personal_data to ground your",
    "reply — don't invent preferences. For decision-framed questions",
    "(\"would I / should I\"), call pson_simulate and present the",
    "prediction + confidence + reasoning + caveats explicitly.",
    "",
    "# Tone",
    "",
    "Warm, concise. One paragraph per reply usually. The UI has a live",
    "profile panel and a graph visualiser on the right — the user can see",
    "what you're saving, so don't over-announce the mechanics."
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
  } catch {
    throw Object.assign(new Error("Invalid JSON body."), { statusCode: 400 });
  }
}

function toAnthropicTool(def: { name: string; description: string; input_schema: Record<string, unknown> }): Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: def.input_schema as Tool["input_schema"]
  };
}

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function asAnthropicMessage(turn: ChatTurn): MessageParam {
  if (turn.role === "user") return { role: "user", content: turn.content } as MessageParam;
  return { role: "assistant", content: turn.content } as MessageParam;
}

// ─── Routes ─────────────────────────────────────────────────────────────

async function handleChatStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as {
    session_id?: string;
    user_id?: string;
    message?: string;
  };

  if (!body.session_id) throw Object.assign(new Error("session_id is required"), { statusCode: 400 });
  if (!body.user_id) throw Object.assign(new Error("user_id is required"), { statusCode: 400 });
  if (!body.message) throw Object.assign(new Error("message is required"), { statusCode: 400 });

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

      const toolUses: ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          writeSse(res, "assistant-delta", { text: block.text });
        } else if (block.type === "tool_use") {
          toolUses.push(block);
        }
      }

      session.messages.push({
        role: "assistant",
        content: response.content.map((b) => {
          if (b.type === "text") return { type: "text", text: b.text };
          if (b.type === "tool_use") {
            return { type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> };
          }
          return { type: "text", text: "" };
        })
      });

      if (stopReason !== "tool_use" || toolUses.length === 0) break;

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];

      for (const use of toolUses) {
        writeSse(res, "tool-start", { id: use.id, name: use.name, arguments: use.input });
        try {
          const { result, durationMs } = await session.runToolCall({
            name: use.name as PsonAgentToolName,
            arguments: (use.input ?? {}) as Record<string, unknown>
          });
          if (LOG_TOOLS) console.log(`[tool] ${use.name} (${durationMs}ms)`);
          const resultJson = JSON.stringify(result);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: resultJson });
          writeSse(res, "tool-end", {
            id: use.id,
            name: use.name,
            duration_ms: durationMs,
            result_preview: resultJson.length > 480 ? resultJson.slice(0, 480) + "…" : resultJson
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Tool call failed.";
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: message, is_error: true });
          writeSse(res, "tool-end", { id: use.id, name: use.name, error: message });
        }
      }

      session.messages.push({ role: "user", content: toolResults });
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
  if (!sessionId) throw Object.assign(new Error("session_id query param required"), { statusCode: 400 });
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
    source_count: profile.metadata.source_count,
    layers: {
      observed: profile.layers.observed,
      inferred: profile.layers.inferred,
      simulated: profile.layers.simulated
    },
    knowledge_graph: profile.knowledge_graph
  });
}

async function handleGraph(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "", "http://localhost");
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) throw Object.assign(new Error("session_id query param required"), { statusCode: 400 });
  const session = sessionStore.get(sessionId);
  if (!session || !session.profileId) {
    json(res, 404, { error: "No profile for session yet. Send a message first." });
    return;
  }
  const profile = await loadProfile(session.profileId, storeOptions);
  json(res, 200, buildProfileGraph(profile));
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!pathname.includes(".")) pathname = "/index.html";
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
    if (req.method === "GET" && url.pathname === "/api/graph") {
      await handleGraph(req, res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, { ok: true, model: MODEL, storage: "postgres" });
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
    if (!res.headersSent) json(res, statusCode, { error: message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`chat-app-pro backend on http://localhost:${PORT}`);
  console.log(`  model:     ${MODEL}`);
  console.log(`  storage:   postgres (Neon)`);
  console.log(`  frontend:  npm run dev:web → http://localhost:5174`);
});
