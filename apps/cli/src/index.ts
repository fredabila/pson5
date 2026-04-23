#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline, { type Completer } from "node:readline";
import chalk from "chalk";
import { intro, isCancel, outro, password, select, text } from "@clack/prompts";
import { buildStoredAgentContext } from "@pson5/agent-context";
import type { AgentContextOptions, PsonProfile, QuestionDefinition } from "@pson5/core-types";
import { getNextQuestions, submitLearningAnswers } from "@pson5/acquisition-engine";
import { explainPredictionSupport } from "@pson5/graph-engine";
import {
  clearStoredNeo4jConfig,
  getNeo4jStatus,
  getStoredNeo4jConfig,
  saveNeo4jConfig,
  syncStoredProfileKnowledgeGraph
} from "@pson5/neo4j-store";
import {
  clearStoredProviderConfig,
  getProviderPolicyStatus,
  getProviderStatusFromEnv,
  getStoredProviderConfig,
  saveProviderConfig
} from "@pson5/provider-engine";
import {
  exportStoredProfile,
  findProfilesByUserId,
  importProfileDocument,
  initProfile,
  loadProfile,
  loadProfileByUserId,
  resolveStoreRoot,
  validateProfile
} from "@pson5/serialization-engine";
import {
  createPsonAgentToolExecutor,
  getPsonAgentToolDefinitions,
  PsonClient,
  type PsonAgentToolCall,
  type PsonAgentToolName
} from "@pson5/sdk";
import { simulateStoredProfile } from "@pson5/simulation-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

type RedactionLevel = "full" | "safe";
type PsonDepth = "light" | "standard" | "deep";
type ConsoleOperation = "modeling" | "simulation";
type JsonRpcId = string | number | null;

interface ConsoleState {
  storeRoot: string;
  profileId?: string;
  sessionId?: string;
  pendingQuestion?: QuestionDefinition;
  lastIntent?: string;
  running: boolean;
  viewTitle: string;
  viewLines: string[];
  activity: Array<{
    at: string;
    title: string;
    detail: string;
  }>;
}

const CONSOLE_COMMANDS = [
  "/home",
  "/help",
  "/examples",
  "/status",
  "/provider",
  "/provider-setup",
  "/provider-clear",
  "/init",
  "/load",
  "/next",
  "/answer",
  "/learn",
  "/simulate",
  "/agent-context",
  "/inspect",
  "/state",
  "/graph",
  "/export",
  "/clear",
  "/exit"
];

const HELP_TOPICS = ["flow", "commands", "learning", "simulate", "agent", "examples", "provider"];
const MAX_ACTIVITY_ITEMS = 8;
const MAX_VIEW_LINES = 28;

function printUsage(): void {
  console.log(`${chalk.bold.cyan("pson <command>")}

Commands:
  init <userId> [--store <dir>]      Create and persist a minimal .pson profile
  inspect <profileId> [--store <dir>]  Load a stored profile and print it
  inspect-user <userId> [--store <dir>] Load the latest profile mapped to a user id and print it
  export <profileId> [--store <dir>] [--redaction <full|safe>]   Export a stored profile as JSON
  import <file> [--store <dir>] [--overwrite]  Import a .pson JSON file
  question-next <profileId> [--session <id>] [--domains <csv>] [--depth <level>] [--limit <n>] [--store <dir>]
  learn <profileId> <questionId> <value> [--session <id>] [--domains <csv>] [--depth <level>] [--store <dir>]
  simulate <profileId> --context <json> [--domains <csv>] [--store <dir>]
  agent-context <profileId> --intent <text> [--domains <csv>] [--max-items <n>] [--min-confidence <n>] [--include-predictions] [--store <dir>]
  provider-status
  provider-config [--store <dir>]    Show stored provider config summary
  provider-set <openai|anthropic> --api-key <key> [--model <name>] [--base-url <url>] [--timeout-ms <n>] [--store <dir>]
  provider-wizard [--store <dir>]    Interactive provider setup via Clack prompts
  provider-clear [--store <dir>]     Remove stored provider config
  provider-policy <profileId> <modeling|simulation> [--store <dir>]
  neo4j-status [--store <dir>]       Check Neo4j configuration and connectivity
  neo4j-config [--store <dir>]       Show stored Neo4j config summary
  neo4j-set --uri <uri> --username <user> --password <password> [--database <name>] [--disabled] [--store <dir>]
  neo4j-wizard [--store <dir>]       Interactive Neo4j setup via Clack prompts
  neo4j-clear [--store <dir>]        Remove stored Neo4j config
  neo4j-sync <profileId> [--store <dir>]   Sync the profile knowledge graph into Neo4j
  graph <profileId> [--store <dir>]
  state <profileId> [--store <dir>]
  explain <profileId> <prediction> [--store <dir>]
  console [--profile <id>] [--store <dir>]  Start the interactive terminal console
  mcp-stdio [--store <dir>]         Start the local stdio MCP server
  console-legacy [--profile <id>] [--store <dir>]  Start the older readline console
  validate <file>                    Validate a .pson JSON file
`);
}

function consumeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function consumeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }

  args.splice(index, 1);
  return true;
}

async function runProviderWizard(storeRoot: string): Promise<void> {
  intro(chalk.cyan("PSON5 provider setup"));

  const provider = await select({
    message: "Which model provider should PSON5 use?",
    options: [
      { value: "openai", label: "OpenAI", hint: "responses + structured outputs" },
      { value: "anthropic", label: "Anthropic", hint: "messages API" }
    ]
  });

  if (isCancel(provider)) {
    outro("Provider setup cancelled.");
    return;
  }

  const apiKey = await password({
    message: "API key",
    mask: "*",
    validate(value = "") {
      return value.trim().length > 0 ? undefined : "API key is required.";
    }
  });
  if (isCancel(apiKey)) {
    outro("Provider setup cancelled.");
    return;
  }

  const model = await text({
    message: "Model name",
    placeholder: provider === "openai" ? "gpt-4.1-mini" : "claude-sonnet-4-20250514",
    defaultValue: provider === "openai" ? "gpt-4.1-mini" : "claude-sonnet-4-20250514"
  });
  if (isCancel(model)) {
    outro("Provider setup cancelled.");
    return;
  }

  const saved = await saveProviderConfig(
    {
      provider,
      enabled: true,
      api_key: apiKey,
      model: model || null
    },
    { rootDir: storeRoot }
  );

  outro(`Saved ${saved.provider} provider config to ${saved.path}`);
}

