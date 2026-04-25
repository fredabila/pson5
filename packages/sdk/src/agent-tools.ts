import type { AgentContextOptions, InitProfileInput, LearnRequest, ProfileStoreOptions } from "@pson5/core-types";
import type { ObserveFactInput } from "@pson5/serialization-engine";
import type { SimulationRequest } from "@pson5/simulation-engine";
import type { PsonClient } from "./index.js";

export type PsonAgentToolName =
  | "pson_load_profile_by_user_id"
  | "pson_create_profile"
  | "pson_get_agent_context"
  | "pson_get_next_questions"
  | "pson_learn"
  | "pson_observe_fact"
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
      description:
        "Load this user's existing PSON personalization profile. Call this at the start of a conversation before personalizing anything — the profile holds what the user has previously volunteered about themselves and what's been inferred. Returns null if no profile exists; in that case call pson_create_profile.",
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
      description:
        "Create a fresh PSON profile for a user who doesn't have one yet. Call this only after pson_load_profile_by_user_id returned nothing for the user_id. The profile starts empty and grows via pson_observe_fact (free-form facts) and pson_learn (structured answers).",
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
      description:
        "Project the relevant slice of the user's PSON profile for the current task. Pass `intent` describing what the user is asking for; returns the user's preferences, communication style, behavioural patterns, current state, and predictions filtered to what's relevant. Use this to personalize your tone and content. Safer than reading the raw profile because it respects privacy scopes and confidence floors.",
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
      description:
        "Get the next question to ask the user that would most reduce uncertainty in their profile. Use this only when the user has opted into structured profile-building (e.g. 'help me set up my profile' or 'ask me a few questions'). After the user answers, pass their answer to pson_learn with the question_id returned here. Don't call this opportunistically during casual conversation.",
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
      description:
        "Record the user's answer to a question that came from pson_get_next_questions. Each answer must reference a question_id from that call. Use this for structured registry answers; for free-form facts the user volunteers in conversation (name, location, preferences), use pson_observe_fact instead.",
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
      name: "pson_observe_fact",
      description:
        "Record a free-form observed fact the user volunteered in open conversation — use this when the user states something about themselves that does NOT correspond to any registered question from pson_get_next_questions. Unlike pson_learn, this does not require a registry question id. Still writes only to the observed layer; never use this to record the model's own inferences.",
      input_schema: objectSchema(
        {
          profile_id: { type: "string" },
          domain: {
            type: "string",
            description:
              "Domain slug the fact belongs to. Use 'core' for general identity/lifestyle facts, 'personal' for relationships or location, or a descriptive custom slug for niche topics."
          },
          key: {
            type: "string",
            description:
              "Short snake_case slug naming the fact, e.g. 'preferred_name', 'current_city', 'pet_species'."
          },
          value: {
            anyOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
              { type: "null" }
            ],
            description: "The fact itself. Keep the value close to how the user stated it."
          },
          note: {
            type: "string",
            description: "Optional rationale — why this was worth saving, or how you derived it."
          },
          confidence: {
            type: "number",
            description:
              "0 to 1. Omit (defaults to 1.0) when the user stated the fact directly; lower when you're paraphrasing or extracting from context."
          }
        },
        ["profile_id", "domain", "key", "value"]
      )
    },
    {
      type: "function",
      name: "pson_simulate",
      description:
        "Predict how the user would respond to a hypothetical scenario, based on their profile. Pass a context describing the situation and get back probable behaviours and reasoning. Use for 'what would I prefer' or 'how would I react' style questions — never as a substitute for asking the user directly. Requires AI consent scopes; check with pson_get_provider_policy first.",
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
      description:
        "Before calling pson_simulate or any AI-backed inference, check whether the user has consented. Returns whether the operation is allowed under the profile's privacy scopes, plus a reason if denied. Honour a deny — never fall back to running the operation without consent.",
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

        case "pson_observe_fact": {
          if (typeof args.profile_id !== "string") {
            throw new Error("pson_observe_fact requires profile_id.");
          }
          if (typeof args.domain !== "string" || args.domain.trim().length === 0) {
            throw new Error("pson_observe_fact requires a non-empty domain.");
          }
          if (typeof args.key !== "string" || args.key.trim().length === 0) {
            throw new Error("pson_observe_fact requires a non-empty key.");
          }

          const value = args.value as ObserveFactInput["value"];

          const input: ObserveFactInput = {
            profile_id: args.profile_id,
            domain: args.domain,
            key: args.key,
            value,
            note: typeof args.note === "string" ? args.note : undefined,
            confidence: typeof args.confidence === "number" ? args.confidence : undefined
          };

          return client.observeFact(input, storeOptions);
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
