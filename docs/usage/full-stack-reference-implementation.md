# Full-Stack PSON5 Reference Implementation

This guide shows a complete backend-owned integration. It assumes your app owns login/session auth and uses PSON5 as the personalization layer.

Use this architecture when you are building a web or mobile app and want reliable per-user identity.

## File Tree

```text
src/
  env.ts
  pson.ts
  auth.ts
  llm.ts
  server.ts
  routes/
    chat.ts
    profile.ts
    learning.ts
    simulation.ts
```

## Environment

```bash
PSON_STORE_BACKEND=file
PSON_STORE_DIR=.pson5-store

# Optional provider-backed modeling/simulation
PSON_AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
PSON_AI_MODEL=gpt-4.1-mini
PSON_AI_TIMEOUT_MS=20000
```

For production API deployment:

```bash
PSON_STORE_BACKEND=postgres
DATABASE_URL=postgres://...
PSON_ENFORCE_TENANT=true
PSON_ENFORCE_SUBJECT_USER=true
PSON_ACCESS_AUDIT_ENABLED=true
```

## `env.ts`

```ts
export const env = {
  psonStoreRoot: process.env.PSON_STORE_DIR ?? ".pson5-store",
  nodeEnv: process.env.NODE_ENV ?? "development",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  defaultTenantId: process.env.DEFAULT_TENANT_ID ?? "default"
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
```

## `auth.ts`

Replace this with your app auth provider.

```ts
export interface AppUser {
  id: string;
  tenantId: string;
  role: "learner" | "teacher" | "admin";
}

export async function requireUser(req: Request): Promise<AppUser> {
  const userId = req.headers.get("x-demo-user-id");
  const tenantId = req.headers.get("x-demo-tenant-id") ?? "default";

  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
    id: userId,
    tenantId,
    role: "learner"
  };
}
```

## `pson.ts`

```ts
import { PsonClient } from "@pson5/sdk";
import type { ProfileStoreOptions } from "@pson5/core-types";
import { env } from "./env";

export const pson = new PsonClient();

export const psonStore: ProfileStoreOptions = {
  rootDir: env.psonStoreRoot
};

export async function ensureUserProfile(input: {
  userId: string;
  tenantId: string;
  domains?: string[];
  depth?: "light" | "standard" | "deep";
}) {
  return pson.ensureProfile(
    {
      user_id: input.userId,
      tenant_id: input.tenantId,
      domains: input.domains ?? ["core"],
      depth: input.depth ?? "light"
    },
    psonStore
  );
}
```

## `llm.ts`

This file is intentionally provider-neutral. Use your own model SDK.

```ts
export interface LlmMessage {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}

export async function runLlm(input: {
  messages: LlmMessage[];
  tools?: unknown[];
}): Promise<{ text: string; toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }> }> {
  // Replace with OpenAI, Anthropic, local model, or hosted inference provider.
  // Return text and any tool calls your provider emits.
  return {
    text: "LLM response placeholder"
  };
}
```

## `routes/chat.ts`

```ts
import { pson, psonStore, ensureUserProfile } from "../pson";
import { requireUser } from "../auth";
import { runLlm } from "../llm";

export async function chat(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const body = await req.json() as { message?: string };
  const message = body.message?.trim();

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const profile = await ensureUserProfile({
    userId: user.id,
    tenantId: user.tenantId,
    domains: ["core", "education"],
    depth: "standard"
  });

  const context = await pson.getAgentContext(
    profile.profile_id,
    {
      intent: message,
      domains: ["core", "education"],
      include_predictions: true,
      max_items: 16,
      min_confidence: 0.35,
      task_context: {
        product_surface: "chat",
        tenant_id: user.tenantId
      }
    },
    psonStore
  );

  const result = await runLlm({
    messages: [
      {
        role: "system",
        content: [
          "You are a helpful assistant.",
          "Use PSON context to personalize tone and examples.",
          "Do not expose raw profile data.",
          "Treat inferred/simulated profile data as uncertain."
        ].join("\n")
      },
      {
        role: "developer",
        content: JSON.stringify({ pson_agent_context: context })
      },
      {
        role: "user",
        content: message
      }
    ]
  });

  return Response.json({
    answer: result.text,
    profile_id: profile.profile_id,
    context_redactions: context.redaction_notes
  });
}
```

## `routes/profile.ts`

```ts
import { pson, psonStore, ensureUserProfile } from "../pson";
import { requireUser } from "../auth";

export async function getMyProfile(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const profile = await ensureUserProfile({
    userId: user.id,
    tenantId: user.tenantId
  });

  const safeExport = JSON.parse(pson.export(profile, { redaction_level: "safe" }));

  return Response.json({
    profile: safeExport
  });
}

export async function rememberFact(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const body = await req.json() as {
    domain?: string;
    key?: string;
    value?: string | number | boolean | string[] | null;
    note?: string;
  };

  const profile = await ensureUserProfile({
    userId: user.id,
    tenantId: user.tenantId
  });

  if (!body.domain || !body.key || !("value" in body)) {
    return Response.json({ error: "domain, key, and value are required" }, { status: 400 });
  }

  const updated = await pson.observeFact(
    {
      profile_id: profile.profile_id,
      domain: body.domain,
      key: body.key,
      value: body.value,
      confidence: 1,
      note: body.note
    },
    psonStore
  );

  return Response.json({
    profile_id: updated.profile_id,
    revision: updated.metadata.revision
  });
}
```