async function runNeo4jWizard(storeRoot: string): Promise<void> {
  intro(chalk.cyan("PSON5 Neo4j setup"));

  const uri = await text({
    message: "Neo4j URI",
    placeholder: "neo4j+s://example.databases.neo4j.io"
  });
  if (isCancel(uri)) {
    outro("Neo4j setup cancelled.");
    return;
  }

  const username = await text({
    message: "Neo4j username",
    placeholder: "neo4j",
    defaultValue: "neo4j"
  });
  if (isCancel(username)) {
    outro("Neo4j setup cancelled.");
    return;
  }

  const secret = await password({
    message: "Neo4j password",
    mask: "*",
    validate(value = "") {
      return value.trim().length > 0 ? undefined : "Password is required.";
    }
  });
  if (isCancel(secret)) {
    outro("Neo4j setup cancelled.");
    return;
  }

  const database = await text({
    message: "Database name",
    placeholder: "neo4j",
    defaultValue: "neo4j"
  });
  if (isCancel(database)) {
    outro("Neo4j setup cancelled.");
    return;
  }

  const saved = saveNeo4jConfig(
    {
      uri,
      username,
      password: secret,
      database: database || null,
      enabled: true
    },
    { rootDir: storeRoot }
  );

  outro(`Saved Neo4j config to ${saved.path}`);
}

function tokenizeInput(input: string): string[] {
  const matches = input.match(/"([^"]*)"|'([^']*)'|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function writeMcpMessage(payload: unknown): void {
  const body = JSON.stringify(payload);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(body);
}

function writeMcpResult(id: JsonRpcId, result: unknown): void {
  writeMcpMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function writeMcpError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
  writeMcpMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {})
    }
  });
}

function toMcpTools() {
  return getPsonAgentToolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema
  }));
}

async function startMcpStdioServer(storeRoot: string): Promise<void> {
  const client = new PsonClient();
  const executor = createPsonAgentToolExecutor(client, { rootDir: storeRoot });
  const validToolNames = new Set(getPsonAgentToolDefinitions().map((tool) => tool.name));
  let buffer = Buffer.alloc(0);

  async function handleMessage(rawMessage: string): Promise<void> {
    let message: { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

    try {
      message = JSON.parse(rawMessage) as { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
    } catch {
      writeMcpError(null, -32700, "Parse error");
      return;
    }

    const id = message.id ?? null;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      writeMcpError(id, -32600, "Invalid Request");
      return;
    }

    if (message.method === "notifications/initialized") {
      return;
    }

    if (message.method === "initialize") {
      writeMcpResult(id, {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: "@pson5/cli",
          version: "0.1.0"
        }
      });
      return;
    }

    if (message.method === "ping") {
      writeMcpResult(id, {});
      return;
    }

    if (message.method === "tools/list") {
      writeMcpResult(id, { tools: toMcpTools() });
      return;
    }

    if (message.method === "tools/call") {
      const params = typeof message.params === "object" && message.params !== null ? message.params : {};
      const name = params.name;
      const args =
        typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};

      if (typeof name !== "string" || !validToolNames.has(name as PsonAgentToolName)) {
        writeMcpError(id, -32602, "Invalid tool call parameters");
        return;
      }

      try {
        const result = await executor.execute({
          name: name as PsonAgentToolName,
          arguments: args
        } satisfies PsonAgentToolCall);

        writeMcpResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent: result
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Tool execution failed.";
        writeMcpError(id, -32002, messageText);
      }
      return;
    }

    writeMcpError(id, -32601, `Method not found: ${message.method}`);
  }

  process.stdin.on("data", (chunk: Buffer | string) => {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    buffer = Buffer.concat([buffer, incoming]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = buffer.slice(0, headerEnd).toString("utf8");
      const headers = headerText.split("\r\n");
      const contentLengthHeader = headers.find((line) => /^Content-Length:/iu.test(line));

      if (!contentLengthHeader) {
        writeMcpError(null, -32600, "Missing Content-Length header");
        buffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(contentLengthHeader.split(":")[1]?.trim() ?? "", 10);
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        writeMcpError(null, -32600, "Invalid Content-Length header");
        buffer = Buffer.alloc(0);
        return;
      }

      const totalLength = headerEnd + 4 + contentLength;
      if (buffer.length < totalLength) {
        return;
      }

      const body = buffer.slice(headerEnd + 4, totalLength).toString("utf8");
      buffer = buffer.slice(totalLength);
      void handleMessage(body);
    }
  });

  process.stdin.resume();
}

function shortId(value: string | undefined, length = 10): string {
  if (!value) {
    return "none";
  }

  return value.length > length ? value.slice(0, length) : value;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function trimForActivity(value: string, max = 88): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function toLines(value: string, maxLines = MAX_VIEW_LINES): string[] {
  const lines = value.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines - 1), `... truncated ${lines.length - maxLines + 1} more lines ...`];
}

function makeJsonLines(value: unknown, maxLines = MAX_VIEW_LINES): string[] {
  return toLines(JSON.stringify(value, null, 2), maxLines);
}

function buildPrompt(state: ConsoleState): string {
  if (state.pendingQuestion) {
    return "answer> ";
  }

  const profile = state.profileId ? shortId(state.profileId, 12) : "no-profile";
  return `pson:${profile}> `;
}

function pushActivity(state: ConsoleState, title: string, detail: string): void {
  state.activity = [
    {
      at: new Date().toISOString().slice(11, 19),
      title,
      detail: trimForActivity(detail)
    },
    ...state.activity
  ].slice(0, MAX_ACTIVITY_ITEMS);
}

function setView(state: ConsoleState, title: string, lines: string[]): void {
  state.viewTitle = title;
  state.viewLines = lines.slice(0, MAX_VIEW_LINES);
}

function printDivider(label?: string): void {
  const line = "=".repeat(72);
  if (!label) {
    console.log(line);
    return;
  }

  console.log(`${line}\n${label}\n${line}`);
}

function printKeyValue(label: string, value: unknown): void {
  console.log(`${label.padEnd(18)} ${formatValue(value)}`);
}

