const baseUrl = process.env.PSON_API_BASE_URL ?? "http://localhost:3015";
const apiKey = process.env.PSON_API_KEY ?? "";
const bearerToken = process.env.PSON_BEARER_TOKEN ?? "";
const tenantId = process.env.PSON_TENANT_ID ?? "";
const callerId = process.env.PSON_CALLER_ID ?? "";
const subjectUserId = process.env.PSON_SUBJECT_USER_ID ?? "";
const demoUserId = process.env.PSON_DEMO_USER_ID ?? subjectUserId ?? "app_user_42";

function buildHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    ...(tenantId ? { "x-pson-tenant-id": tenantId } : {}),
    ...(callerId ? { "x-pson-caller-id": callerId } : {}),
    ...(subjectUserId ? { "x-pson-user-id": subjectUserId } : {})
  };
}

async function executeTool(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pson/tools/execute`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      name,
      arguments: args
    })
  });

  return response.json();
}

async function run() {
  const tools = await fetch(`${baseUrl}/v1/pson/tools/openai`, {
    headers: buildHeaders()
  }).then((response) => response.json());

  console.log("tool definitions");
  console.log(JSON.stringify(tools, null, 2));

  let profile = await executeTool("pson_load_profile_by_user_id", {
    user_id: demoUserId
  });

  if ((profile as { error?: unknown }).error) {
    profile = await executeTool("pson_create_profile", {
      user_id: demoUserId,
      domains: ["core", "education"],
      depth: "standard"
    });
  }

  console.log("profile");
  console.log(JSON.stringify(profile, null, 2));

  const profileId = (profile as { result?: { profile_id?: string }; profile_id?: string }).result?.profile_id
    ?? (profile as { profile_id?: string }).profile_id;

  const next = await executeTool("pson_get_next_questions", {
    profile_id: profileId,
    limit: 1
  });

  console.log("next question");
  console.log(JSON.stringify(next, null, 2));

  const nextResult = (next as { result?: { session?: { session_id?: string }; questions?: Array<{ id: string }> } }).result;
  const sessionId = nextResult?.session?.session_id;
  const questionId = nextResult?.questions?.[0]?.id;

  if (sessionId && questionId) {
    const learned = await executeTool("pson_learn", {
      profile_id: profileId,
      session_id: sessionId,
      answers: [
        {
          question_id: questionId,
          value: "I usually need pressure before I fully engage."
        }
      ]
    });

    console.log("learn result");
    console.log(JSON.stringify(learned, null, 2));
  }

  const result = await executeTool("pson_get_agent_context", {
    profile_id: profileId,
    intent: "tutoring",
    include_predictions: true,
    max_items: 12
  });

  console.log("tool result");
  console.log(JSON.stringify(result, null, 2));
}

void run();
