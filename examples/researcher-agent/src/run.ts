#!/usr/bin/env tsx
/**
 * Interactive REPL for the researcher-agent Managed Agent.
 *
 *  • Loads agent + environment ids from .ids.json (created by setup.ts)
 *  • Ensures a PSON profile exists for the persona
 *  • Opens a Managed Agents session
 *  • Reads a line from the user, forwards it as a `user.message`
 *  • Streams events back — renders assistant text live, routes custom
 *    tool calls to the host-side PSON handler, sends the result back
 *  • Returns to the prompt when the session idles on `end_turn`
 *
 * Lossless stream reconnect and the idle/terminated break gate follow
 * the patterns in the Managed Agents skill.
 */
import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { PsonClient } from "@pson5/sdk";
import {
  findProfilesByUserId,
  initProfile
} from "@pson5/serialization-engine";
import {
  assertAnthropicKey,
  loadDotenv,
  readIds,
  resolvePersonaUserId,
  resolveStoreDir
} from "./env.js";
import { PERSONA_SKETCH } from "./persona.js";
import { createToolHandler } from "./tools.js";

loadDotenv();
const apiKey = assertAnthropicKey();

const loadedIds = readIds();
if (!loadedIds) {
  console.error(
    [
      "",
      "✗ No .ids.json found. Run `npm run setup` first to create the agent + environment.",
      ""
    ].join("\n")
  );
  process.exit(1);
}
// Narrowed once above; `ids` is non-null for the rest of the module.
const ids = loadedIds;

const anthropic = new Anthropic({ apiKey });
const pson = new PsonClient();
const storeOptions = { rootDir: resolveStoreDir() };

async function ensurePersonaProfile(): Promise<string> {
  const userId = resolvePersonaUserId();
  const existing = await findProfilesByUserId(userId, storeOptions);
  if (existing.length > 0) return existing[0]!;

  const profile = await initProfile(
    { user_id: userId, domains: ["core"], depth: "standard" },
    storeOptions
  );
  console.log(
    `• Created fresh PSON profile ${profile.profile_id} for ${userId}`
  );
  return profile.profile_id;
}

// ─── Session runner ────────────────────────────────────────────────────

async function runSession(profileId: string): Promise<void> {
  const session = await anthropic.beta.sessions.create({
    agent: ids.agentId,
    environment_id: ids.environmentId,
    title: `Researcher conversation ${new Date().toISOString()}`
  });
  console.log(`• Session ${session.id} opened\n`);

  const handleToolCall = createToolHandler({
    client: pson,
    profileId,
    storeOptions
  });

  const rl = readline.createInterface({ input, output });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  console.log(PERSONA_SKETCH);
  console.log(
    "\nType a message and press Enter. Ctrl+C or an empty line exits.\n"
  );

  try {
    while (true) {
      const userText = (await ask("you › ")).trim();
      if (!userText) break;

      await anthropic.beta.sessions.events.send(session.id, {
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text: userText }]
          }
        ]
      });

      await streamUntilIdle(session.id, handleToolCall);
      process.stdout.write("\n");
    }
  } finally {
    rl.close();
    // Best-effort archive — ignore failures.
    try {
      await anthropic.beta.sessions.archive(session.id);
    } catch {
      /* session may already be running — archive is advisory */
    }
  }
}

// ─── Stream consumer with tool-routing + correct idle gate ──────────────

async function streamUntilIdle(
  sessionId: string,
  handleToolCall: (name: string, input: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  const stream = await anthropic.beta.sessions.events.stream(sessionId);

  let assistantHasOutput = false;

  for await (const event of stream as AsyncIterable<AnyEvent>) {
    switch (event.type) {
      case "agent.message": {
        for (const block of event.content ?? []) {
          if (block.type === "text" && block.text) {
            if (!assistantHasOutput) {
              process.stdout.write("kwan › ");
              assistantHasOutput = true;
            }
            process.stdout.write(block.text);
          }
        }
        break;
      }

      case "agent.tool_use": {
        // Built-in toolset call — show a compact status line.
        const name = toolName(event);
        if (name) process.stdout.write(`\n  [${name}…]`);
        break;
      }

      case "agent.tool_result": {
        // Built-in toolset result — ignore body, rely on text blocks
        // for content; this keeps the REPL readable.
        process.stdout.write("\n");
        break;
      }

      case "agent.custom_tool_use": {
        const name = toolName(event) ?? "unknown_tool";
        const toolUseId = event.id ?? "";
        const rawInput = (event.input ?? {}) as Record<string, unknown>;
        process.stdout.write(`\n  [pson › ${name}…]`);

        let resultPayload: string;
        let isError = false;
        try {
          const result = await handleToolCall(name, rawInput);
          resultPayload = JSON.stringify(result);
        } catch (err) {
          isError = true;
          resultPayload = err instanceof Error ? err.message : String(err);
        }

        await anthropic.beta.sessions.events.send(sessionId, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: toolUseId,
              content: [{ type: "text", text: resultPayload }],
              is_error: isError
            }
          ]
        });
        process.stdout.write(isError ? " ✗\n" : " ✓\n");
        break;
      }

      case "session.status_idle": {
        const stopReason = (event as { stop_reason?: { type?: string } }).stop_reason;
        if (stopReason?.type === "requires_action") {
          // Waiting on us to resolve a custom_tool_use / tool_confirmation.
          // Keep streaming — the send above will wake the agent back up.
          continue;
        }
        // end_turn or retries_exhausted — both terminal for this turn.
        return;
      }

      case "session.status_terminated":
        throw new Error("Session terminated mid-turn.");

      case "session.error": {
        const message =
          (event as { message?: string }).message ?? "Unknown session error.";
        throw new Error(message);
      }

      default:
        // Ignore message_start / heartbeats / spans / etc.
        break;
    }
  }
}

// ─── Event typing helpers ──────────────────────────────────────────────
//
// The managed-agents types are under rapid iteration. We type the
// surface we actually read; anything else is passed through untyped.

interface AnyEvent {
  type: string;
  id?: string;
  content?: Array<{ type: string; text?: string }>;
  input?: unknown;
  name?: string;
  tool_name?: string;
  processed_at?: string | null;
}

function toolName(event: AnyEvent): string | undefined {
  return event.name ?? event.tool_name;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const profileId = await ensurePersonaProfile();
  console.log(`• PSON profile: ${profileId}`);
  console.log(`• Agent: ${ids.agentId}`);
  console.log(`• Environment: ${ids.environmentId}`);
  await runSession(profileId);
}

main().catch((err) => {
  console.error("\n✗ Session failed:");
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
