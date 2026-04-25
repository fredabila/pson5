#!/usr/bin/env tsx
/**
 * One-time setup — create the Managed Agents environment and the agent,
 * persist their ids to .ids.json so every subsequent `npm run dev` just
 * starts a fresh session against them.
 *
 * Safe to re-run: if .ids.json already exists and the referenced ids
 * are still reachable, this script is a no-op. Delete .ids.json to
 * force re-creation.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  assertAnthropicKey,
  IDS_PATH,
  loadDotenv,
  readIds,
  writeIds
} from "../src/env.js";
import { CUSTOM_TOOL_DEFINITIONS } from "../src/tools.js";
import { PERSONA_NAME } from "../src/persona.js";
import { buildSystemPrompt } from "../src/system-prompt.js";

loadDotenv();
const apiKey = assertAnthropicKey();

const client = new Anthropic({ apiKey });

async function ensureEnvironment(): Promise<string> {
  const existing = readIds();
  if (existing?.environmentId) {
    try {
      const env = await client.beta.environments.retrieve(existing.environmentId);
      console.log(`• Reusing environment ${env.id}`);
      return env.id;
    } catch {
      console.log("• Stored environment id is unreachable — creating a fresh one");
    }
  }

  const env = await client.beta.environments.create({
    name: `researcher-agent-${Date.now().toString(36)}`,
    description:
      "Sandbox for the PSON5 researcher-agent demo. Unrestricted networking so web_search works.",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" }
    }
  });
  console.log(`✓ Created environment ${env.id}`);
  return env.id;
}

async function ensureAgent(): Promise<{ id: string; version: number | string }> {
  const existing = readIds();
  if (existing?.agentId) {
    try {
      const agent = await client.beta.agents.retrieve(existing.agentId);
      console.log(`• Reusing agent ${agent.id} (version ${agent.version})`);
      return { id: agent.id, version: agent.version };
    } catch {
      console.log("• Stored agent id is unreachable — creating a fresh one");
    }
  }

  const agent = await client.beta.agents.create({
    name: `${PERSONA_NAME} (simulated)`,
    description:
      "Managed Agent that assumes the identity of a fictional Anthropic alignment researcher and uses PSON5 as its cognitive substrate.",
    model: "claude-opus-4-7",
    system: buildSystemPrompt(),
    tools: [
      { type: "agent_toolset_20260401", default_config: { enabled: true } },
      ...CUSTOM_TOOL_DEFINITIONS
    ]
  });
  console.log(`✓ Created agent ${agent.id} (version ${agent.version})`);
  return { id: agent.id, version: agent.version };
}

async function main() {
  console.log("Setting up researcher-agent — one-time\n");

  const environmentId = await ensureEnvironment();
  const { id: agentId, version: agentVersion } = await ensureAgent();

  writeIds({ agentId, agentVersion, environmentId });
  console.log(`\n✓ Persisted ids to ${IDS_PATH}`);
  console.log("\nNext: `npm run dev` to start a session.");
}

main().catch((err) => {
  console.error("\n✗ Setup failed:");
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
