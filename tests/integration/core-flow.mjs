import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getBuiltInQuestionRegistry,
  submitLearningAnswers
} from "../../packages/acquisition-engine/dist/acquisition-engine/src/index.js";
import { buildAgentContext } from "../../packages/agent-context/dist/agent-context/src/index.js";
import {
  exportProfile,
  initProfile,
  loadProfile,
  saveProfile
} from "../../packages/serialization-engine/dist/serialization-engine/src/index.js";
import { simulateStoredProfile } from "../../packages/simulation-engine/dist/simulation-engine/src/index.js";
import {
  applyConfidenceDecay,
  getActiveStateSnapshot
} from "../../packages/state-engine/dist/state-engine/src/index.js";

const CORE_ANSWERS = [
  { question_id: "core_problem_solving_style", value: "plan_first" },
  { question_id: "core_learning_mode", value: "doing" },
  { question_id: "core_explanation_preference", value: "summary" },
  { question_id: "core_task_start_pattern", value: "delay_start" },
  { question_id: "core_deadline_effect", value: "causes_stress" }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function coreFlow(storeRoot) {
  const storeOptions = { rootDir: storeRoot };

  // Sanity: registry is populated
  const registry = getBuiltInQuestionRegistry();
  assert.ok(registry.length >= 5, "built-in registry must include core questions");

  // 1) init profile
  const initial = await initProfile(
    {
      user_id: "core_flow_user",
      domains: ["core"],
      depth: "deep"
    },
    storeOptions
  );
  assert.equal(initial.user_id, "core_flow_user");
  assert.equal(initial.metadata.revision, 1);
  assert.equal(initial.consent.granted, true);

  // 2) submit answers
  const learnResult = await submitLearningAnswers(
    {
      profile_id: initial.profile_id,
      answers: CORE_ANSWERS,
      options: { return_next_questions: false, next_question_limit: 0 }
    },
    storeOptions
  );
  assert.equal(learnResult.profile.profile_id, initial.profile_id);
  assert.ok(learnResult.profile.metadata.revision > initial.metadata.revision, "revision must advance");
  assert.ok(
    learnResult.updated_fields.includes("layers.observed.core.answers.core_deadline_effect"),
    "answers must land under observed.core.answers"
  );

  const observedCore = learnResult.profile.layers.observed.core;
  assert.equal(observedCore.facts.deadline_effect, "causes_stress");
  assert.equal(observedCore.facts.task_start_pattern, "delay_start");

  const inferredCore = learnResult.profile.layers.inferred.core;
  assert.ok(Array.isArray(inferredCore.traits) && inferredCore.traits.length >= 4, "traits derived");

  assert.ok(learnResult.profile.state_model.states.length >= 1, "state_model populated");
  assert.ok(learnResult.profile.knowledge_graph.nodes.length >= 1, "knowledge_graph populated");

  // 3) agent context — normal case
  const context = buildAgentContext(learnResult.profile, {
    intent: "help the user plan a study session with a tight deadline",
    include_predictions: false,
    max_items: 8,
    min_confidence: 0.4
  });
  assert.equal(context.profile_id, learnResult.profile.profile_id);
  assert.ok(Array.isArray(context.redaction_notes), "redaction_notes is an array");
  assert.equal(context.redaction_notes.length, 0, "no redactions expected on clean profile");
  assert.ok(
    context.personal_data.preferences.length + context.personal_data.behavioral_patterns.length > 0,
    "personal_data must have something"
  );

  // 4) redaction reasons — restrict one fact
  const restricted = clone(learnResult.profile);
  restricted.privacy.restricted_fields = ["layers.observed.core.facts.deadline_effect"];
  const restrictedContext = buildAgentContext(restricted, {
    intent: "help plan a deadline-sensitive task",
    include_predictions: false,
    max_items: 8,
    min_confidence: 0.4
  });
  const restrictedNote = restrictedContext.redaction_notes.find(
    (note) => note.path === "layers.observed.core.facts.deadline_effect"
  );
  assert.ok(restrictedNote, "restricted field must surface a redaction note");
  assert.equal(restrictedNote.reason, "restricted_field");

  // 5) consent withheld
  const withheld = clone(learnResult.profile);
  withheld.consent.granted = false;
  const withheldContext = buildAgentContext(withheld, {
    intent: "anything",
    include_predictions: false
  });
  assert.equal(withheldContext.personal_data.preferences.length, 0);
  assert.equal(withheldContext.personal_data.behavioral_patterns.length, 0);
  assert.equal(
    withheldContext.redaction_notes.find((note) => note.reason === "consent_not_granted")?.path,
    "consent"
  );

  // 6) simulate (rule-based fallback — no provider configured)
  const simulation = await simulateStoredProfile(
    {
      profile_id: learnResult.profile.profile_id,
      context: {
        scenario: "exam_preparation",
        days_until_exam: 7
      },
      domains: ["core"],
      options: { include_reasoning: true, include_evidence: true, explanation_level: "standard" }
    },
    storeOptions
  );
  assert.ok(typeof simulation.prediction === "string" && simulation.prediction.length > 0);
  assert.ok(simulation.confidence >= 0 && simulation.confidence <= 1);
  assert.ok(Array.isArray(simulation.reasoning));
  assert.equal(typeof simulation.context_hash, "string");

  // 7) export safe — verify redaction applied
  const safeExport = JSON.parse(
    exportProfile(learnResult.profile, { redaction_level: "safe" })
  );
  assert.equal(safeExport.user_id, "redacted", "safe export anonymises user_id");
  assert.equal(
    safeExport.layers.inferred.ai_model,
    undefined,
    "safe export drops provider-sourced inferred.ai_model"
  );

  const fullExport = JSON.parse(exportProfile(learnResult.profile, { redaction_level: "full" }));
  assert.equal(fullExport.user_id, "core_flow_user", "full export keeps user_id");

  // 8) state snapshot — base call
  const baseSnapshot = getActiveStateSnapshot(learnResult.profile);
  assert.ok(Array.isArray(baseSnapshot.active_states) && baseSnapshot.active_states.length >= 1);
  for (const entry of baseSnapshot.active_states) {
    assert.equal(typeof entry.base_confidence, "number");
    assert.equal(typeof entry.decayed_confidence, "number");
    assert.equal(typeof entry.trigger_boost, "number");
    assert.ok(Array.isArray(entry.matched_triggers));
  }
  assert.ok(Array.isArray(baseSnapshot.evaluated_triggers));

  const stressed = baseSnapshot.active_states.find((entry) => entry.state_id === "stressed");
  assert.ok(stressed, "stressed state expected from causes_stress signal");
  assert.ok(
    stressed.matched_triggers.includes("deadline_pressure"),
    "stressed state triggers must match from observed facts"
  );
  assert.ok(stressed.trigger_boost > 0, "trigger boost applied");

  // 9) decay — simulate an old profile
  const aged = clone(learnResult.profile);
  const oldIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  for (const state of aged.state_model.states) {
    state.confidence.last_validated_at = oldIso;
  }
  const agedSnapshot = getActiveStateSnapshot(aged);
  const agedStressed = agedSnapshot.active_states.find((entry) => entry.state_id === "stressed");
  assert.ok(agedStressed, "aged profile still lists stressed state");
  assert.ok(
    agedStressed.decayed_confidence < stressed.decayed_confidence,
    "confidence must decay over 60 days"
  );

  // Also exercise applyConfidenceDecay directly
  const directDecay = applyConfidenceDecay(
    aged.state_model.states[0].confidence,
    new Date()
  );
  assert.ok(
    directDecay < aged.state_model.states[0].confidence.score,
    "applyConfidenceDecay reduces score for aged evidence"
  );

  // 10) round-trip: save + load keeps shape
  const reloaded = await loadProfile(learnResult.profile.profile_id, storeOptions);
  assert.equal(reloaded.profile_id, learnResult.profile.profile_id);
  assert.equal(reloaded.metadata.revision, learnResult.profile.metadata.revision);

  // Mutating and saving bumps revision on next learn
  await saveProfile(reloaded, storeOptions);
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-core-flow-"));
  try {
    await coreFlow(tempRoot);
    console.log("core flow integration passed");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