function createHelpLines(topic = "flow"): string[] {
  if (topic === "commands") {
    return [
      "Command map",
      "",
      "/home                    return to the dashboard view",
      "/status                  refresh the current session summary",
      "/provider-setup <provider> <apiKey> [model]",
      "/provider-clear          remove stored provider config",
      "/init <userId>           create a profile and load it immediately",
      "/load <profileId>        load an existing profile",
      "/next [domains] [limit]  fetch questions and stage the first one",
      "/answer <value>          answer the staged question",
      "/learn <questionId> <value>",
      "/simulate <task or json>",
      "/agent-context <intent>",
      "/inspect [full|observed|inferred|privacy]",
      "/state                   show active states",
      "/graph                   show graph summary",
      "/provider [policy <op>]",
      "/export [safe|full]",
      "/examples                show tested command examples",
      "/exit                    close the console"
    ];
  }

  if (topic === "learning") {
    return [
      "Learning flow",
      "",
      "1. Create or load a profile.",
      "   /init alice",
      "2. Fetch the next question.",
      "   /next",
      "3. Answer it either with /answer or plain text.",
      "   reading",
      "4. Repeat until the profile has enough observed data.",
      "5. Inspect inferred traits if needed.",
      "   /inspect inferred",
      "",
      "When a question is staged, the prompt changes to answer> so you can type directly."
    ];
  }

  if (topic === "simulate") {
    return [
      "Simulation flow",
      "",
      "Use a natural task string:",
      "  /simulate study for exam with 2 days left",
      "",
      "Or pass structured JSON:",
      "  /simulate {\"task\":\"study for exam\",\"deadline_days\":2}",
      "",
      "The main pane will show prediction, confidence, provider mode, reasoning, caveats, and alternatives."
    ];
  }

  if (topic === "agent") {
    return [
      "Agent-context flow",
      "",
      "Purpose: expose a filtered, relevance-scored personal context instead of raw .pson internals.",
      "",
      "Example:",
      "  /agent-context tutoring",
      "",
      "This returns compact personal signals such as learning style, preferences, behavioral patterns,",
      "and predictions that are relevant to the requested intent."
    ];
  }

  if (topic === "provider") {
    return [
      "Provider flow",
      "",
      "/provider",
      "  Shows whether OpenAI or Anthropic is configured from env vars or local file config.",
      "",
      "/provider-setup openai <apiKey> [model]",
      "  Saves a local provider config under the current store root.",
      "",
      "/provider-clear",
      "  Removes the stored provider config file.",
      "",
      "/provider policy simulation",
      "  Shows whether the active profile is allowed to use provider-backed simulation.",
      "",
      "Env vars still override file config when both are present."
    ];
  }

  if (topic === "examples") {
    return [
      "Walkthrough examples",
      "",
      "/init alice",
      "/next",
      "reading",
      "/next",
      "delay_start",
      "/simulate study for exam with 2 days left",
      "/agent-context tutoring",
      "/inspect inferred",
      "/export safe"
    ];
  }

  return [
    "Workflow",
    "",
    "This console is best used as a loop, not as isolated commands:",
    "",
    "1. /init <userId> or /load <profileId>",
    "2. /next to fetch a question",
    "3. type the answer directly",
    "4. /simulate <task>",
    "5. /agent-context <intent>",
    "",
    "Useful help topics:",
    "  /help commands",
    "  /help learning",
    "  /help simulate",
    "  /help agent",
    "  /help provider",
    "  /help examples"
  ];
}

function printProviderStatus(): void {
  const provider = getProviderStatusFromEnv();
  printDivider("Provider");
  printKeyValue("enabled", provider.enabled);
  printKeyValue("provider", provider.provider);
  printKeyValue("model", provider.model);
  printKeyValue("configured", provider.configured);
  printKeyValue("reason", provider.reason ?? "ready");
  printKeyValue("capabilities", provider.capabilities.join(", ") || "none");
}

function buildQuestionLines(question: QuestionDefinition): string[] {
  const lines = [
    `Question: ${question.id}`,
    `Domain: ${question.domain} | Type: ${question.type} | Depth: ${question.depth}`,
    "",
    question.prompt
  ];

  if (question.choices?.length) {
    lines.push("", "Choices");
    question.choices.forEach((choice) => {
      lines.push(`- ${choice.value}: ${choice.label}`);
    });
  }

  return lines;
}

function buildSimulationLines(result: Awaited<ReturnType<typeof simulateStoredProfile>>): string[] {
  const lines = [
    `Prediction: ${result.prediction}`,
    `Confidence: ${result.confidence.toFixed(2)} | Cached: ${result.cached ? "yes" : "no"}`
  ];

  if (result.provider) {
    lines.push(
      `Provider: ${result.provider.provider} | Mode: ${result.provider.mode} | Model: ${result.provider.model}`
    );
    if (result.provider.reason) {
      lines.push(`Provider note: ${result.provider.reason}`);
    }
  }

  if (result.reasoning.length) {
    lines.push("", "Reasoning");
    result.reasoning.forEach((entry) => lines.push(`- ${entry}`));
  }

  if (result.caveats.length) {
    lines.push("", "Caveats");
    result.caveats.forEach((entry) => lines.push(`- ${entry}`));
  }

  if (result.alternatives?.length) {
    lines.push("", "Alternatives");
    result.alternatives.forEach((entry) => lines.push(`- ${entry}`));
  }

  return lines;
}

function buildAgentContextLines(context: Awaited<ReturnType<typeof buildStoredAgentContext>>): string[] {
  const lines = [
    `Intent: ${context.intent}`,
    `Generated: ${context.generated_at}`,
    `Local only: ${context.constraints.local_only ? "yes" : "no"}`,
    `Restricted fields: ${context.constraints.restricted_fields.join(", ") || "none"}`
  ];

  const sections = [
    ["preferences", context.personal_data.preferences],
    ["communication", context.personal_data.communication_style],
    ["behavior", context.personal_data.behavioral_patterns],
    ["learning", context.personal_data.learning_profile],
    ["state", context.personal_data.current_state],
    ["predictions", context.personal_data.predictions]
  ] as const;

  sections.forEach(([label, entries]) => {
    if (!entries.length) {
      return;
    }

    lines.push("", label);
    entries.forEach((entry) => {
      lines.push(
        `- ${entry.key}: ${formatValue(entry.value)} [${entry.source} conf=${entry.confidence.toFixed(2)} rel=${entry.relevance.toFixed(2)}]`
      );
    });
  });

  return lines;
}

function buildGraphSummaryLines(profile: PsonProfile): string[] {
  const lines = [
    `Nodes: ${profile.knowledge_graph.nodes.length}`,
    `Edges: ${profile.knowledge_graph.edges.length}`
  ];

  const nodes = profile.knowledge_graph.nodes.slice(0, 6);
  if (nodes.length) {
    lines.push("", "Node sample");
    nodes.forEach((node) => lines.push(`- ${node.id} [${node.type}] ${node.label}`));
  }

  const edges = profile.knowledge_graph.edges.slice(0, 6);
  if (edges.length) {
    lines.push("", "Edge sample");
    edges.forEach((edge) => lines.push(`- ${edge.from} --${edge.type}--> ${edge.to}`));
  }

  return lines;
}

function buildStoredProviderConfigLines(storeRoot: string): string[] {
  const stored = getStoredProviderConfig({ rootDir: storeRoot });
  return [
    `Path: ${stored.path}`,
    `Configured: ${stored.configured}`,
    `Provider: ${stored.provider ?? "none"}`,
    `Model: ${stored.model ?? "none"}`,
    `Enabled: ${stored.enabled}`,
    `Has API key: ${stored.has_api_key}`
  ];
}

