import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initProfile,
  loadProfile,
  observeFact
} from "../../packages/serialization-engine/dist/serialization-engine/src/index.js";

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-observe-fact-"));
const storeOptions = { rootDir };

// Fresh profile.
const initial = await initProfile({ user_id: "test_user", domains: ["core"] }, storeOptions);
assert.equal(initial.metadata.revision, 1);
assert.equal(initial.metadata.source_count, 0);

// ── First observation ──────────────────────────────────────────────────
const afterFirst = await observeFact(
  {
    profile_id: initial.profile_id,
    domain: "core",
    key: "preferred_name",
    value: "Frederick"
  },
  storeOptions
);

assert.equal(afterFirst.metadata.revision, 2, "revision should bump by 1");
assert.equal(afterFirst.metadata.source_count, 1, "source_count should bump by 1");

const coreDomain = afterFirst.layers.observed.core;
assert.ok(coreDomain && typeof coreDomain === "object", "core domain should exist after observation");
assert.equal(coreDomain.facts.preferred_name, "Frederick", "flat facts map should carry the value");

const observations = coreDomain.observations;
const [firstObs] = Object.values(observations ?? {});
assert.ok(firstObs, "observation entry should be present");
assert.equal(firstObs.observation_type, "agent_observation");
assert.equal(firstObs.source_question_id, null);
assert.equal(firstObs.key, "preferred_name");
assert.equal(firstObs.value, "Frederick");
assert.equal(firstObs.confidence, 1.0, "default confidence should be 1.0");

// ── Key sanitization ───────────────────────────────────────────────────
const afterSanitized = await observeFact(
  {
    profile_id: initial.profile_id,
    domain: "core",
    key: "Favorite Colour!",
    value: "phosphor green",
    note: "User said 'I love phosphor green'",
    confidence: 0.9
  },
  storeOptions
);

const sanitizedFacts = afterSanitized.layers.observed.core.facts;
assert.equal(
  sanitizedFacts.favorite_colour,
  "phosphor green",
  "key should be snake-case sanitized"
);
assert.equal(afterSanitized.metadata.source_count, 2);
assert.equal(afterSanitized.metadata.revision, 3);

// Custom note + confidence preserved.
const latest = Object.values(afterSanitized.layers.observed.core.observations).find(
  (o) => o.key === "favorite_colour"
);
assert.ok(latest, "sanitized observation should be findable");
assert.equal(latest.note, "User said 'I love phosphor green'");
assert.equal(latest.confidence, 0.9);

// ── Layer separation — never touches inferred/simulated ────────────────
assert.deepEqual(
  afterSanitized.layers.inferred,
  initial.layers.inferred,
  "observeFact must not touch the inferred layer"
);
assert.deepEqual(
  afterSanitized.layers.simulated,
  initial.layers.simulated,
  "observeFact must not touch the simulated layer"
);

// ── Re-loads from disk with everything intact ──────────────────────────
const reloaded = await loadProfile(initial.profile_id, storeOptions);
assert.equal(reloaded.metadata.revision, 3);
assert.equal(reloaded.layers.observed.core.facts.preferred_name, "Frederick");
assert.equal(reloaded.layers.observed.core.facts.favorite_colour, "phosphor green");

// ── Error paths ─────────────────────────────────────────────────────────
await assert.rejects(
  observeFact({ profile_id: initial.profile_id, domain: "core", key: "", value: "x" }, storeOptions),
  /non-empty key/
);
await assert.rejects(
  observeFact({ profile_id: "", domain: "core", key: "x", value: "x" }, storeOptions),
  /profile_id/
);
await assert.rejects(
  observeFact({ profile_id: initial.profile_id, domain: "", key: "x", value: "x" }, storeOptions),
  /non-empty domain/
);

// Cleanup.
fs.rmSync(rootDir, { recursive: true, force: true });
console.log("observe-fact integration passed");