## `routes/learning.ts`

```ts
import { pson, psonStore, ensureUserProfile } from "../pson";
import { requireUser } from "../auth";

export async function nextQuestions(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const profile = await ensureUserProfile({
    userId: user.id,
    tenantId: user.tenantId,
    domains: ["core", "education"]
  });

  const result = await pson.getNextQuestions(
    profile.profile_id,
    {
      domains: ["education"],
      depth: "standard",
      limit: 2
    },
    psonStore
  );

  return Response.json(result);
}

export async function submitAnswers(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const body = await req.json() as {
    session_id?: string;
    answers?: Array<{ question_id: string; value: string | number | boolean | string[] }>;
  };

  const profile = await ensureUserProfile({
    userId: user.id,
    tenantId: user.tenantId,
    domains: ["core", "education"]
  });

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return Response.json({ error: "answers are required" }, { status: 400 });
  }

  const result = await pson.learn(
    {
      profile_id: profile.profile_id,
      session_id: body.session_id,
      answers: body.answers,
      options: {
        return_next_questions: true,
        next_question_limit: 1
      }
    },
    psonStore
  );

  return Response.json(result);
}
```

## `routes/simulation.ts`

```ts
import { pson, psonStore, ensureUserProfile } from "../pson";
import { requireUser } from "../auth";

export async function simulate(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const body = await req.json() as {
    scenario?: string;
    question?: string;
    options?: string[];
  };

  const profile = await ensureUserProfile({
    userId: user.id,
    tenantId: user.tenantId,
    domains: ["core", "education"]
  });

  const policy = await pson.getProviderPolicy(profile.profile_id, "simulation", psonStore);
  if (!policy.allowed) {
    return Response.json({ allowed: false, policy }, { status: 403 });
  }

  const result = await pson.simulate(
    {
      profile_id: profile.profile_id,
      domains: ["education", "core"],
      context: {
        scenario: body.scenario ?? "General personalized decision support",
        question: body.question ?? "What response is most likely to fit the user?",
        options: body.options ?? []
      },
      options: {
        include_reasoning: true,
        include_evidence: true,
        explanation_level: "standard"
      }
    },
    psonStore
  );

  return Response.json(result);
}
```

## `server.ts`

```ts
import { chat } from "./routes/chat";
import { getMyProfile, rememberFact } from "./routes/profile";
import { nextQuestions, submitAnswers } from "./routes/learning";
import { simulate } from "./routes/simulation";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "POST /chat": chat,
  "GET /profile/me": getMyProfile,
  "POST /profile/facts": rememberFact,
  "GET /learning/questions": nextQuestions,
  "POST /learning/answers": submitAnswers,
  "POST /simulate": simulate
};

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    const url = new URL(req.url);
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key];

    if (!handler) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof Response) return error;
      return Response.json(
        {
          error: error instanceof Error ? error.message : "internal error"
        },
        { status: 500 }
      );
    }
  }
});
```

If you use Express, Hono, Fastify, Next.js route handlers, or Cloudflare Workers, keep the same route logic and swap only the server wrapper.

## Request Examples

```bash
curl -X POST http://localhost:3000/chat \
  -H "content-type: application/json" \
  -H "x-demo-user-id: learner_123" \
  -H "x-demo-tenant-id: school_456" \
  -d '{"message":"Can you explain two-step equations?"}'
```

```bash
curl -X POST http://localhost:3000/profile/facts \
  -H "content-type: application/json" \
  -H "x-demo-user-id: learner_123" \
  -H "x-demo-tenant-id: school_456" \
  -d '{"domain":"education","key":"prefers_visual_examples","value":true,"note":"Learner said diagrams help."}'
```

```bash
curl -X POST http://localhost:3000/simulate \
  -H "content-type: application/json" \
  -H "x-demo-user-id: learner_123" \
  -H "x-demo-tenant-id: school_456" \
  -d '{"scenario":"Learner failed three questions in a row","question":"What intervention should the tutor try next?","options":["worked example","hint","break"]}'
```

## Production Notes

- Replace header-demo auth with your real auth provider.
- Use Postgres or a custom adapter for horizontal scaling.
- Keep `tenant_id` mandatory for B2B products.
- Do not send raw profiles to LLMs.
- Add a profile export/delete flow.
- Keep provider policy checks before every provider-backed simulation/modeling call.
- Add explicit tests for subject-user isolation.
- Add explicit tests for tenant isolation.
- Run load tests against your store adapter before high-volume launch.