function buildStateLines(profile: PsonProfile): string[] {
  const snapshot = getActiveStateSnapshot(profile);
  if (!snapshot.active_states.length) {
    return ["No active states derived yet."];
  }

  return snapshot.active_states.map((state) => `- ${state.state_id}: ${state.likelihood.toFixed(2)}`);
}

function makePanel(title: string, lines: string[], width = 76): string[] {
  const innerWidth = Math.max(20, width - 4);
  const top = `┌${"─".repeat(width - 2)}┐`;
  const titleText = ` ${title} `;
  const titleFill = Math.max(0, width - 2 - titleText.length);
  const titleBar = `├${titleText}${"─".repeat(titleFill)}┤`;
  const body = lines.map((line) => `│ ${line.slice(0, innerWidth).padEnd(innerWidth)} │`);
  const bottom = `└${"─".repeat(width - 2)}┘`;
  return [top, titleBar, ...body, bottom];
}

function renderConsoleScreen(state: ConsoleState): void {
  console.clear();

  const provider = getProviderStatusFromEnv();
  const profileLabel = state.profileId ? shortId(state.profileId, 16) : "none";
  const sessionLabel = state.sessionId ? shortId(state.sessionId, 16) : "none";
  const pendingLabel = state.pendingQuestion ? state.pendingQuestion.id : "none";
  const providerLabel = provider.provider ?? "rules-only";

  const headerLines = [
    "PSON5 Terminal Console",
    `Profile ${profileLabel} | Session ${sessionLabel} | Provider ${providerLabel} | Pending ${pendingLabel}`,
    `Store ${state.storeRoot}`
  ];

  const workflowLines = [
    "1. /init <userId> or /load <profileId>",
    "2. /next to stage a question",
    "3. type the answer directly",
    "4. /simulate <task>",
    "5. /agent-context <intent>"
  ];

  const shortcutsLines = [
    "/help flow",
    "/help commands",
    "/help examples",
    "/provider",
    "/inspect inferred",
    "/export safe"
  ];

  const activityLines =
    state.activity.length > 0
      ? state.activity.map((item) => `[${item.at}] ${item.title} - ${item.detail}`)
      : ["No activity yet. Start with /init <userId> or /load <profileId>."];

  const stagedLines = state.pendingQuestion
    ? buildQuestionLines(state.pendingQuestion)
    : ["No question staged.", "Run /next after loading or creating a profile."];

  [
    ...makePanel("Overview", headerLines),
    ...makePanel("Workflow", workflowLines),
    ...makePanel("Shortcuts", shortcutsLines),
    ...makePanel("Staged Question", stagedLines),
    ...makePanel(state.viewTitle || "Main View", state.viewLines.length ? state.viewLines : ["No active view."], 110),
    ...makePanel("Recent Activity", activityLines, 110)
  ].forEach((line) => console.log(line));

  console.log("");
  console.log(`Input hint: ${state.pendingQuestion ? "type an answer or use /answer <value>" : "use /help flow"}`);
}

function printConsoleStatus(state: ConsoleState): void {
  printDivider("Session");
  printKeyValue("store", state.storeRoot);
  printKeyValue("profile", state.profileId ?? "none");
  printKeyValue("session", state.sessionId ?? "none");
  printKeyValue(
    "pending",
    state.pendingQuestion ? `${state.pendingQuestion.id} (${state.pendingQuestion.domain})` : "none"
  );
  printKeyValue("intent", state.lastIntent ?? "none");
  const provider = getProviderStatusFromEnv();
  printKeyValue("provider", provider.provider ?? "rules-only");
  printKeyValue("provider_mode", provider.enabled ? "configured" : "disabled");
}

function printQuestion(question: QuestionDefinition): void {
  printDivider("Question");
  printKeyValue("id", question.id);
  printKeyValue("domain", question.domain);
  printKeyValue("type", question.type);
  printKeyValue("depth", question.depth);
  console.log(question.prompt);

  if (question.choices?.length) {
    console.log("");
    console.log("Choices");
    question.choices.forEach((choice) => {
      console.log(`  ${choice.value.padEnd(18)} ${choice.label}`);
    });
  }
}

function printSimulationResult(result: Awaited<ReturnType<typeof simulateStoredProfile>>): void {
  printDivider("Simulation");
  printKeyValue("prediction", result.prediction);
  printKeyValue("confidence", result.confidence.toFixed(2));
  printKeyValue("cached", result.cached);
  if (result.provider) {
    printKeyValue("provider_mode", result.provider.mode);
    printKeyValue("provider", result.provider.provider);
    printKeyValue("model", result.provider.model);
    if (result.provider.reason) {
      printKeyValue("provider_reason", result.provider.reason);
    }
  }

  if (result.reasoning.length) {
    console.log("");
    console.log("Reasoning");
    result.reasoning.forEach((entry) => console.log(`  - ${entry}`));
  }

  if (result.caveats.length) {
    console.log("");
    console.log("Caveats");
    result.caveats.forEach((entry) => console.log(`  - ${entry}`));
  }

  if (result.alternatives?.length) {
    console.log("");
    console.log("Alternatives");
    result.alternatives.forEach((entry) => console.log(`  - ${entry}`));
  }
}

function printAgentContext(context: Awaited<ReturnType<typeof buildStoredAgentContext>>): void {
  printDivider("Agent Context");
  printKeyValue("profile", context.profile_id);
  printKeyValue("intent", context.intent);
  printKeyValue("generated_at", context.generated_at);
  printKeyValue("local_only", context.constraints.local_only);
  printKeyValue("restricted_fields", context.constraints.restricted_fields.join(", ") || "none");

  const sections = [
    ["preferences", context.personal_data.preferences],
    ["communication", context.personal_data.communication_style],
    ["behavior", context.personal_data.behavioral_patterns],
    ["learning", context.personal_data.learning_profile],
    ["state", context.personal_data.current_state],
    ["predictions", context.personal_data.predictions]
  ] as const;

  for (const [label, entries] of sections) {
    if (!entries.length) {
      continue;
    }

    console.log("");
    console.log(label);
    entries.forEach((entry) => {
      console.log(
        `  - ${entry.key}: ${formatValue(entry.value)} [src=${entry.source} conf=${entry.confidence.toFixed(
          2
        )} rel=${entry.relevance.toFixed(2)}]`
      );
    });
  }
}

