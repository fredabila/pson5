/**
 * PSON5 agent — one full turn using the seven tools.
 *
 * This is what a single agent response looks like end-to-end:
 *
 *   1. resolve the profile for the current user
 *   2. build the agent-safe projection for the user's intent
 *   3. if uncertainty matters, fetch the next question and ask it
 *   4. write the answer back
 *   5. optionally simulate a behavior scenario
 *   6. compose the user-facing response using the projection
 *
 * The SDK's tool executor gives us the same interface PSON5 exposes over
 * HTTP and MCP — so porting this pattern to a remote runtime is a
 * drop-in change of the `executor.execute` call.
 */

import {
  PsonClient,
  createPsonAgentToolExecutor,
  type PsonAgentToolCall
} from "@pson5/sdk";

const client = new PsonClient();
const executor = createPsonAgentToolExecutor(client, { rootDir: ".pson5-store" });

/** Thin wrapper so every tool call reads identically. */
async function callTool<T>(call: PsonAgentToolCall): Promise<T> {
  return executor.execute(call) as Promise<T>;
}

async function oneAgentTurn(appUserId: string, userIntent: string, taskContext: Record<string, unknown>) {
  // 1. Resolve the profile (safe-redacted for non-admin callers)
  const profile = await callTool<{ profile_id: string; consent: { granted: boolean } }>({
    name: "pson_load_profile_by_user_id",
    arguments: { user_id: appUserId }
  });

  if (!profile.consent.granted) {
    return {
      message:
        "I don't have permission to personalise my response for you right now. I'll answer generally instead.",
      personalisation: "disabled"
    };
  }

  // 2. Build the agent-safe projection for this intent
  const context = await callTool<{
    personal_data: Record<string, Array<{ key: string; value: unknown; source: string; confidence: number }>>;
    redaction_notes?: Array<{ path: string; reason: string }>;
  }>({
    name: "pson_get_agent_context",
    arguments: {
      profile_id: profile.profile_id,
      intent: userIntent,
      include_predictions: true,
      max_items: 6,
      min_confidence: 0.55,
      task_context: taskContext
    }
  });

  // 3. If there's high-value uncertainty, ask the user something
  //    (in a real agent, decide based on your task — here we assume we have enough)
  const needMoreSignal = Object.values(context.personal_data).every((bucket) => bucket.length === 0);
  if (needMoreSignal) {
    const session = await callTool<{ session_id: string; questions: Array<{ id: string; prompt: string }> }>({
      name: "pson_get_next_questions",
      arguments: { profile_id: profile.profile_id, limit: 1 }
    });
    const question = session.questions[0];
    if (question) {
      // ⬇︎ ask the user the question, capture their answer ⬇︎
      const userAnswer = "placeholder"; // replace with real IO

      await callTool({
        name: "pson_learn",
        arguments: {
          profile_id: profile.profile_id,
          session_id: session.session_id,
          answers: [{ question_id: question.id, value: userAnswer }]
        }
      });

      // recompute the context
      return oneAgentTurn(appUserId, userIntent, taskContext);
    }
  }

  // 4. Optional — simulate a behavior scenario relevant to the intent
  const simulation = await callTool<{
    prediction: string;
    confidence: number;
    reasoning: string[];
    caveats: string[];
    alternatives?: string[];
  }>({
    name: "pson_simulate",
    arguments: {
      profile_id: profile.profile_id,
      context: taskContext,
      options: { include_reasoning: true, include_evidence: true }
    }
  });

  // 5. Compose the user-facing response
  //    Follow the rules in reference/safe-prompting.md:
  //      - use observed values as facts
  //      - use inferred values as tendencies (with confidence)
  //      - treat simulations as hypotheses, not statements
  //      - never leak restricted fields or internal identifiers

  const observedPrefs = context.personal_data.preferences
    ?.filter((entry) => entry.source === "observed")
    .slice(0, 3);
  const inferredPatterns = context.personal_data.behavioral_patterns
    ?.filter((entry) => entry.source === "inferred")
    .slice(0, 3);

  const factsBlock = observedPrefs
    ?.map((e) => `- you told me your ${e.key} is ${JSON.stringify(e.value)}`)
    .join("\n");
  const patternsBlock = inferredPatterns
    ?.map((e) => `- i get the sense that ${e.key} = ${JSON.stringify(e.value)} (confidence ${e.confidence.toFixed(2)})`)
    .join("\n");

  return {
    message: [
      `task: ${userIntent}`,
      "",
      "what you've told me:",
      factsBlock || "(nothing yet)",
      "",
      "what i've picked up on:",
      patternsBlock || "(no patterns yet)",
      "",
      `predicted behavior in this scenario: ${simulation.prediction} (confidence ${simulation.confidence.toFixed(2)}) — this is a hypothesis, not a fact.`,
      simulation.reasoning.length
        ? "reasoning: " + simulation.reasoning.slice(0, 2).join("; ")
        : "",
      simulation.caveats.length
        ? "caveats: " + simulation.caveats.slice(0, 2).join("; ")
        : ""
    ].join("\n"),
    redactions: context.redaction_notes ?? [],
    personalisation: "active"
  };
}

// Example invocation
const result = await oneAgentTurn(
  "user_123",
  "help me plan a focused two-hour study session for an upcoming exam",
  { task: "exam prep", deadline_days: 3, difficulty: "high" }
);
console.log(result.message);
