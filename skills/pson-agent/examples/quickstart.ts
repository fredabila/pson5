/**
 * PSON5 agent quickstart — the four-line starter.
 *
 * Prerequisite: `npm install @pson5/sdk` in your project. A provider key is optional.
 *
 * What this does:
 *   - creates a profile for `user_123`
 *   - asks for the next adaptive question
 *   - submits an answer
 *   - builds an agent-safe context for a specific intent
 */

import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();
const store = { rootDir: ".pson5-store" };

// 1. Create the profile
const profile = await pson.createAndSaveProfile(
  { user_id: "user_123", domains: ["core"], depth: "standard" },
  store
);
console.log("profile created:", profile.profile_id);

// 2. Get the next adaptive question from the registry
const session = await pson.getNextQuestions(profile.profile_id, { limit: 1 }, store);
const question = session.questions[0];
console.log("question:", question?.prompt);

// 3. Submit the user's answer — runs modeling → state → graph → save
const learn = await pson.learn(
  {
    profile_id: profile.profile_id,
    session_id: session.session.session_id,
    answers: question ? [{ question_id: question.id, value: "plan_first" }] : []
  },
  store
);
console.log("revision:", learn.profile.metadata.revision);

// 4. Build the agent-safe projection
const context = await pson.getAgentContext(
  profile.profile_id,
  {
    intent: "help the user plan their next study session",
    include_predictions: true,
    max_items: 6,
    min_confidence: 0.5
  },
  store
);
console.log("context entries:", context.personal_data.preferences.length);
console.log("redactions:", context.redaction_notes?.length ?? 0);