function printGraphSummary(profile: PsonProfile): void {
  printDivider("Knowledge Graph");
  printKeyValue("nodes", profile.knowledge_graph.nodes.length);
  printKeyValue("edges", profile.knowledge_graph.edges.length);

  const sampleNodes = profile.knowledge_graph.nodes.slice(0, 8);
  if (sampleNodes.length) {
    console.log("");
    console.log("Node sample");
    sampleNodes.forEach((node) => {
      console.log(`  - ${node.id} [${node.type}] ${node.label}`);
    });
  }

  const sampleEdges = profile.knowledge_graph.edges.slice(0, 8);
  if (sampleEdges.length) {
    console.log("");
    console.log("Edge sample");
    sampleEdges.forEach((edge) => {
      console.log(`  - ${edge.from} --${edge.type}--> ${edge.to}`);
    });
  }
}

function printStateSnapshot(profile: PsonProfile): void {
  const snapshot = getActiveStateSnapshot(profile);
  printDivider("State");
  printKeyValue("profile", snapshot.profile_id);
  if (!snapshot.active_states.length) {
    console.log("No active states derived yet.");
    return;
  }

  snapshot.active_states.forEach((state) => {
    console.log(`  - ${state.state_id.padEnd(18)} ${state.likelihood.toFixed(2)}`);
  });
}

function printProfileInspection(profile: PsonProfile, mode: string): void {
  printDivider(`Inspect: ${mode}`);

  if (mode === "observed") {
    console.log(JSON.stringify(profile.layers.observed, null, 2));
    return;
  }

  if (mode === "inferred") {
    console.log(JSON.stringify(profile.layers.inferred, null, 2));
    return;
  }

  if (mode === "privacy") {
    console.log(JSON.stringify({ consent: profile.consent, privacy: profile.privacy }, null, 2));
    return;
  }

  console.log(JSON.stringify(profile, null, 2));
}

function parseSimulationContext(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("simulate requires a task string or JSON object.");
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  return { task: trimmed };
}

function requireProfileId(state: ConsoleState): string {
  if (!state.profileId) {
    throw new Error("No active profile. Use /init or /load first.");
  }

  return state.profileId;
}

function createCompleter(state: ConsoleState): Completer {
  return (line: string): [string[], string] => {
    const trimmed = line.trimStart();
    const tokens = tokenizeInput(trimmed);
    const current = tokens.at(-1) ?? "";
    const first = tokens[0] ?? "";

    if (!tokens.length || trimmed.startsWith("/")) {
      if (tokens.length <= 1) {
        const matches = CONSOLE_COMMANDS.filter((command) => command.startsWith(first || "/"));
        return [matches.length ? matches : CONSOLE_COMMANDS, first || ""];
      }

      if (first === "/inspect") {
        const matches = ["full", "observed", "inferred", "privacy"].filter((value) =>
          value.startsWith(current)
        );
        return [matches, current];
      }

      if (first === "/help") {
        const matches = HELP_TOPICS.filter((value) => value.startsWith(current));
        return [matches, current];
      }

      if (first === "/export") {
        const matches = ["safe", "full"].filter((value) => value.startsWith(current));
        return [matches, current];
      }

      if (first === "/provider") {
        const matches = ["policy"].filter((value) => value.startsWith(current));
        return [matches, current];
      }

      if (first === "/provider-setup") {
        const matches = ["openai", "anthropic"].filter((value) => value.startsWith(current));
        return [matches, current];
      }

      if (first === "/learn") {
        const matches = [
          "core_problem_solving_style",
          "core_learning_mode",
          "core_task_start_pattern",
          "core_deadline_effect",
          "prod_planning_style",
          "edu_revision_style"
        ].filter((value) => value.startsWith(current));
        return [matches, current];
      }
    }

    if (!trimmed.startsWith("/") && state.pendingQuestion?.choices?.length) {
      const matches = state.pendingQuestion.choices
        .map((choice) => choice.value)
        .filter((value) => value.startsWith(current));
      return [matches, current];
    }

    return [[], current];
  };
}

async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    return task();
  }

  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;
  let previous = "";
  const timer = setInterval(() => {
    previous = `${frames[frameIndex % frames.length]} ${label}`;
    process.stdout.write(`\r${previous}`);
    frameIndex += 1;
  }, 90);

  try {
    return await task();
  } finally {
    clearInterval(timer);
    process.stdout.write(`\r${" ".repeat(previous.length)}\r`);
  }
}

async function submitConsoleAnswer(state: ConsoleState, questionId: string, value: string): Promise<void> {
  const profileId = requireProfileId(state);
  const result = await withSpinner("learning", async () =>
    submitLearningAnswers(
      {
        profile_id: profileId,
        session_id: state.sessionId,
        answers: [{ question_id: questionId, value }],
        options: {
          return_next_questions: true
        }
      },
      { rootDir: state.storeRoot }
    )
  );

  state.sessionId = result.session.session_id;
  state.pendingQuestion = result.next_questions?.[0];
  pushActivity(state, "learn", `${questionId} = ${value}`);
  setView(state, "Learning Update", [
    `Revision: ${result.profile.metadata.revision}`,
    `Updated fields: ${result.updated_fields.join(", ") || "none"}`,
    `Session: ${result.session.session_id}`,
    `Queued next questions: ${result.next_questions?.length ?? 0}`,
    "",
    ...(state.pendingQuestion
      ? ["Next staged question", "", ...buildQuestionLines(state.pendingQuestion)]
      : ["No more immediate questions in this session."])
  ]);
}

