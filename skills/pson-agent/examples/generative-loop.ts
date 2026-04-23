/**
 * PSON5 agent — zero-registry generative loop.
 *
 * Start with only a domain brief. Claude (or any configured model) invents
 * every question; you post it to the user; the answer goes back through
 * pson_learn. PSON5 stops the loop itself when the brief saturates.
 *
 * Prerequisites:
 *   - repo cloned + built
 *   - a provider configured (ANTHROPIC_API_KEY + PSON_AI_PROVIDER=anthropic, or
 *     OPENAI_API_KEY, or PSON_AI_PROVIDER=openai-compatible + PSON_AI_BASE_URL)
 *
 * This example simulates the user's answers inline with a placeholder. In a
 * real agent, replace `askUser(...)` with whatever IO your agent has.
 */

import { PsonClient } from "@pson5/sdk";
import {
  deriveGenerativeQuestions,
  type DomainBrief
} from "@pson5/provider-engine";
import {
  openGenerativeSession,
  appendGeneratedQuestions,
  readSession,
  submitLearningAnswers
} from "@pson5/acquisition-engine";
import { loadProfile } from "@pson5/serialization-engine";

const client = new PsonClient();
const store = { rootDir: ".pson5-store" };

// 1. Compose the domain brief — see reference/domain-briefs.md for rules
const brief: DomainBrief = {
  id: "tech-talent-intelligence",
  title: "Tech talent — recruiting / employment / career",
  description:
    "Build a rich understanding of how this engineer works, what they want out of their career, where they thrive, what they avoid, and what signals would move them. Feeds a recruiting assistant and a long-term career-coaching agent.",
  target_areas: [
    "tech_stack_depth",
    "engineering_principles",
    "career_trajectory",
    "compensation_philosophy",
    "work_style",
    "learning_and_growth",
    "collaboration_and_leadership",
    "side_projects",
    "industry_interests",
    "values_and_tradeoffs"
  ],
  sensitivity: "standard",
  max_questions: 24
};

// 2. Create the profile + open a generative session
const profile = await client.createAndSaveProfile(
  {
    user_id: "user_123",
    domains: ["core", brief.id],
    depth: "deep",
    consent: {
      granted: true,
      scopes: [
        "core:read",
        "core:write",
        "ai:use",
        "ai:modeling",
        "ai:simulation",
        "simulation:run"
      ],
      policy_version: "2026-04-22",
      updated_at: new Date().toISOString()
    }
  },
  store
);
const session = await openGenerativeSession(
  profile.profile_id,
  { domains: [brief.id, "core"], depth: "deep" },
  store
);

// 3. Loop — alternate strategies, stop when PSON5 says so
const TOTAL_TURNS = 20;
for (let turn = 0; turn < TOTAL_TURNS; turn += 1) {
  const liveProfile = await loadProfile(profile.profile_id, store);
  const liveSession = await readSession(session.session_id, store);

  const strategy =
    turn < 5 ? "broad_scan" : turn < 15 ? "depth_focus" : "contradiction_probe";

  const generated = await deriveGenerativeQuestions(
    {
      profile: liveProfile,
      brief,
      strategy,
      question_count: 1,
      session_state: {
        session_id: liveSession.session_id,
        asked_question_ids: liveSession.asked_question_ids,
        answered_question_ids: liveSession.answered_question_ids,
        confidence_gaps: liveSession.confidence_gaps ?? [],
        fatigue_score: liveSession.fatigue_score ?? 0
      }
    },
    store
  );

  if (!generated || generated.stop || generated.questions.length === 0) {
    console.log(`stop: ${generated?.stop_reason ?? "no result"}`);
    break;
  }

  await appendGeneratedQuestions(session.session_id, generated.questions, store);

  for (const question of generated.questions) {
    console.log(`Q: ${question.prompt}`);

    // ⬇︎ REPLACE WITH YOUR AGENT'S USER-IO ⬇︎
    const answer = await askUser(question);

    await submitLearningAnswers(
      {
        profile_id: profile.profile_id,
        session_id: session.session_id,
        answers: [{ question_id: question.id, value: answer }],
        options: { return_next_questions: false }
      },
      store
    );
  }
}

// 4. Build the projection for the recruiting agent
const context = await client.getAgentContext(
  profile.profile_id,
  {
    intent:
      "draft a personalised cold-outreach message for a founding-engineer role at a series-A AI infra startup",
    include_predictions: true,
    max_items: 8,
    min_confidence: 0.55
  },
  store
);
console.log("context ready:", Object.keys(context.personal_data));

// Replace this with your real user IO
async function askUser(question: { prompt: string; type: string; choices?: Array<{ value: string; label: string }> }): Promise<string> {
  // In a real agent:
  //   - show question.prompt to the user
  //   - if question.type === "single_choice", present question.choices and return the chosen value
  //   - otherwise, return their free-text response
  throw new Error("Replace askUser() with your agent's user-IO.");
}
