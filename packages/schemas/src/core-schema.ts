export const corePsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://pson.dev/schemas/pson-core-5.0.json",
  title: "PSON5 Core Profile",
  type: "object",
  additionalProperties: false,
  required: [
    "pson_version",
    "profile_id",
    "user_id",
    "consent",
    "domains",
    "layers",
    "cognitive_model",
    "behavioral_model",
    "state_model",
    "knowledge_graph",
    "simulation_profiles",
    "privacy",
    "metadata"
  ],
  properties: {
    pson_version: { type: "string", const: "5.0" },
    profile_id: { type: "string", minLength: 1 },
    user_id: { type: "string", minLength: 1 },
    tenant_id: { type: "string", minLength: 1 },
    consent: {
      type: "object",
      additionalProperties: false,
      required: ["granted", "scopes", "policy_version", "updated_at"],
      properties: {
        granted: { type: "boolean" },
        scopes: {
          type: "array",
          items: { type: "string" }
        },
        policy_version: { type: "string", minLength: 1 },
        updated_at: { type: "string", format: "date-time" }
      }
    },
    domains: {
      type: "object",
      additionalProperties: false,
      required: ["active", "depth"],
      properties: {
        active: {
          type: "array",
          minItems: 1,
          items: { type: "string" }
        },
        depth: {
          type: "string",
          enum: ["light", "standard", "deep"]
        }
      }
    },
    layers: {
      type: "object",
      additionalProperties: false,
      required: ["observed", "inferred", "simulated"],
      properties: {
        observed: { type: "object" },
        inferred: { type: "object" },
        simulated: { type: "object" }
      }
    },
    cognitive_model: {
      type: "object",
      additionalProperties: false,
      required: ["thinking_style", "learning_style", "processing_patterns"],
      properties: {
        thinking_style: { type: "object" },
        learning_style: { type: "object" },
        processing_patterns: { type: "object" }
      }
    },
    behavioral_model: {
      type: "object",
      additionalProperties: false,
      required: ["decision_functions", "action_patterns", "motivation_model"],
      properties: {
        decision_functions: { type: "array" },
        action_patterns: { type: "array" },
        motivation_model: { type: "object" }
      }
    },
    state_model: {
      type: "object",
      additionalProperties: false,
      required: ["states", "transitions"],
      properties: {
        states: { type: "array" },
        transitions: { type: "array" }
      }
    },
    knowledge_graph: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "edges"],
      properties: {
        nodes: { type: "array" },
        edges: { type: "array" }
      }
    },
    simulation_profiles: {
      type: "object",
      additionalProperties: false,
      required: ["scenarios", "domains"],
      properties: {
        scenarios: { type: "array" },
        domains: { type: "object" }
      }
    },
    privacy: {
      type: "object",
      additionalProperties: false,
      required: ["encryption", "access_levels", "local_only", "restricted_fields"],
      properties: {
        encryption: { type: "boolean" },
        access_levels: { type: "object" },
        local_only: { type: "boolean" },
        restricted_fields: {
          type: "array",
          items: { type: "string" }
        }
      }
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["confidence", "created_at", "updated_at", "source_count", "revision"],
      properties: {
        confidence: { type: "number", minimum: 0, maximum: 1 },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
        source_count: { type: "integer", minimum: 0 },
        revision: { type: "integer", minimum: 1 }
      }
    }
  }
} as const;