async function handleConsoleCommand(input: string, state: ConsoleState): Promise<void> {
  const trimmed = input.trim();
  if (!trimmed) {
    return;
  }

  if (!trimmed.startsWith("/")) {
    if (state.pendingQuestion) {
      await submitConsoleAnswer(state, state.pendingQuestion.id, trimmed);
      return;
    }

    throw new Error("Free text is only accepted when a question is staged. Use /help.");
  }

  const tokens = tokenizeInput(trimmed);
  const [command, ...args] = tokens;
  const rawArgs = trimmed.slice(command.length).trim();

  if (command === "/home") {
    setView(state, "Home", createHelpLines("flow"));
    pushActivity(state, "home", "returned to dashboard");
    return;
  }

  if (command === "/help") {
    const topic = args[0] ?? "flow";
    setView(state, `Help: ${topic}`, createHelpLines(topic));
    pushActivity(state, "help", topic);
    return;
  }

  if (command === "/examples") {
    setView(state, "Examples", createHelpLines("examples"));
    pushActivity(state, "examples", "opened command examples");
    return;
  }

  if (command === "/status") {
    const provider = getProviderStatusFromEnv();
    setView(state, "Status", [
      `Store: ${state.storeRoot}`,
      `Profile: ${state.profileId ?? "none"}`,
      `Session: ${state.sessionId ?? "none"}`,
      `Pending question: ${state.pendingQuestion ? state.pendingQuestion.id : "none"}`,
      `Last intent: ${state.lastIntent ?? "none"}`,
      `Provider: ${provider.provider ?? "rules-only"}`,
      `Provider enabled: ${provider.enabled}`
    ]);
    pushActivity(state, "status", "refreshed session status");
    return;
  }

  if (command === "/provider") {
    if (args[0] === "policy") {
      const operation = (args[1] as ConsoleOperation | undefined) ?? "simulation";
      if (operation !== "modeling" && operation !== "simulation") {
        throw new Error("/provider policy requires modeling or simulation.");
      }

      const profile = await loadProfile(requireProfileId(state), { rootDir: state.storeRoot });
      setView(state, "Provider Policy", makeJsonLines(getProviderPolicyStatus(profile, operation)));
      pushActivity(state, "provider policy", operation);
      return;
    }

    const provider = getProviderStatusFromEnv();
    setView(state, "Provider", [
      `Enabled: ${provider.enabled}`,
      `Provider: ${provider.provider ?? "none"}`,
      `Model: ${provider.model ?? "none"}`,
      `Configured: ${provider.configured}`,
      `Source: ${provider.source ?? "none"}`,
      `Reason: ${provider.reason ?? "ready"}`,
      `Capabilities: ${provider.capabilities.join(", ") || "none"}`
    ]);
    pushActivity(state, "provider", provider.provider ?? "rules-only");
    return;
  }

  if (command === "/provider-setup") {
    const provider = args[0];
    const apiKey = args[1];
    const model = args[2];
    if ((provider !== "openai" && provider !== "anthropic") || !apiKey) {
      throw new Error("/provider-setup requires <openai|anthropic> <apiKey> [model].");
    }

    const saved = await withSpinner("saving provider config", async () =>
      saveProviderConfig(
        {
          provider,
          enabled: true,
          model: model ?? null,
          api_key: apiKey
        },
        { rootDir: state.storeRoot }
      )
    );

    setView(state, "Provider Config Saved", [
      `Path: ${saved.path}`,
      `Provider: ${saved.provider ?? "none"}`,
      `Model: ${saved.model ?? "default"}`,
      `Enabled: ${saved.enabled}`,
      `API key stored: ${saved.has_api_key}`
    ]);
    pushActivity(state, "provider-setup", provider);
    return;
  }

  if (command === "/provider-clear") {
    const result = await withSpinner("clearing provider config", async () =>
      clearStoredProviderConfig({ rootDir: state.storeRoot })
    );
    setView(state, "Provider Config Cleared", [`Path: ${result.path}`, `Cleared: ${result.cleared}`]);
    pushActivity(state, "provider-clear", result.path);
    return;
  }

  if (command === "/init") {
    const userId = args[0];
    if (!userId) {
      throw new Error("/init requires a user id.");
    }

    const profile = await withSpinner("creating profile", async () =>
      initProfile({ user_id: userId }, { rootDir: state.storeRoot })
    );

    state.profileId = profile.profile_id;
    state.sessionId = undefined;
    state.pendingQuestion = undefined;
    setView(state, "Profile Ready", [
      `Profile id: ${profile.profile_id}`,
      `Revision: ${profile.metadata.revision}`,
      `Store: ${state.storeRoot}`,
      "",
      "Next step",
      "/next"
    ]);
    pushActivity(state, "init", profile.profile_id);
    return;
  }

  if (command === "/load") {
    const profileId = args[0];
    if (!profileId) {
      throw new Error("/load requires a profile id.");
    }

    const profile = await withSpinner("loading profile", async () =>
      loadProfile(profileId, { rootDir: state.storeRoot })
    );

    state.profileId = profile.profile_id;
    state.sessionId = undefined;
    state.pendingQuestion = undefined;
    setView(state, "Profile Loaded", [
      `Profile id: ${profile.profile_id}`,
      `Revision: ${profile.metadata.revision}`,
      `Confidence: ${profile.metadata.confidence.toFixed(2)}`,
      "",
      "Suggested next steps",
      "/next",
      "/inspect inferred",
      "/simulate <task>"
    ]);
    pushActivity(state, "load", profile.profile_id);
    return;
  }

  if (command === "/next") {
    const profileId = requireProfileId(state);
    const domains = args[0] ? args[0].split(",").map((value) => value.trim()).filter(Boolean) : undefined;
    const limit = args[1] ? Number.parseInt(args[1], 10) : 1;
    const result = await withSpinner("finding next question", async () =>
      getNextQuestions(
        profileId,
        {
          session_id: state.sessionId,
          domains,
          limit: Number.isNaN(limit) ? 1 : limit
        },
        { rootDir: state.storeRoot }
      )
    );

    state.sessionId = result.session.session_id;
    state.pendingQuestion = result.questions[0];
    setView(state, "Question Queue", [
      `Session: ${result.session.session_id}`,
      `Returned: ${result.questions.length}`,
      "",
      ...(state.pendingQuestion
        ? ["Current staged question", "", ...buildQuestionLines(state.pendingQuestion)]
        : ["No more questions available for the current session."])
    ]);
    pushActivity(
      state,
      "next",
      state.pendingQuestion ? `staged ${state.pendingQuestion.id}` : "no questions returned"
    );
    return;
  }

  if (command === "/answer") {
    if (!state.pendingQuestion) {
      throw new Error("No staged question. Use /next first.");
    }

    if (!rawArgs) {
      throw new Error("/answer requires a value.");
    }

    await submitConsoleAnswer(state, state.pendingQuestion.id, rawArgs);
    return;
  }

  if (command === "/learn") {
    const questionId = args[0];
    const value = trimmed.slice(command.length + (questionId?.length ?? 0) + 2).trim();
    if (!questionId || !value) {
      throw new Error("/learn requires <questionId> <value>.");
    }

    await submitConsoleAnswer(state, questionId, value);
    return;
  }

  if (command === "/simulate") {
    const profileId = requireProfileId(state);
    const result = await withSpinner("simulating", async () =>
      simulateStoredProfile(
        {
          profile_id: profileId,
          context: parseSimulationContext(rawArgs),
          options: {
            include_reasoning: true,
            include_evidence: true,
            explanation_level: "standard"
          }
        },
        { rootDir: state.storeRoot }
      )
    );

    setView(state, "Simulation", buildSimulationLines(result));
    pushActivity(state, "simulate", `${result.prediction} @ ${result.confidence.toFixed(2)}`);
    return;
  }

  if (command === "/agent-context") {
    const profileId = requireProfileId(state);
    const intent = rawArgs || state.lastIntent || "general_assistance";
    state.lastIntent = intent;

    const context = await withSpinner("building agent context", async () =>
      buildStoredAgentContext(
        profileId,
        {
          intent,
          include_predictions: true,
          max_items: 12
        },
        { rootDir: state.storeRoot }
      )
    );

    setView(state, "Agent Context", buildAgentContextLines(context));
    pushActivity(state, "agent-context", intent);
    return;
  }

  if (command === "/inspect") {
    const profile = await withSpinner("loading inspection", async () =>
      loadProfile(requireProfileId(state), { rootDir: state.storeRoot })
    );
    const mode = args[0] ?? "full";
    if (mode === "observed") {
      setView(state, "Inspect: observed", makeJsonLines(profile.layers.observed));
    } else if (mode === "inferred") {
      setView(state, "Inspect: inferred", makeJsonLines(profile.layers.inferred));
    } else if (mode === "privacy") {
      setView(state, "Inspect: privacy", makeJsonLines({ consent: profile.consent, privacy: profile.privacy }));
    } else {
      setView(state, "Inspect: full", makeJsonLines(profile));
    }
    pushActivity(state, "inspect", mode);
    return;
  }

  if (command === "/state") {
    const profile = await withSpinner("loading state", async () =>
      loadProfile(requireProfileId(state), { rootDir: state.storeRoot })
    );
    setView(state, "State", buildStateLines(profile));
    pushActivity(state, "state", "loaded active states");
    return;
  }

  if (command === "/graph") {
    const profile = await withSpinner("loading graph", async () =>
      loadProfile(requireProfileId(state), { rootDir: state.storeRoot })
    );
    setView(state, "Knowledge Graph", buildGraphSummaryLines(profile));
    pushActivity(state, "graph", "loaded graph summary");
    return;
  }

  if (command === "/export") {
    const redactionLevel = (args[0] as RedactionLevel | undefined) ?? "safe";
    if (redactionLevel !== "full" && redactionLevel !== "safe") {
      throw new Error("/export requires safe or full.");
    }

    const exported = await withSpinner("exporting profile", async () =>
      exportStoredProfile(requireProfileId(state), {
        rootDir: state.storeRoot,
        redaction_level: redactionLevel
      })
    );

    setView(state, `Export: ${redactionLevel}`, toLines(exported));
    pushActivity(state, "export", redactionLevel);
    return;
  }

  if (command === "/clear") {
    console.clear();
    setView(state, "Home", createHelpLines("flow"));
    pushActivity(state, "clear", "cleared screen");
    return;
  }

  if (command === "/exit") {
    state.running = false;
    pushActivity(state, "exit", "closing console");
    return;
  }

  throw new Error(`Unknown console command '${command}'. Use /help.`);
}

