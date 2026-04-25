import { PsonClient, type ObserveFactInput } from "@pson5/sdk";
import type { ProfileStoreOptions } from "@pson5/core-types";
import type { SimulationRequest } from "@pson5/simulation-engine";

/**
 * Custom tool definitions exposed to the managed agent. The agent sees
 * *these* schemas — no profile_id field, no PSON-internal concepts leak
 * through. The orchestrator auto-fills profile_id from the session's
 * pinned persona.
 */
export const CUSTOM_TOOL_DEFINITIONS = [
  {
    type: "custom" as const,
    name: "pson_observe_fact",
    description:
      "Save a free-form observed fact about yourself. Use this whenever the user draws out a durable opinion, a working preference, or a piece of your background that wasn't already saved. Writes directly to the observed layer; does NOT require a registered question id.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: {
          type: "string",
          description:
            "Short category — e.g. 'core', 'career', 'expertise', 'cognitive', 'work_ethic', 'blind_spots', 'opinions'."
        },
        key: {
          type: "string",
          description:
            "Snake_case slug naming the fact — e.g. 'problem_solving_style', 'preferred_eval_cadence', 'reward_hacking_nervousness'."
        },
        value: {
          description:
            "The fact itself. A string, number, boolean, or array of strings.",
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "array", items: { type: "string" } }
          ]
        },
        note: {
          type: "string",
          description:
            "Optional one-sentence rationale — why this is worth saving, or how you derived it."
        },
        confidence: {
          type: "number",
          description:
            "0 to 1. Omit (defaults to 1.0) when you're stating the fact as true; lower it if you're recording an uncertain inference about yourself."
        }
      },
      required: ["domain", "key", "value"]
    }
  },
  {
    type: "custom" as const,
    name: "pson_get_agent_context",
    description:
      "Retrieve a relevance-ranked projection of the persona's current profile. Use this BEFORE any substantive answer — cite specific traits from the returned personal_data when they shape your reasoning. The intent string should describe what you're about to use the context for; the projection is filtered by relevance to it.",
    input_schema: {
      type: "object" as const,
      properties: {
        intent: {
          type: "string",
          description:
            "One-sentence description of what you're about to do. Example: 'self-orientation — what do I already know about myself?', or 'reasoning about how to calibrate an RLHF reward model for reasoning tasks'."
        },
        domains: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional — restrict the projection to these domains (e.g. ['cognitive', 'work_ethic'])."
        },
        max_items: {
          type: "number",
          description: "Max entries per category. Defaults to 8."
        },
        include_predictions: {
          type: "boolean",
          description:
            "Whether to include previously-cached simulation results. Defaults to true."
        },
        min_confidence: {
          type: "number",
          description:
            "Floor on inferred-trait confidence. Defaults to 0.5; lower if you want to see weaker signals."
        }
      },
      required: ["intent"]
    }
  },
  {
    type: "custom" as const,
    name: "pson_simulate",
    description:
      "Run the PSON simulation engine on a concrete scenario. Returns {prediction, confidence, reasoning[], caveats[], evidence[]}. Use this for hypothetical or decision-framed questions the user asks — 'how would you have designed X?', 'what would you weigh more heavily, A or B?'. Present the four returned fields explicitly in your answer; do not paraphrase them away.",
    input_schema: {
      type: "object" as const,
      properties: {
        context: {
          type: "object",
          description:
            "Scenario description. Convention: include `scenario` (short slug), `question` (the actual decision being posed), and any relevant constraints as sibling fields. Example: {scenario: 'reward_model_calibration_for_reasoning', question: 'Would you use scalar rewards or preference ranking?', constraints: {data_scale: '100k pairs', time_budget: 'two weeks'}}."
        },
        domains: {
          type: "array",
          items: { type: "string" },
          description: "Optional — restrict the simulation to specific domains."
        }
      },
      required: ["context"]
    }
  },
  {
    type: "custom" as const,
    name: "pson_get_next_questions",
    description:
      "Pull the next N questions from the registered question flow. Use this only if the user is explicitly walking you through a structured onboarding. Most of the time, observe_fact is the right save path.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max questions to return. Defaults to 3."
        }
      },
      required: []
    }
  },
  {
    type: "custom" as const,
    name: "pson_learn",
    description:
      "Submit an answer to a registered question. The question_id MUST be one returned by pson_get_next_questions — inventing an id returns an error. For free-form facts you volunteer on your own, use pson_observe_fact instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        question_id: {
          type: "string",
          description: "Exact question id from a prior pson_get_next_questions call."
        },
        value: {
          description: "The answer, mapped to the question's expected shape.",
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "array", items: { type: "string" } }
          ]
        }
      },
      required: ["question_id", "value"]
    }
  }
];

