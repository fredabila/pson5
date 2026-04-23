import React, { useEffect, useMemo, useState } from "react";
import { Box, render, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import chalk from "chalk";
import { buildStoredAgentContext } from "@pson5/agent-context";
import type { PsonProfile, QuestionDefinition } from "@pson5/core-types";
import { getNextQuestions, submitLearningAnswers } from "@pson5/acquisition-engine";
import { explainPredictionSupport } from "@pson5/graph-engine";
import {
  deriveConsoleIntent,
  getProviderPolicyStatus,
  getProviderStatusFromEnv,
  getStoredProviderConfig
} from "@pson5/provider-engine";
import {
  exportStoredProfile,
  initProfile,
  loadProfile
} from "@pson5/serialization-engine";
import {
  getNeo4jStatus,
  syncStoredProfileKnowledgeGraph
} from "@pson5/neo4j-store";
import { simulateStoredProfile } from "@pson5/simulation-engine";
import { getActiveStateSnapshot } from "@pson5/state-engine";

type ViewMode = "home" | "simulation" | "agent" | "inspect" | "state" | "graph" | "provider" | "neo4j" | "error";

interface ActivityItem {
  at: string;
  title: string;
  detail: string;
}

interface ConsoleModel {
  storeRoot: string;
  profileId?: string;
  sessionId?: string;
  pendingQuestion?: QuestionDefinition;
  lastIntent?: string;
  view: ViewMode;
  title: string;
  lines: string[];
  activity: ActivityItem[];
}

const BRAIN_FRAMES = [
  ["      .-''''-.", "    .'  .-.  '.", "   /   (   )   \\", "  |  .-`-'-`-.  |", "  | /  neural  \\ |", "  | |  weave   | |", "  | \\  pulse   / |", "   \\  `-...-'  /", "    '.       .'", "      `-...-'"],
  ["      .-''''-.", "    .'  .-.  '.", "   /   ( o )   \\", "  |  .-`-'-`-.  |", "  | / synaptic \\ |", "  | | shimmer  | |", "  | \\ current  / |", "   \\  `-...-'  /", "    '.       .'", "      `-...-'"],
  ["      .-''''-.", "    .'  .-.  '.", "   /   (   )   \\", "  |  .-`-'-`-.  |", "  | / context  \\ |", "  | | braid    | |", "  | \\ signal   / |", "   \\  `-...-'  /", "    '.   *   .'", "      `-...-'"],
  ["      .-''''-.", "    .'  .-.  '.", "   /   ( . )   \\", "  |  .-`-'-`-.  |", "  | / insight  \\ |", "  | | orbit    | |", "  | \\ engine   / |", "   \\  `-...-'  /", "    '.       .'", "      `-...-'"]
];

const COMMANDS = [
  "/help",
  "/init",
  "/load",
  "/next",
  "/answer",
  "/simulate",
  "/agent-context",
  "/inspect",
  "/state",
  "/graph",
  "/provider",
  "/provider-policy",
  "/neo4j",
  "/neo4j-sync",
  "/export",
  "/clear",
  "/quit"
];

function useTerminalColumns(): number {
  const [columns, setColumns] = useState(() => process.stdout.columns || 120);

  useEffect(() => {
    const handleResize = () => setColumns(process.stdout.columns || 120);
    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);

  return columns;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function tokenizeInput(input: string): string[] {
  const matches = input.match(/"([^"]*)"|'([^']*)'|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function parseSimulationContext(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Simulation requires a task string or JSON context.");
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  const deadlineMatch = trimmed.match(/(\d+)\s+days?/i);
  return {
    task: trimmed,
    deadline_days: deadlineMatch ? Number.parseInt(deadlineMatch[1], 10) : undefined
  };
}

function trimForActivity(value: string, max = 74): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function compactLabel(value: string | undefined, max = 24): string {
  if (!value) {
    return "none";
  }

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, Math.max(8, max - 9))}...${value.slice(-6)}`;
}

function asLines(value: unknown, maxLines = 30): string[] {
  const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const lines = content.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines - 1), `... truncated ${lines.length - maxLines + 1} more lines ...`];
}

function helpLines(): string[] {
  return [
    "Flow",
    "",
    "/init <userId>        create a profile",
    "/load <profileId>     load a profile",
    "/next                 fetch the next question",
    "type an answer        answer the staged question directly",
    "/simulate <task>      run simulation",
    "/agent-context <intent>",
    "/graph                inspect local graph",
    "/neo4j                inspect Neo4j connectivity",
    "/neo4j-sync           push the profile graph to Neo4j",
    "",
    "Tab autocompletes slash commands. Up/down walks command history."
  ];
}

function questionLines(question?: QuestionDefinition): string[] {
  if (!question) {
    return ["No staged question.", "Run /next after creating or loading a profile."];
  }

  const lines = [`${question.domain} | ${question.type} | ${question.depth}`, "", question.prompt];
  if (question.generated_by === "provider") {
    lines.unshift("Adaptive follow-up", question.source_question_id ? `Base target ${question.source_question_id}` : "Provider-selected prompt", "");
  }
  lines.push(
    "",
    question.answer_style_hint ??
      (question.type === "single_choice"
        ? "Answer naturally in your own words. Exact choice labels are not required."
        : "Answer naturally in your own words.")
  );
  if (question.generation_rationale) {
    lines.push("", `Why this question: ${question.generation_rationale}`);
  }
  if (question.choices?.length) {
    lines.push("", "Choices");
    for (const choice of question.choices) {
      lines.push(`- ${choice.value}: ${choice.label}`);
    }
  }

  return lines;
}

function sessionSignalLines(session?: {
  contradiction_flags?: Array<{ target: string; previous_value: unknown; incoming_value: unknown }>;
  confidence_gaps?: string[];
  fatigue_score?: number;
  stop_reason?: string | null;
}): string[] {
  if (!session) {
    return ["No active learning session."];
  }

  const lines = [
    `Fatigue score ${typeof session.fatigue_score === "number" ? session.fatigue_score.toFixed(2) : "0.00"}`,
    `Confidence gaps ${(session.confidence_gaps ?? []).join(", ") || "none"}`
  ];

  const contradictions = session.contradiction_flags ?? [];
  if (contradictions.length) {
    lines.push("", "Contradictions");
    for (const item of contradictions.slice(-3)) {
      lines.push(`- ${item.target}: ${String(item.previous_value)} -> ${String(item.incoming_value)}`);
    }
  }

  if (session.stop_reason) {
    lines.push("", `Stop reason: ${session.stop_reason}`);
  }

  return lines;
}

function profileSummary(profile?: PsonProfile): string[] {
  if (!profile) {
    return ["No profile loaded yet."];
  }

  return [
    `Profile ${profile.profile_id}`,
    `User ${profile.user_id}`,
    `Revision ${profile.metadata.revision}`,
    `Confidence ${profile.metadata.confidence.toFixed(2)}`,
    `Nodes ${profile.knowledge_graph.nodes.length}`,
    `Edges ${profile.knowledge_graph.edges.length}`
  ];
}

function entryColor(index: number): string {
  return ["cyan", "magenta", "yellow", "green"][index % 4]!;
}

function BrainPanel({ frameIndex, status, width }: { frameIndex: number; status: string[]; width: number }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1} width={width}>
      <Text color="cyanBright" bold>
        Cognitive Mesh
      </Text>
      <Text dimColor>personalization console</Text>
      <Box marginTop={1} flexDirection="column">
        {BRAIN_FRAMES[frameIndex]!.map((line, index) => (
          <Text key={`${frameIndex}-${index}`} color={entryColor(index)}>
            {line}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {status.map((line) => (
          <Text key={line} color="gray" wrap="wrap">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function Panel({ title, lines, width, borderColor = "white" }: { title: string; lines: string[]; width?: number; borderColor?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={1} width={width}>
      <Text bold color={borderColor}>
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {lines.map((line, index) => (
          <Text key={`${title}-${index}`} wrap="wrap">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function CommandSuggestions({
  inputValue,
  suggestions,
  width
}: {
  inputValue: string;
  suggestions: string[];
  width: number;
}) {
  const show = inputValue.startsWith("/") && suggestions.length > 0;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1} width={width}>
      <Text bold color="yellow">
        Slash Commands
      </Text>
      <Box marginTop={1} flexDirection="column">
        {show ? (
          suggestions.slice(0, 7).map((command) => (
            <Text key={command}>
              {command}
            </Text>
          ))
        ) : (
          <Text dimColor>Start typing / to see command suggestions.</Text>
        )}
      </Box>
    </Box>
  );
}

function InputBar({
  busy,
  inputValue,
  setInputValue,
  onSubmit,
  hint,
  width
}: {
  busy: string | null;
  inputValue: string;
  setInputValue: (value: string) => void;
  onSubmit: (value: string) => void;
  hint: string;
  width?: number;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} paddingY={1} width={width}>
      <Text color="greenBright" bold>
        Input
      </Text>
      <Text dimColor>{hint}</Text>
      <Box marginTop={1}>
        <Text color="greenBright">{busy ? "busy> " : "pson> "}</Text>
        {busy ? (
          <Text color="yellow">
            <Spinner type="dots" /> {busy}
          </Text>
        ) : (
          <TextInput value={inputValue} onChange={setInputValue} onSubmit={onSubmit} placeholder="/help" />
        )}
      </Box>
    </Box>
  );
}

function PsonInkConsole({ storeRoot, initialProfileId }: { storeRoot: string; initialProfileId?: string }) {
  const { exit } = useApp();
  const columns = useTerminalColumns();
  const [frameIndex, setFrameIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [profile, setProfile] = useState<PsonProfile | undefined>();
  const [model, setModel] = useState<ConsoleModel>({
    storeRoot,
    profileId: initialProfileId,
    view: "home",
    title: "Home",
    lines: helpLines(),
    activity: [{ at: timestamp(), title: "boot", detail: "Ink console ready" }]
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % BRAIN_FRAMES.length);
    }, 160);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!initialProfileId) {
      return;
    }

    void (async () => {
      try {
        const loaded = await loadProfile(initialProfileId, { rootDir: storeRoot });
        setProfile(loaded);
        setModel((current) => ({
          ...current,
          profileId: loaded.profile_id,
          title: "Profile Loaded",
          lines: profileSummary(loaded)
        }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load initial profile.";
        setModel((current) => ({
          ...current,
          view: "error",
          title: "Startup Error",
          lines: [message]
        }));
      }
    })();
  }, [initialProfileId, storeRoot]);

  const suggestions = useMemo(() => {
    if (!inputValue.startsWith("/")) {
      return [];
    }

    return COMMANDS.filter((command) => command.startsWith(inputValue.trim()));
  }, [inputValue]);

  const isNarrow = columns < 120;
  const isCompact = columns < 155;
  const contentWidth = Math.max(72, columns - 4);
  const brainWidth = isNarrow ? contentWidth : Math.max(28, Math.min(34, Math.floor(contentWidth * 0.24)));
  const workspaceWidth = isNarrow ? contentWidth : Math.max(44, contentWidth - brainWidth - 1);
  const lowerPanelWidth = isCompact ? workspaceWidth : Math.max(30, Math.floor((workspaceWidth - 1) / 2));
  const commandWidth = isCompact ? contentWidth : Math.max(30, Math.min(40, Math.floor(contentWidth * 0.3)));
  const inputWidth = isCompact ? contentWidth : Math.max(34, contentWidth - commandWidth - 1);

  const statusLines = [
    `store ${compactLabel(storeRoot, isNarrow ? 44 : 24)}`,
    `profile ${compactLabel(model.profileId, isNarrow ? 44 : 20)}`,
    `session ${compactLabel(model.sessionId, isNarrow ? 44 : 20)}`,
    `provider ${getProviderStatusFromEnv({ rootDir: storeRoot }).provider ?? "rules-only"}`
  ];

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (busy) {
      return;
    }

    if (key.tab && suggestions.length > 0) {
      setInputValue(`${suggestions[0]} `);
      return;
    }

    if (key.upArrow && history.length > 0) {
      setHistoryIndex((current) => {
        const next = current === null ? history.length - 1 : Math.max(0, current - 1);
        setInputValue(history[next] ?? "");
        return next;
      });
      return;
    }

    if (key.downArrow && history.length > 0) {
      setHistoryIndex((current) => {
        if (current === null) {
          return null;
        }

        const next = current + 1;
        if (next >= history.length) {
          setInputValue("");
          return null;
        }

        setInputValue(history[next] ?? "");
        return next;
      });
    }
  });

  function pushActivity(title: string, detail: string) {
    setModel((current) => ({
      ...current,
      activity: [{ at: timestamp(), title, detail: trimForActivity(detail) }, ...current.activity].slice(0, 8)
    }));
  }

  function setView(title: string, lines: string[], view: ViewMode = "home") {
    setModel((current) => ({
      ...current,
      view,
      title,
      lines
    }));
  }

  function showIntentOutcome(intentTitle: string, detail: string, rationale?: string) {
    setView(
      intentTitle,
      rationale ? [detail, "", `Model rationale: ${rationale}`] : [detail],
      "home"
    );
  }

  async function refreshProfile(profileId: string): Promise<PsonProfile> {
    const loaded = await loadProfile(profileId, { rootDir: storeRoot });
    setProfile(loaded);
    setModel((current) => ({ ...current, profileId: loaded.profile_id }));
    return loaded;
  }

  async function submitAnswer(questionId: string, value: string) {
    const profileId = model.profileId;
    if (!profileId) {
      throw new Error("No profile is loaded.");
    }

    const result = await submitLearningAnswers(
      {
        profile_id: profileId,
        session_id: model.sessionId,
        answers: [{ question_id: questionId, value }],
        options: { return_next_questions: true }
      },
      { rootDir: storeRoot }
    );

    setProfile(result.profile);
    setModel((current) => ({
      ...current,
      sessionId: result.session.session_id,
      pendingQuestion: result.next_questions[0],
      title: "Learning Updated",
      lines: [
        `Revision ${result.profile.metadata.revision}`,
        `Updated fields: ${result.updated_fields.join(", ")}`,
        "",
        "Session signals",
        ...sessionSignalLines(result.session),
        "",
        ...(result.next_questions[0] ? questionLines(result.next_questions[0]) : ["No next question returned."])
      ]
    }));
    pushActivity("answer", `${questionId} = ${value}`);
  }

  async function handleCommand(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    if (model.pendingQuestion && !trimmed.startsWith("/")) {
      await submitAnswer(model.pendingQuestion.id, trimmed);
      return;
    }

    if (!trimmed.startsWith("/")) {
      const interpreted = await deriveConsoleIntent(
        {
          message: trimmed,
          profile_id: model.profileId,
          session_id: model.sessionId,
          pending_question_id: model.pendingQuestion?.id,
          available_actions: COMMANDS
        },
        { rootDir: storeRoot }
      );

      if (interpreted && interpreted.confidence >= 0.45) {
        pushActivity("nl-intent", `${interpreted.action} @ ${interpreted.confidence.toFixed(2)}`);

        if (interpreted.action === "help") {
          setView(
            "Help",
            interpreted.reply ? [interpreted.reply, "", ...helpLines()] : helpLines(),
            "home"
          );
          return;
        }

        if (interpreted.action === "init_profile") {
          if (!interpreted.user_id) {
            throw new Error("The model recognized profile creation but could not extract a user id.");
          }

          const created = await initProfile({ user_id: interpreted.user_id }, { rootDir: storeRoot });
          setProfile(created);
          setModel((current) => ({
            ...current,
            profileId: created.profile_id,
            sessionId: undefined,
            pendingQuestion: undefined
          }));
          setView(
            "Profile Ready",
            [
              ...profileSummary(created),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "home"
          );
          return;
        }

        if (interpreted.action === "load_profile") {
          const profileId = interpreted.profile_id;
          if (!profileId) {
            throw new Error("The model recognized profile loading but no profile id was extracted.");
          }

          const loaded = await refreshProfile(profileId);
          setModel((current) => ({ ...current, sessionId: undefined, pendingQuestion: undefined }));
          setView(
            "Profile Loaded",
            [...profileSummary(loaded), "", `Model rationale: ${interpreted.rationale}`],
            "home"
          );
          return;
        }

        if (interpreted.action === "next_question") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }

          const result = await getNextQuestions(
            model.profileId,
            {
              session_id: model.sessionId,
              limit: 1
            },
            { rootDir: storeRoot }
          );

          setModel((current) => ({
            ...current,
            sessionId: result.session.session_id,
            pendingQuestion: result.questions[0]
          }));
          setView(
            "Question",
            [
              ...questionLines(result.questions[0]),
              "",
              "Session signals",
              ...sessionSignalLines(result.session),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "home"
          );
          return;
        }

        if (interpreted.action === "simulate") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }

          const result = await simulateStoredProfile(
            {
              profile_id: model.profileId,
              context: parseSimulationContext(interpreted.task_text ?? trimmed),
              options: {
                include_reasoning: true,
                include_evidence: true,
                explanation_level: "standard"
              }
            },
            { rootDir: storeRoot }
          );

          setView(
            "Simulation Brief",
            [
              `Prediction ${result.prediction}`,
              `Confidence ${result.confidence.toFixed(2)}`,
              `Cached ${result.cached ? "yes" : "no"}`,
              "",
              ...result.reasoning.map((entry) => `- ${entry}`),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "simulation"
          );
          return;
        }

        if (interpreted.action === "agent_context") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }

          const intent = interpreted.intent ?? trimmed;
          const context = await buildStoredAgentContext(
            model.profileId,
            {
              intent,
              include_predictions: true,
              max_items: 12
            },
            { rootDir: storeRoot }
          );

          setModel((current) => ({ ...current, lastIntent: intent }));
          setView(
            "Agent Context",
            [
              `Intent ${context.intent}`,
              `Generated ${context.generated_at}`,
              "",
              ...[
                ...context.personal_data.preferences,
                ...context.personal_data.communication_style,
                ...context.personal_data.behavioral_patterns,
                ...context.personal_data.learning_profile,
                ...context.personal_data.current_state,
                ...context.personal_data.predictions
              ].map((entry) => `- ${entry.key}: ${String(entry.value)} (${entry.source})`),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "agent"
          );
          return;
        }

        if (interpreted.action === "inspect") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const loaded = await refreshProfile(model.profileId);
          const mode = interpreted.inspect_mode ?? "full";
          if (mode === "observed") {
            setView("Observed Layer", [...asLines(loaded.layers.observed), "", `Model rationale: ${interpreted.rationale}`], "inspect");
          } else if (mode === "inferred") {
            setView("Inferred Layer", [...asLines(loaded.layers.inferred), "", `Model rationale: ${interpreted.rationale}`], "inspect");
          } else if (mode === "privacy") {
            setView("Privacy", [...asLines({ consent: loaded.consent, privacy: loaded.privacy }), "", `Model rationale: ${interpreted.rationale}`], "inspect");
          } else {
            setView("Full Profile", [...asLines(loaded), "", `Model rationale: ${interpreted.rationale}`], "inspect");
          }
          return;
        }

        if (interpreted.action === "state") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const loaded = await refreshProfile(model.profileId);
          const snapshot = getActiveStateSnapshot(loaded);
          setView(
            "State Snapshot",
            [
              ...(snapshot.active_states.length
                ? snapshot.active_states.map((state) => `- ${state.state_id}: ${state.likelihood.toFixed(2)}`)
                : ["No active states derived yet."]),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "state"
          );
          return;
        }

        if (interpreted.action === "graph") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const loaded = await refreshProfile(model.profileId);
          setView(
            "Knowledge Graph",
            [
              `Nodes ${loaded.knowledge_graph.nodes.length}`,
              `Edges ${loaded.knowledge_graph.edges.length}`,
              ...loaded.knowledge_graph.nodes.slice(0, 6).map((node) => `- ${node.id} [${node.type}] ${node.label}`),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "graph"
          );
          return;
        }

        if (interpreted.action === "provider_status") {
          const provider = getProviderStatusFromEnv({ rootDir: storeRoot });
          showIntentOutcome(
            "Provider Status",
            `Provider ${provider.provider ?? "none"} | Configured ${provider.configured} | Reason ${provider.reason ?? "ready"}`,
            interpreted.rationale
          );
          return;
        }

        if (interpreted.action === "provider_policy") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const operation = interpreted.operation ?? "simulation";
          const loaded = await refreshProfile(model.profileId);
          const policy = getProviderPolicyStatus(loaded, operation, { rootDir: storeRoot });
          showIntentOutcome(
            "Provider Policy",
            `Allowed ${policy.allowed} | Operation ${policy.operation} | Reason ${policy.reason ?? "allowed"}`,
            interpreted.rationale
          );
          return;
        }

        if (interpreted.action === "neo4j_status") {
          const status = await getNeo4jStatus({ rootDir: storeRoot });
          showIntentOutcome(
            "Neo4j Status",
            `Configured ${status.configured} | Connected ${status.connected} | Reason ${status.reason ?? "ready"}`,
            interpreted.rationale
          );
          return;
        }

        if (interpreted.action === "neo4j_sync") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const result = await syncStoredProfileKnowledgeGraph(model.profileId, { rootDir: storeRoot });
          showIntentOutcome(
            "Neo4j Sync",
            `Synced ${result.node_count} nodes and ${result.edge_count} edges to ${result.database ?? "default database"}.`,
            interpreted.rationale
          );
          return;
        }

        if (interpreted.action === "export") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const redaction = interpreted.redaction_level ?? "safe";
          const exported = await exportStoredProfile(model.profileId, {
            rootDir: storeRoot,
            redaction_level: redaction
          });
          setView(`Export ${redaction}`, [...asLines(exported), "", `Model rationale: ${interpreted.rationale}`], "inspect");
          return;
        }

        if (interpreted.action === "explain") {
          if (!model.profileId) {
            throw new Error("Load or create a profile first.");
          }
          const prediction = interpreted.prediction;
          if (!prediction) {
            throw new Error("The model recognized an explanation request but no prediction was extracted.");
          }
          const loaded = await refreshProfile(model.profileId);
          const support = explainPredictionSupport(loaded, prediction);
          setView(
            "Prediction Support",
            [
              ...(support.length ? support.map((entry) => `- ${entry}`) : ["No graph support found for that prediction."]),
              "",
              `Model rationale: ${interpreted.rationale}`
            ],
            "graph"
          );
          return;
        }

        if (interpreted.action === "noop") {
          setView(
            "Need Clarification",
            [
              interpreted.reply ?? "I could not map that message to a safe console action.",
              "",
              `Model rationale: ${interpreted.rationale}`,
              "",
              "Try a direct request like:",
              "- create a profile for alice",
              "- get the next question",
              "- simulate studying for an exam in 2 days",
              "- show provider status"
            ],
            "home"
          );
          return;
        }
      }
    }

    const [command, ...args] = tokenizeInput(trimmed);
    if (!command) {
      return;
    }

    if (command === "/quit" || command === "/exit") {
      exit();
      return;
    }

    if (command === "/clear") {
      setView("Home", helpLines(), "home");
      pushActivity("clear", "reset main view");
      return;
    }

    if (command === "/help") {
      setView("Help", helpLines(), "home");
      pushActivity("help", "workflow");
      return;
    }

    if (command === "/init") {
      const userId = args[0];
      if (!userId) {
        throw new Error("/init requires a user id.");
      }

      const created = await initProfile({ user_id: userId }, { rootDir: storeRoot });
      setProfile(created);
      setModel((current) => ({
        ...current,
        profileId: created.profile_id,
        sessionId: undefined,
        pendingQuestion: undefined
      }));
      setView("Profile Ready", profileSummary(created), "home");
      pushActivity("init", created.profile_id);
      return;
    }

    if (command === "/load") {
      const profileId = args[0];
      if (!profileId) {
        throw new Error("/load requires a profile id.");
      }

      const loaded = await refreshProfile(profileId);
      setModel((current) => ({ ...current, sessionId: undefined, pendingQuestion: undefined }));
      setView("Profile Loaded", profileSummary(loaded), "home");
      pushActivity("load", profileId);
      return;
    }

    if (command === "/next") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const result = await getNextQuestions(
        model.profileId,
        {
          session_id: model.sessionId,
          limit: 1
        },
        { rootDir: storeRoot }
      );

      setModel((current) => ({
        ...current,
        sessionId: result.session.session_id,
        pendingQuestion: result.questions[0]
      }));
      setView(
        "Question",
        [...questionLines(result.questions[0]), "", "Session signals", ...sessionSignalLines(result.session)],
        "home"
      );
      pushActivity("next", result.questions[0]?.id ?? "no question");
      return;
    }

    if (command === "/answer") {
      if (!model.pendingQuestion) {
        throw new Error("No question is staged.");
      }

      const value = trimmed.slice(command.length).trim();
      if (!value) {
        throw new Error("/answer requires a value.");
      }

      await submitAnswer(model.pendingQuestion.id, value);
      return;
    }

    if (command === "/simulate") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const result = await simulateStoredProfile(
        {
          profile_id: model.profileId,
          context: parseSimulationContext(trimmed.slice(command.length).trim()),
          options: {
            include_reasoning: true,
            include_evidence: true,
            explanation_level: "standard"
          }
        },
        { rootDir: storeRoot }
      );

      setView(
        "Simulation Brief",
        [
          `Prediction ${result.prediction}`,
          `Confidence ${result.confidence.toFixed(2)}`,
          `Cached ${result.cached ? "yes" : "no"}`,
          ...(result.provider
            ? [
                `Provider ${result.provider.provider}`,
                `Mode ${result.provider.mode}`,
                `Model ${result.provider.model}`,
                ...(result.provider.reason ? [`Provider note ${result.provider.reason}`] : [])
              ]
            : []),
          "",
          "Reasoning",
          ...result.reasoning.map((entry) => `- ${entry}`),
          ...(result.caveats.length ? ["", "Caveats", ...result.caveats.map((entry) => `- ${entry}`)] : []),
          ...(result.alternatives?.length
            ? ["", "Alternatives", ...result.alternatives.map((entry) => `- ${entry}`)]
            : [])
        ],
        "simulation"
      );
      pushActivity("simulate", `${result.prediction} @ ${result.confidence.toFixed(2)}`);
      return;
    }

    if (command === "/agent-context") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const intent = trimmed.slice(command.length).trim() || model.lastIntent || "general_assistance";
      const context = await buildStoredAgentContext(
        model.profileId,
        {
          intent,
          include_predictions: true,
          max_items: 12
        },
        { rootDir: storeRoot }
      );

      setModel((current) => ({ ...current, lastIntent: intent }));
      setView(
        "Agent Context",
        [
          `Intent ${context.intent}`,
          `Generated ${context.generated_at}`,
          `Restricted ${context.constraints.restricted_fields.join(", ") || "none"}`,
          "",
          "Personalization",
          ...[
            ...context.personal_data.preferences,
            ...context.personal_data.communication_style,
            ...context.personal_data.behavioral_patterns,
            ...context.personal_data.learning_profile,
            ...context.personal_data.current_state,
            ...context.personal_data.predictions
          ].map((entry) => `- ${entry.key}: ${String(entry.value)} (${entry.source} conf=${entry.confidence.toFixed(2)})`)
        ],
        "agent"
      );
      pushActivity("agent-context", intent);
      return;
    }

    if (command === "/inspect") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const loaded = await refreshProfile(model.profileId);
      const mode = args[0] ?? "full";
      if (mode === "observed") {
        setView("Observed Layer", asLines(loaded.layers.observed), "inspect");
      } else if (mode === "inferred") {
        setView("Inferred Layer", asLines(loaded.layers.inferred), "inspect");
      } else if (mode === "privacy") {
        setView("Privacy", asLines({ consent: loaded.consent, privacy: loaded.privacy }), "inspect");
      } else {
        setView("Full Profile", asLines(loaded), "inspect");
      }
      pushActivity("inspect", mode);
      return;
    }

    if (command === "/state") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const loaded = await refreshProfile(model.profileId);
      const snapshot = getActiveStateSnapshot(loaded);
      setView(
        "State Snapshot",
        snapshot.active_states.length
          ? snapshot.active_states.map((state) => `- ${state.state_id}: ${state.likelihood.toFixed(2)}`)
          : ["No active states derived yet."],
        "state"
      );
      pushActivity("state", "snapshot");
      return;
    }

    if (command === "/graph") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const loaded = await refreshProfile(model.profileId);
      const lines = [
        `Nodes ${loaded.knowledge_graph.nodes.length}`,
        `Edges ${loaded.knowledge_graph.edges.length}`,
        "",
        "Node sample",
        ...loaded.knowledge_graph.nodes.slice(0, 8).map((node) => `- ${node.id} [${node.type}] ${node.label}`),
        "",
        "Edge sample",
        ...loaded.knowledge_graph.edges.slice(0, 8).map((edge) => `- ${edge.from} --${edge.type}--> ${edge.to}`)
      ];
      setView("Knowledge Graph", lines, "graph");
      pushActivity("graph", "local graph");
      return;
    }

    if (command === "/provider") {
      const provider = getProviderStatusFromEnv({ rootDir: storeRoot });
      const stored = getStoredProviderConfig({ rootDir: storeRoot });
      setView(
        "Provider Status",
        [
          `Enabled ${provider.enabled}`,
          `Provider ${provider.provider ?? "none"}`,
          `Model ${provider.model ?? "none"}`,
          `Configured ${provider.configured}`,
          `Source ${provider.source ?? "none"}`,
          `Reason ${provider.reason ?? "ready"}`,
          "",
          "Stored config",
          `Path ${stored.path}`,
          `Stored provider ${stored.provider ?? "none"}`,
          `Stored model ${stored.model ?? "none"}`,
          `Has API key ${stored.has_api_key}`
        ],
        "provider"
      );
      pushActivity("provider", provider.provider ?? "rules-only");
      return;
    }

    if (command === "/provider-policy") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const operation = args[0];
      if (operation !== "modeling" && operation !== "simulation") {
        throw new Error("/provider-policy requires modeling or simulation.");
      }

      const loaded = await refreshProfile(model.profileId);
      const policy = getProviderPolicyStatus(loaded, operation, { rootDir: storeRoot });
      setView(
        "Provider Policy",
        [
          `Allowed ${policy.allowed}`,
          `Operation ${policy.operation}`,
          `Reason ${policy.reason ?? "allowed"}`,
          `Required scopes ${policy.required_scopes.join(", ") || "none"}`,
          `Missing scopes ${policy.missing_scopes.join(", ") || "none"}`,
          `Redacted ${policy.redacted_fields.join(", ") || "none"}`
        ],
        "provider"
      );
      pushActivity("provider-policy", operation);
      return;
    }

    if (command === "/neo4j") {
      const status = await getNeo4jStatus({ rootDir: storeRoot });
      setView(
        "Neo4j Status",
        [
          `Configured ${status.configured}`,
          `Enabled ${status.enabled}`,
          `Connected ${status.connected}`,
          `Source ${status.source}`,
          `URI ${status.uri ?? "none"}`,
          `Database ${status.database ?? "none"}`,
          `User ${status.username ?? "none"}`,
          ...(status.server_agent ? [`Server ${status.server_agent}`] : []),
          ...(status.reason ? [`Reason ${status.reason}`] : [])
        ],
        "neo4j"
      );
      pushActivity("neo4j", status.connected ? "connected" : status.reason ?? "not connected");
      return;
    }

    if (command === "/neo4j-sync") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const result = await syncStoredProfileKnowledgeGraph(model.profileId, { rootDir: storeRoot });
      setView(
        "Neo4j Sync",
        [
          `Profile ${result.profile_id}`,
          `User ${result.user_id}`,
          `Nodes ${result.node_count}`,
          `Edges ${result.edge_count}`,
          `URI ${result.uri ?? "none"}`,
          `Database ${result.database ?? "none"}`,
          `Synced ${result.synced_at}`
        ],
        "neo4j"
      );
      pushActivity("neo4j-sync", `${result.node_count} nodes / ${result.edge_count} edges`);
      return;
    }

    if (command === "/export") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const redaction = args[0] === "full" ? "full" : "safe";
      const exported = await exportStoredProfile(model.profileId, {
        rootDir: storeRoot,
        redaction_level: redaction
      });
      setView(`Export ${redaction}`, asLines(exported), "inspect");
      pushActivity("export", redaction);
      return;
    }

    if (command === "/explain") {
      if (!model.profileId) {
        throw new Error("Load or create a profile first.");
      }

      const prediction = args[0];
      if (!prediction) {
        throw new Error("/explain requires a prediction.");
      }

      const loaded = await refreshProfile(model.profileId);
      const support = explainPredictionSupport(loaded, prediction);
      setView(
        "Prediction Support",
        support.length ? support.map((entry) => `- ${entry}`) : ["No graph support found for that prediction."],
        "graph"
      );
      pushActivity("explain", prediction);
      return;
    }

    throw new Error(`Unknown command ${command}`);
  }

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || busy) {
      return;
    }

    setHistory((current) => [...current, trimmed]);
    setHistoryIndex(null);
    setInputValue("");
    setBusy(`running ${trimmed.startsWith("/") ? trimmed.split(/\s+/)[0] : "answer"}`);

    try {
      await handleCommand(trimmed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown console error.";
      setView("Error", [message], "error");
      pushActivity("error", message);
    } finally {
      setBusy(null);
    }
  }

  const hint = model.pendingQuestion
    ? `Answer the staged question ${model.pendingQuestion.id} naturally, or use /answer <value>.`
    : "Use /init, /load, /next, /simulate, /agent-context, /neo4j, or /help.";

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column">
          <Text color="cyanBright" bold>
            {chalk.bold("PSON5 Cognition Console")}
          </Text>
          <Text dimColor wrap="wrap">
            Ink-driven terminal UI for personalization context, simulation, and graph operations.
          </Text>
        </Box>
        <Box>
          <Text color="gray" wrap="wrap">
            {model.profileId ? `profile ${compactLabel(model.profileId, 30)}` : "no profile loaded"}
          </Text>
        </Box>
      </Box>

      <Box flexDirection={isNarrow ? "column" : "row"}>
        <BrainPanel frameIndex={frameIndex} status={statusLines} width={brainWidth} />
        <Box marginLeft={isNarrow ? 0 : 1} marginTop={isNarrow ? 1 : 0} flexDirection="column">
          <Panel title={model.title} lines={model.lines} width={workspaceWidth} borderColor="cyan" />
          <Box marginTop={1} flexDirection={isCompact ? "column" : "row"}>
            <Panel title="Staged Question" lines={questionLines(model.pendingQuestion)} width={lowerPanelWidth} borderColor="magenta" />
            <Box marginLeft={isCompact ? 0 : 1} marginTop={isCompact ? 1 : 0}>
              <Panel
                title="Recent Activity"
                lines={
                  model.activity.length
                    ? model.activity.map((item) => `[${item.at}] ${item.title} - ${item.detail}`)
                    : ["No activity yet."]
                }
                width={lowerPanelWidth}
                borderColor="yellow"
              />
            </Box>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection={isCompact ? "column" : "row"}>
        <CommandSuggestions inputValue={inputValue} suggestions={suggestions} width={commandWidth} />
        <Box marginLeft={isCompact ? 0 : 1} marginTop={isCompact ? 1 : 0} flexGrow={1}>
          <InputBar
            busy={busy}
            inputValue={inputValue}
            setInputValue={setInputValue}
            onSubmit={submit}
            hint={hint}
            width={inputWidth}
          />
        </Box>
      </Box>
    </Box>
  );
}

export async function startInkConsole(storeRoot: string, profileId?: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive console requires a TTY terminal.");
  }

  const instance = render(<PsonInkConsole storeRoot={storeRoot} initialProfileId={profileId} />, {
    exitOnCtrlC: false
  });

  await instance.waitUntilExit();
}