async function startConsole(storeRoot: string, profileId?: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive console requires a TTY terminal.");
  }

  const state: ConsoleState = {
    storeRoot,
    profileId,
    running: true,
    viewTitle: "Home",
    viewLines: createHelpLines("flow"),
    activity: []
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: createCompleter(state)
  });

  rl.on("SIGINT", () => {
    state.running = false;
    rl.close();
  });

  pushActivity(state, "boot", "console ready");
  renderConsoleScreen(state);
  rl.setPrompt(buildPrompt(state));
  rl.prompt();

  for await (const line of rl) {
    try {
      await handleConsoleCommand(line, state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      setView(state, "Error", [message, "", "Use /help flow or /help commands."]);
      pushActivity(state, "error", message);
    }

    if (!state.running) {
      console.log("Closing PSON console.");
      rl.close();
      break;
    }

    renderConsoleScreen(state);
    rl.setPrompt(buildPrompt(state));
    rl.prompt();
  }
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command) {
    printUsage();
    return;
  }

  const storeDir = consumeOption(rest, "--store");
  const sessionId = consumeOption(rest, "--session");
  const domainsOption = consumeOption(rest, "--domains");
  const depth = consumeOption(rest, "--depth") as PsonDepth | undefined;
  const limitOption = consumeOption(rest, "--limit");
  const contextOption = consumeOption(rest, "--context");
  const redactionLevel = consumeOption(rest, "--redaction") as RedactionLevel | undefined;
  const overwrite = consumeFlag(rest, "--overwrite");
  const intentOption = consumeOption(rest, "--intent");
  const maxItemsOption = consumeOption(rest, "--max-items");
  const minConfidenceOption = consumeOption(rest, "--min-confidence");
  const includePredictions = consumeFlag(rest, "--include-predictions");
  const profileOption = consumeOption(rest, "--profile");
  const apiKeyOption = consumeOption(rest, "--api-key");
  const modelOption = consumeOption(rest, "--model");
  const baseUrlOption = consumeOption(rest, "--base-url");
  const timeoutMsOption = consumeOption(rest, "--timeout-ms");
  const uriOption = consumeOption(rest, "--uri");
  const usernameOption = consumeOption(rest, "--username");
  const passwordOption = consumeOption(rest, "--password");
  const databaseOption = consumeOption(rest, "--database");
  const neo4jDisabled = consumeFlag(rest, "--disabled");
  const storeRoot = resolveStoreRoot({ rootDir: storeDir });
  const domains = domainsOption ? domainsOption.split(",").map((value) => value.trim()).filter(Boolean) : undefined;
  const limit = limitOption ? Number.parseInt(limitOption, 10) : undefined;
  const maxItems = maxItemsOption ? Number.parseInt(maxItemsOption, 10) : undefined;
  const minConfidence = minConfidenceOption ? Number.parseFloat(minConfidenceOption) : undefined;

  if (command === "console") {
    const { startInkConsole } = await import("./ink-console.js");
    await startInkConsole(storeRoot, profileOption);
    return;
  }

  if (command === "mcp-stdio") {
    await startMcpStdioServer(storeRoot);
    return;
  }

  if (command === "console-legacy") {
    await startConsole(storeRoot, profileOption);
    return;
  }

  if (command === "init") {
    const userId = rest[0];
    if (!userId) {
      throw new Error("init requires a user id.");
    }

    const profile = await initProfile({ user_id: userId }, { rootDir: storeRoot });
    console.log(
      JSON.stringify(
        {
          profile_id: profile.profile_id,
          revision: profile.metadata.revision,
          store_root: storeRoot,
          current_path: path.join(storeRoot, "profiles", profile.profile_id, "current.json")
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "simulate") {
    const profileId = rest[0];
    if (!profileId || !contextOption) {
      throw new Error("simulate requires a profile id and --context JSON.");
    }

    const context = JSON.parse(contextOption) as Record<string, unknown>;
    const result = await simulateStoredProfile(
      {
        profile_id: profileId,
        context,
        domains,
        options: {
          include_reasoning: true,
          include_evidence: true,
          explanation_level: "standard"
        }
      },
      { rootDir: storeRoot }
    );

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "agent-context") {
    const profileId = rest[0];
    const intent = intentOption;
    if (!profileId || !intent) {
      throw new Error("agent-context requires a profile id and --intent text.");
    }

    const options: AgentContextOptions = {
      intent,
      domains,
      max_items: maxItems,
      include_predictions: includePredictions,
      min_confidence: minConfidence
    };
    const context = await buildStoredAgentContext(profileId, options, { rootDir: storeRoot });
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  if (command === "provider-status") {
    console.log(JSON.stringify(getProviderStatusFromEnv({ rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "provider-config") {
    console.log(JSON.stringify(getStoredProviderConfig({ rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "provider-set") {
    const provider = rest[0];
    if ((provider !== "openai" && provider !== "anthropic") || !apiKeyOption) {
      throw new Error("provider-set requires <openai|anthropic> and --api-key.");
    }

    const saved = await saveProviderConfig(
      {
        provider,
        enabled: true,
        model: modelOption ?? null,
        base_url: baseUrlOption,
        timeout_ms: timeoutMsOption ? Number.parseInt(timeoutMsOption, 10) : undefined,
        api_key: apiKeyOption
      },
      { rootDir: storeRoot }
    );
    console.log(JSON.stringify(saved, null, 2));
    return;
  }

  if (command === "provider-wizard") {
    await runProviderWizard(storeRoot);
    return;
  }

  if (command === "provider-clear") {
    console.log(JSON.stringify(await clearStoredProviderConfig({ rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "provider-policy") {
    const profileId = rest[0];
    const operation = rest[1];
    if (!profileId || (operation !== "modeling" && operation !== "simulation")) {
      throw new Error("provider-policy requires a profile id and operation of modeling or simulation.");
    }

    const profile = await loadProfile(profileId, { rootDir: storeRoot });
    console.log(JSON.stringify(getProviderPolicyStatus(profile, operation, { rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "neo4j-status") {
    console.log(JSON.stringify(await getNeo4jStatus({ rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "neo4j-config") {
    console.log(JSON.stringify(getStoredNeo4jConfig({ rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "neo4j-set") {
    if (!uriOption || !usernameOption || !passwordOption) {
      throw new Error("neo4j-set requires --uri, --username, and --password.");
    }

    const saved = saveNeo4jConfig(
      {
        uri: uriOption,
        username: usernameOption,
        password: passwordOption,
        database: databaseOption ?? null,
        enabled: !neo4jDisabled
      },
      { rootDir: storeRoot }
    );
    console.log(JSON.stringify(saved, null, 2));
    return;
  }

  if (command === "neo4j-wizard") {
    await runNeo4jWizard(storeRoot);
    return;
  }

  if (command === "neo4j-clear") {
    console.log(JSON.stringify(clearStoredNeo4jConfig({ rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "neo4j-sync") {
    const profileId = rest[0];
    if (!profileId) {
      throw new Error("neo4j-sync requires a profile id.");
    }

    console.log(JSON.stringify(await syncStoredProfileKnowledgeGraph(profileId, { rootDir: storeRoot }), null, 2));
    return;
  }

  if (command === "graph") {
    const profileId = rest[0];
    if (!profileId) {
      throw new Error("graph requires a profile id.");
    }

    const profile = await loadProfile(profileId, { rootDir: storeRoot });
    console.log(JSON.stringify(profile.knowledge_graph, null, 2));
    return;
  }

  if (command === "state") {
    const profileId = rest[0];
    if (!profileId) {
      throw new Error("state requires a profile id.");
    }

    const profile = await loadProfile(profileId, { rootDir: storeRoot });
    console.log(JSON.stringify(getActiveStateSnapshot(profile), null, 2));
    return;
  }

  if (command === "explain") {
    const profileId = rest[0];
    const prediction = rest[1];
    if (!profileId || !prediction) {
      throw new Error("explain requires a profile id and prediction.");
    }

    const profile = await loadProfile(profileId, { rootDir: storeRoot });
    console.log(JSON.stringify({ support: explainPredictionSupport(profile, prediction) }, null, 2));
    return;
  }

  if (command === "question-next") {
    const profileId = rest[0];
    if (!profileId) {
      throw new Error("question-next requires a profile id.");
    }

    const result = await getNextQuestions(
      profileId,
      {
        session_id: sessionId,
        domains,
        depth,
        limit
      },
      { rootDir: storeRoot }
    );

    console.log(
      JSON.stringify(
        {
          session_id: result.session.session_id,
          questions: result.questions
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "learn") {
    const profileId = rest[0];
    const questionId = rest[1];
    const value = rest.slice(2).join(" ");

    if (!profileId || !questionId || !value) {
      throw new Error("learn requires profile id, question id, and value.");
    }

    const result = await submitLearningAnswers(
      {
        profile_id: profileId,
        session_id: sessionId,
        domains,
        depth,
        answers: [
          {
            question_id: questionId,
            value
          }
        ],
        options: {
          return_next_questions: true
        }
      },
      { rootDir: storeRoot }
    );

    console.log(
      JSON.stringify(
        {
          session_id: result.session.session_id,
          revision: result.profile.metadata.revision,
          updated_fields: result.updated_fields,
          next_questions: result.next_questions
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "inspect") {
    const profileId = rest[0];
    if (!profileId) {
      throw new Error("inspect requires a profile id.");
    }

    const profile = await loadProfile(profileId, { rootDir: storeRoot });
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  if (command === "inspect-user") {
    const userId = rest[0];
    if (!userId) {
      throw new Error("inspect-user requires a user id.");
    }

    const profile = await loadProfileByUserId(userId, { rootDir: storeRoot });
    const profileIds = await findProfilesByUserId(userId, { rootDir: storeRoot });
    console.log(JSON.stringify({ user_id: userId, profile_ids: profileIds, profile }, null, 2));
    return;
  }

  if (command === "export") {
    const profileId = rest[0];
    if (!profileId) {
      throw new Error("export requires a profile id.");
    }

    if (redactionLevel && redactionLevel !== "full" && redactionLevel !== "safe") {
      throw new Error("export --redaction must be full or safe.");
    }

    console.log(await exportStoredProfile(profileId, { rootDir: storeRoot, redaction_level: redactionLevel }));
    return;
  }

  if (command === "import") {
    const filePath = rest[0];
    if (!filePath) {
      throw new Error("import requires a path to a JSON file.");
    }

    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const profile = await importProfileDocument(parsed, { rootDir: storeRoot, overwrite });
    console.log(
      JSON.stringify(
        {
          profile_id: profile.profile_id,
          revision: profile.metadata.revision,
          imported: true,
          overwrite
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "validate") {
    const filePath = rest[0];
    if (!filePath) {
      throw new Error("validate requires a path to a JSON file.");
    }

    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = validateProfile(parsed);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.success ? 0 : 1;
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(message);
  process.exitCode = 1;
});