/**
 * Host-side tool handler. Each call runs against the real @pson5/sdk
 * with the persona's profile_id auto-injected. Returns JSON-serialisable
 * results that get fed back to the agent as `user.custom_tool_result`.
 */
export function createToolHandler(options: {
  client: PsonClient;
  profileId: string;
  storeOptions: ProfileStoreOptions;
}) {
  const { client, profileId, storeOptions } = options;

  return async function handleToolCall(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    switch (toolName) {
      case "pson_observe_fact": {
        const fact: ObserveFactInput = {
          profile_id: profileId,
          domain: String(input.domain),
          key: String(input.key),
          value: input.value as ObserveFactInput["value"],
          note: typeof input.note === "string" ? input.note : undefined,
          confidence:
            typeof input.confidence === "number" ? input.confidence : undefined
        };
        const saved = await client.observeFact(fact, storeOptions);
        return {
          ok: true,
          revision: saved.metadata.revision,
          observed_facts_total: countObservedFacts(saved),
          saved: { domain: fact.domain, key: fact.key }
        };
      }

      case "pson_get_agent_context": {
        if (typeof input.intent !== "string") {
          throw new Error("pson_get_agent_context requires an intent string.");
        }
        const context = await client.getAgentContext(
          profileId,
          {
            intent: input.intent,
            domains: Array.isArray(input.domains)
              ? (input.domains as string[])
              : undefined,
            max_items:
              typeof input.max_items === "number" ? input.max_items : 8,
            include_predictions:
              typeof input.include_predictions === "boolean"
                ? input.include_predictions
                : true,
            min_confidence:
              typeof input.min_confidence === "number"
                ? input.min_confidence
                : 0.5
          },
          storeOptions
        );
        return context;
      }

      case "pson_simulate": {
        if (!input.context || typeof input.context !== "object") {
          throw new Error(
            "pson_simulate requires a `context` object describing the scenario."
          );
        }
        const simRequest: SimulationRequest = {
          profile_id: profileId,
          context: input.context as Record<string, unknown>,
          domains: Array.isArray(input.domains)
            ? (input.domains as string[])
            : undefined
        };
        const result = await client.simulate(simRequest, storeOptions);
        return result;
      }

      case "pson_get_next_questions": {
        const limit =
          typeof input.limit === "number" ? Math.max(1, input.limit) : 3;
        const result = await client.getNextQuestions(
          profileId,
          { limit },
          storeOptions
        );
        return result;
      }

      case "pson_learn": {
        if (typeof input.question_id !== "string") {
          throw new Error("pson_learn requires a question_id.");
        }
        const answer = input.value as string | number | boolean | string[];
        const result = await client.learn(
          {
            profile_id: profileId,
            answers: [{ question_id: input.question_id, value: answer }]
          },
          storeOptions
        );
        return result;
      }

      default:
        throw new Error(`Unknown custom tool: ${toolName}`);
    }
  };
}

function countObservedFacts(profile: {
  layers: { observed: Record<string, unknown> };
}): number {
  let count = 0;
  for (const domain of Object.values(profile.layers.observed)) {
    if (domain && typeof domain === "object") {
      const facts = (domain as { facts?: unknown }).facts;
      if (facts && typeof facts === "object") {
        count += Object.keys(facts as Record<string, unknown>).length;
      }
    }
  }
  return count;
}
