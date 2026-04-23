import { PsonClient, createPsonAgentToolExecutor } from "@pson5/sdk";

const client = new PsonClient();
const store = { rootDir: ".pson5-store" };
const tools = createPsonAgentToolExecutor(client, store);
const userId = process.env.PSON_DEMO_USER_ID ?? "app_user_42";

async function run() {
  let profile;

  try {
    profile = await tools.execute({
      name: "pson_load_profile_by_user_id",
      arguments: { user_id: userId }
    });
  } catch {
    profile = await tools.execute({
      name: "pson_create_profile",
      arguments: {
        user_id: userId,
        domains: ["core", "education"],
        depth: "standard"
      }
    });
  }

  console.log("profile");
  console.log(JSON.stringify(profile, null, 2));

  const next = await tools.execute({
    name: "pson_get_next_questions",
    arguments: {
      profile_id: (profile as { profile_id: string }).profile_id,
      limit: 1
    }
  });

  console.log("next question");
  console.log(JSON.stringify(next, null, 2));

  const sessionId = (next as { session: { session_id: string } }).session.session_id;
  const question = (next as { questions: Array<{ id: string }> }).questions[0];

  if (question) {
    const learned = await tools.execute({
      name: "pson_learn",
      arguments: {
        profile_id: (profile as { profile_id: string }).profile_id,
        session_id: sessionId,
        answers: [
          {
            question_id: question.id,
            value: "I usually start late, then focus hard when the deadline gets close."
          }
        ]
      }
    });

    console.log("learn result");
    console.log(JSON.stringify(learned, null, 2));
  }

  const agentContext = await tools.execute({
    name: "pson_get_agent_context",
    arguments: {
      profile_id: (profile as { profile_id: string }).profile_id,
      intent: "tutoring",
      include_predictions: true,
      max_items: 10
    }
  });

  console.log("agent context");
  console.log(JSON.stringify(agentContext, null, 2));

  const simulation = await tools.execute({
    name: "pson_simulate",
    arguments: {
      profile_id: (profile as { profile_id: string }).profile_id,
      context: {
        task: "study for exam",
        deadline_days: 2,
        difficulty: "high"
      },
      domains: ["education"]
    }
  });

  console.log("simulation");
  console.log(JSON.stringify(simulation, null, 2));
}

void run();
