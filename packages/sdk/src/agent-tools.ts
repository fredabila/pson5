import type { AgentContextOptions, InitProfileInput, LearnRequest, ProfileStoreOptions } from "@pson5/core-types";
import type { SimulationRequest } from "@pson5/simulation-engine";
import type { PsonClient } from "./index.js";

export type PsonAgentToolName =
  | "pson_load_profile_by_user_id"
  | "pson_create_profile"
  | "pson_get_agent_context"
  | "pson_get_next_questions"
  | "pson_learn"
  | "pson_simulate"
  | "pson_get_provider_policy";

export interface PsonAgentToolDefinition {
  type: "function";
  name: PsonAgentToolName;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface PsonAgentToolCall {
  name: PsonAgentToolName;
  arguments: Record<string, unknown>;
}

export interface PsonAgentToolExecutor {
  definitions: PsonAgentToolDefinition[];
  execute(call: PsonAgentToolCall): Promise<unknown>;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required
  };
}

export function getPsonAgentToolDefinitions(): PsonAgentToolDefinition[] {
  return [
    {
      type: "function",
      name: "pson_load_profile_by_user_id",
      description: "Load the latest PSON profile for a known application user id.",
      input_schema: objectSchema(
        {
          user_id: { type: "string" }
        },
        ["user_id"]
      )
    },
    {
      type: "function",
      name: "pson_create_profile",
      description: "Create a new PSON profile for an application user.",
      input_schema: objectSchema(
        {
          user_id: { type: "string" },
          tenant_id: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          depth: { type: "string", enum: ["light", "standard", "deep"] }
        },
        ["user_id"]
      )
    },
    {
      type: "function",
      name: "pson_get_agent_context",
      description: "Return the filtered agent-safe personalization projection for a profile.",
      input_schema: objectSchema(
        {
          profile_id: { type: "string" },
          intent: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          max_items: { type: "number" },
          include_predictions: { type: "boolean" },
          min_confidence: { type: "number" },
          task_context: { type: "object" }
        },
        ["profile_id", "intent"]
      )
    },
    {
      type: "function",
      name: "pson_get_next_questions",
      description: "Choose the next adaptive question to reduce uncertainty in a profile.",
      input_schema: objectSchema(
        {
          profile_id: { type: "string" },
          session_id: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          depth: { type: "string", enum: ["light", "standard", "deep"] },
          limit: { type: "number" }
        },
        ["profile_id"]
      )
    },
    {
      type: "function",
      name: "pson_learn",
      description: "Store user answers through the structured PSON learning flow.",
      input_schema: objectSchema(
        {
          profile_id: { type: "string" },
          session_id: { type: "string" },
          domains: { type: "array", items: { type: "string" } },
          depth: { type: "string", enum: ["light", "standard", "deep"] },
          answers: {
            type: "array",
            items: objectSchema(
              {
                question_id: { type: "string" },
                value: {
                  anyOf: [
                    { type: "string" },
                    { type: "number" },
                    { type: "boolean" },
                    { type: "array", items: { type: "string" } }
                  ]
                }
              },
              ["question_id", "value"]
            )
          },
          return_next_questions: { type: "boolean" },
          next_question_limit: { type: "number" }
        },
        ["profile_id", "answers"]
      )
    },
    {
      type: "function",
      name: "pson_simulate",
      description: "Simulate likely user behavior for a task or scenario using a profile.",
      input_schema: objectSchema(
        {
          profile_id: { type: "string" },
          context: { type: "object" },
          domains: { type: "array", items: { type: "string" } }
        },
        ["profile_id", "context"]
      )
    },
    {
      type: "function",
      name: "pson_get_provider_policy",
      description: "Check whether provider-backed modeling or simulation is allowed for a profile.",
      input_schema: objectSchema(
        {
          profile_id: { type: "string" },
          operation: { type: "string", enum: ["modeling", "simulation"] }
        },
        ["profile_id", "operation"]
      )
    }
  ];
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function asDepth(value: unknown): "light" | "standard" | "deep" | undefined {
  return value === "light" || value === "standard" || value === "deep" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function createPsonAgentToolExecutor(
  client: PsonClient,
  storeOptions?: ProfileStoreOptions
): PsonAgentToolExecutor {
  return {
    definitions: getPsonAgentToolDefinitions(),

    async execute(call: PsonAgentToolCall): Promise<unknown> {
      const args = call.arguments ?? {};

      switch (call.name) {
        case "pson_load_profile_by_user_id": {
          if (typeof args.user_id !== "string") {
            throw new Error("pson_load_profile_by_user_id requires user_id.");
          }
          return client.loadProfileByUserId(args.user_id, storeOptions);
        }

        case "pson_create_profile": {
          if (typeof args.user_id !== "string") {
            throw new Error("pson_create_profile requires user_id.");
          }

          const input: InitProfileInput = {
            user_id: args.user_id,
            tenant_id: typeof args.tenant_id === "string" ? args.tenant_id : undefined,
            domains: asStringArray(args.domains),
            depth: asDepth(args.depth)
          };
          return client.createAndSaveProfile(input, storeOptions);
        }

        case "pson_get_agent_context": {
          if (typeof args.profile_id !== "string" || typeof args.intent !== "string") {
            throw new Error("pson_get_agent_context requires profile_id and intent.");
          }

          const options: AgentContextOptions = {
            intent: args.intent,
            domains: asStringArray(args.domains),
            max_items: typeof args.max_items === "number" ? args.max_items : undefined,
            include_predictions: typeof args.include_predictions === "boolean" ? args.include_predictions : undefined,
            min_confidence: typeof args.min_confidence === "number" ? args.min_confidence : undefined,
            task_context: asRecord(args.task_context)
          };

          return client.getAgentContext(args.profile_id, options, storeOptions);
        }

        case "pson_get_next_questions": {
          if (typeof args.profile_id !== "string") {
            throw new Error("pson_get_next_questions requires profile_id.");
          }

          return client.getNextQuestions(
            args.profile_id,
            {
              session_id: typeof args.session_id === "string" ? args.session_id : undefined,
              domains: asStringArray(args.domains),
              depth: asDepth(args.depth),
              limit: typeof args.limit === "number" ? args.limit : undefined
            },
            storeOptions
          );
        }

        case "pson_learn": {
          if (typeof args.profile_id !== "string" || !Array.isArray(args.answers)) {
            throw new Error("pson_learn requires profile_id and answers.");
          }

          const input: LearnRequest = {
            profile_id: args.profile_id,
            session_id: typeof args.session_id === "string" ? args.session_id : undefined,
            domains: asStringArray(args.domains),
            depth: asDepth(args.depth),
            answers: args.answers
              .map((entry) => asRecord(entry))
              .filter((entry): entry is Record<string, unknown> => Boolean(entry))
              .map((entry) => ({
                question_id: typeof entry.question_id === "string" ? entry.question_id : "",
                value: entry.value as string | number | boolean | string[]
              }))
              .filter((entry) => entry.question_id.length > 0),
            options: {
              return_next_questions:
                typeof args.return_next_questions === "boolean" ? args.return_next_questions : true,
              next_question_limit: typeof args.next_question_limit === "number" ? args.next_question_limit : 1
            }
          };

          return client.learn(input, storeOptions);
        }

        case "pson_simulate": {
          if (typeof args.profile_id !== "string" || !asRecord(args.context)) {
            throw new Error("pson_simulate requires profile_id and context.");
          }

          const request: SimulationRequest = {
            profile_id: args.profile_id,
            context: asRecord(args.context) ?? {},
            domains: asStringArray(args.domains),
            options: {
              include_reasoning: true,
              include_evidence: true,
              explanation_level: "standard"
            }
          };

          return client.simulate(request, storeOptions);
        }

        case "pson_get_provider_policy": {
          if (
            typeof args.profile_id !== "string" ||
            (args.operation !== "modeling" && args.operation !== "simulation")
          ) {
            throw new Error("pson_get_provider_policy requires profile_id and operation.");
          }

          return client.getProviderPolicy(args.profile_id, args.operation, storeOptions);
        }

        default:
          throw new Error(`Unsupported PSON tool '${String(call.name)}'.`);
      }
    }
  };
}
