#!/usr/bin/env node
/**
 * Josh — tech-employment persona, run end-to-end against a live Claude model.
 *
 * Synthetic user: Josh, 21, self-taught systems engineer, building in public
 * for six years. Deliberately strong answers across the custom
 * "tech-employment" domain so the resulting profile shows a clear signal
 * set the agent-context projection can work with.
 *
 * What this script does:
 *   1. Spins up a temporary PSON5 store under /tmp
 *   2. Registers the tech-employment domain (see tech-employment-domain.json)
 *   3. Creates Josh's profile with consent scopes allowing AI use
 *   4. Drives a real learning loop: fetch next question, submit Josh's answer,
 *      submit the free-text answer (which forces the provider to normalise),
 *      repeat until the session pauses
 *   5. Builds an agent-safe context for a recruiting-assistant intent
 *   6. Runs a simulation against a concrete scenario
 *   7. Prints the state snapshot, graph summary, and the provider-call audit
 *
 * Credentials never touch disk. The script reads ANTHROPIC_API_KEY (or
 * PSON_AI_API_KEY) from the environment. Call site:
 *
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   PSON_AI_PROVIDER=anthropic \
 *   PSON_AI_MODEL=claude-haiku-4-5-20251001 \
 *   node examples/josh-tech-persona/run.mjs
 */

import { readFileSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SDK entry points. Using direct dist imports so this runs against the
// built workspace without needing an npm install.
import {
  clearStoredProviderConfig,
  getProviderStatusFromEnv,
  listProviderAdapters,
  readProviderCallAuditRecords
} from "../../packages/provider-engine/dist/provider-engine/src/index.js";
import {
  saveDomainModules,
  submitLearningAnswers
} from "../../packages/acquisition-engine/dist/acquisition-engine/src/index.js";
import {
  exportProfile,
  initProfile,
  loadProfile,
  readRevisionAuditRecords
} from "../../packages/serialization-engine/dist/serialization-engine/src/index.js";
import { buildAgentContext } from "../../packages/agent-context/dist/agent-context/src/index.js";
import { getActiveStateSnapshot } from "../../packages/state-engine/dist/state-engine/src/index.js";
import { explainPrediction } from "../../packages/graph-engine/dist/graph-engine/src/index.js";
import { simulateStoredProfile } from "../../packages/simulation-engine/dist/simulation-engine/src/index.js";
import { getNextQuestions } from "../../packages/acquisition-engine/dist/acquisition-engine/src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------- configuration ----------------------------------

const JOSH = {
  user_id: "josh_21",
  tenant_id: "demo-tenant",
  domains: ["core", "tech-employment"],
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
};

// Josh's scripted answers. Each maps to one question id from
// tech-employment-domain.json.
const JOSH_ANSWERS = {
  tech_years_experience: "4_6",
  tech_primary_focus: "systems",
  tech_favorite_language: "rust",
  tech_company_stage: "early_stage",
  tech_comp_priority: "equity",
  tech_work_arrangement: "remote",
  tech_growth_signals:
    "Access to hard technical problems, a staff+ engineer who'll rip my code apart in PRs, founders who ship with me instead of directing from slides, and no process tax on experimentation. If there's a wiki page titled 'our architecture principles' that's been edited once in two years, that's a signal I'll outgrow it in six months."
};

// Built-in core questions we also let Josh answer, so the state engine has
// enough evidence for interesting heuristics.
const CORE_ANSWERS = {
  core_problem_solving_style: "figure_it_out",
  core_learning_mode: "doing",
  core_explanation_preference: "deep",
  core_task_start_pattern: "start_immediately",
  core_deadline_effect: "helps_focus"
};

// --------------------------- helpers ----------------------------------------

const OBSERVED_COLOR = "\x1b[38;5;221m";
const INFERRED_COLOR = "\x1b[38;5;155m";
const SIMULATED_COLOR = "\x1b[38;5;117m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function section(title) {
  console.log(`\n${BOLD}══ ${title} ══${RESET}`);
}

function keyValue(key, value) {
  const valueStr =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  console.log(`  ${DIM}${key.padEnd(26)}${RESET}${valueStr}`);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

async function verifyProvider() {
  const key = process.env.ANTHROPIC_API_KEY || process.env.PSON_AI_API_KEY || "";
  if (!key) {
    throw new Error(
      "No API key found. Set ANTHROPIC_API_KEY=sk-ant-... before running this script."
    );
  }
  if (!process.env.PSON_AI_PROVIDER) {
    process.env.PSON_AI_PROVIDER = "anthropic";
  }
  if (!process.env.ANTHROPIC_API_KEY && process.env.PSON_AI_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.PSON_AI_API_KEY;
  }
  if (!process.env.PSON_AI_MODEL) {
    process.env.PSON_AI_MODEL = "claude-haiku-4-5-20251001";
  }
}

// --------------------------- main flow --------------------------------------

async function main() {
  section("Provider");
  await verifyProvider();
  const adapters = listProviderAdapters().map((a) => a.name).join(", ");
  keyValue("registered adapters", adapters);
  const status = getProviderStatusFromEnv();
  keyValue("configured", String(status.configured));
  keyValue("provider", status.provider ?? "—");
  keyValue("model", status.model ?? "—");
  keyValue("source", status.source);
  if (!status.configured) {
    throw new Error(`Provider not configured: ${status.reason}`);
  }

  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-josh-"));
  keyValue("store root", storeRoot);
  const storeOptions = { rootDir: storeRoot };

  try {
    section("Domain registration");
    const domainPath = path.join(__dirname, "tech-employment-domain.json");
    const modules = JSON.parse(readFileSync(domainPath, "utf8"));
    const saved = await saveDomainModules(modules, storeOptions);
    keyValue("domain modules", saved.count);
    keyValue("path", saved.path);

    section("Initialize Josh's profile");
    const profile = await initProfile(JOSH, storeOptions);
    keyValue("profile_id", profile.profile_id);
    keyValue("user_id", profile.user_id);
    keyValue("tenant_id", profile.tenant_id);
    keyValue("active domains", profile.domains.active.join(", "));
    keyValue("depth", profile.domains.depth);
    keyValue("consent scopes", profile.consent.scopes.length);
    keyValue("revision", profile.metadata.revision);

    section("Adaptive learning loop");
    let sessionId = undefined;
    let askedCount = 0;
    const answerMap = { ...CORE_ANSWERS, ...JOSH_ANSWERS };

    for (let turn = 0; turn < 15; turn += 1) {
      const next = await getNextQuestions(
        profile.profile_id,
        { session_id: sessionId, limit: 1 },
        storeOptions
      );
      sessionId = next.session.session_id;

      if (next.questions.length === 0) {
        keyValue("session ended", next.session.stop_reason ?? "no more questions");
        break;
      }

      const question = next.questions[0];
      askedCount += 1;
      console.log(
        `\n  ${DIM}turn ${turn + 1}${RESET}  ${BOLD}${question.prompt}${RESET}`
      );
      console.log(
        `  ${DIM}    id=${question.id}  type=${question.type}  domain=${question.domain}  generated_by=${question.generated_by ?? "registry"}${RESET}`
      );

      const scripted = answerMap[question.id];
      if (!scripted) {
        console.log(
          `  ${DIM}    (no scripted answer for ${question.id}; ending loop)${RESET}`
        );
        break;
      }

      console.log(`  ${OBSERVED_COLOR}Josh:${RESET} ${scripted}`);

      const result = await submitLearningAnswers(
        {
          profile_id: profile.profile_id,
          session_id: sessionId,
          answers: [{ question_id: question.id, value: scripted }],
          options: { return_next_questions: false }
        },
        storeOptions
      );
      keyValue(
        `    rev→${result.profile.metadata.revision}`,
        `confidence=${result.profile.metadata.confidence.toFixed(2)}  gaps=${result.session.confidence_gaps?.length ?? 0}`
      );
    }

    const enrichedProfile = await loadProfile(profile.profile_id, storeOptions);

    section("Observed facts (what Josh told us)");
    const observed = enrichedProfile.layers.observed;
    for (const [domain, value] of Object.entries(observed)) {
      const facts = value?.facts ?? {};
      for (const [key, factValue] of Object.entries(facts)) {
        keyValue(`${domain}.${key}`, factValue);
      }
    }

    section("Inferred traits (what PSON5 thinks)");
    const inferred = enrichedProfile.layers.inferred;
    for (const domain of ["core", "tech-employment"]) {
      const domainTraits = inferred[domain]?.traits ?? [];
      for (const trait of domainTraits) {
        console.log(
          `  ${INFERRED_COLOR}${trait.key.padEnd(28)}${RESET} ${String(trait.value).padEnd(24)} ${DIM}conf=${trait.confidence.score.toFixed(2)}${RESET}`
        );
      }
    }
    const heuristics = inferred.heuristics ?? [];
    if (heuristics.length > 0) {
      console.log("");
      for (const heuristic of heuristics) {
        console.log(
          `  ${INFERRED_COLOR}heuristic${RESET}  ${heuristic.id}  ${DIM}conf=${heuristic.confidence.score.toFixed(2)}${RESET}`
        );
        console.log(`    ${DIM}${heuristic.description}${RESET}`);
      }
    }
    if (inferred.ai_model) {
      console.log("");
      console.log(`  ${INFERRED_COLOR}ai_model.summary${RESET}`);
      console.log(`    ${inferred.ai_model.summary}`);
      if (inferred.ai_model.caveats?.length > 0) {
        console.log(`  ${DIM}caveats:${RESET}`);
        for (const caveat of inferred.ai_model.caveats) {
          console.log(`    - ${caveat}`);
        }
      }
    }

    section("State snapshot (what Josh is probably feeling)");
    const state = getActiveStateSnapshot(enrichedProfile);
    keyValue("evaluated_triggers", state.evaluated_triggers.join(", ") || "—");
    keyValue("decay applied", String(state.decay_applied));
    for (const entry of state.active_states) {
      console.log(
        `  ${entry.state_id.padEnd(14)} likelihood=${entry.likelihood.toFixed(2)}  base=${entry.base_confidence.toFixed(2)}  trigger_boost=${entry.trigger_boost.toFixed(2)}  ${DIM}[${entry.matched_triggers.join(", ")}]${RESET}`
      );
    }

    section("Agent-context projection (what a recruiting agent sees)");
    const agentContext = buildAgentContext(enrichedProfile, {
      intent: "help the user discover early-stage systems-engineering roles with strong technical mentorship",
      domains: ["core", "tech-employment"],
      include_predictions: true,
      max_items: 6,
      min_confidence: 0.55
    });
    for (const [category, entries] of Object.entries(agentContext.personal_data)) {
      if (entries.length === 0) continue;
      console.log(`  ${BOLD}${category}${RESET}`);
      for (const entry of entries) {
        const color =
          entry.source === "observed"
            ? OBSERVED_COLOR
            : entry.source === "simulation"
              ? SIMULATED_COLOR
              : INFERRED_COLOR;
        console.log(
          `    ${color}${entry.key.padEnd(28)}${RESET} ${String(entry.value).padEnd(24)} ${DIM}rel=${entry.relevance.toFixed(2)} conf=${entry.confidence.toFixed(2)}${RESET}`
        );
      }
    }
    if (agentContext.redaction_notes?.length > 0) {
      console.log("");
      console.log(`  ${DIM}redaction notes${RESET}`);
      for (const note of agentContext.redaction_notes) {
        console.log(`    - ${note.path}  (${note.reason})`);
      }
    } else {
      console.log(`  ${DIM}no redactions — Josh granted the relevant scopes${RESET}`);
    }

    section("Simulation: being recruited for a hot AI-infra startup");
    const simulation = await simulateStoredProfile(
      {
        profile_id: enrichedProfile.profile_id,
        context: {
          scenario: "cold_recruiting_outreach",
          role: "Founding Engineer (Rust, systems)",
          stage: "series_A",
          mentor: "ex-staff from a well-known infra company",
          process: "two-hour pairing session on the actual product"
        },
        domains: ["tech-employment"],
        options: {
          include_reasoning: true,
          include_evidence: true,
          explanation_level: "standard"
        }
      },
      storeOptions
    );
    console.log(`  ${SIMULATED_COLOR}prediction${RESET}  ${BOLD}${simulation.prediction}${RESET}`);
    keyValue("confidence", simulation.confidence.toFixed(2));
    keyValue("provider.mode", simulation.provider?.mode ?? "—");
    keyValue("provider.model", simulation.provider?.model ?? "—");
    if (simulation.reasoning?.length) {
      console.log(`  ${DIM}reasoning:${RESET}`);
      for (const step of simulation.reasoning) {
        console.log(`    - ${step}`);
      }
    }
    if (simulation.caveats?.length) {
      console.log(`  ${DIM}caveats:${RESET}`);
      for (const caveat of simulation.caveats) {
        console.log(`    - ${caveat}`);
      }
    }
    if (simulation.alternatives?.length) {
      keyValue("alternatives", simulation.alternatives.join(", "));
    }

    section("Graph explanation for the prediction");
    const explanation = explainPrediction(enrichedProfile, simulation.prediction);
    if (explanation.paths.length === 0) {
      console.log(`  ${DIM}no structural paths exist for prediction '${simulation.prediction}' yet${RESET}`);
    } else {
      for (const support of explanation.support.slice(0, 6)) {
        console.log(`  ${support}`);
      }
    }

    section("Audit trails");
    const revisionAudit = await readRevisionAuditRecords({
      ...storeOptions,
      profile_id: profile.profile_id
    });
    keyValue("revision audit entries", revisionAudit.length);
    keyValue(
      "revisions",
      revisionAudit
        .map((r) => `${r.previous_revision ?? "∅"}→${r.revision}`)
        .join(", ")
    );

    const providerCalls = await readProviderCallAuditRecords(storeOptions);
    keyValue("provider calls", providerCalls.length);
    for (const call of providerCalls.slice(-8)) {
      console.log(
        `  ${call.schema_name.padEnd(28)} ${DIM}${call.success ? "ok" : "fail"}  ${call.attempts}x  ${call.duration_ms}ms  ~${call.estimated_prompt_tokens}+${call.estimated_response_tokens}tok${RESET}`
      );
    }

    section("Safe export preview");
    const safe = JSON.parse(exportProfile(enrichedProfile, { redaction_level: "safe" }));
    keyValue("user_id", safe.user_id);
    keyValue("has ai_model", String(Boolean(safe.layers.inferred.ai_model)));
    keyValue("observed domains", Object.keys(safe.layers.observed).join(", "));

    console.log(
      `\n${BOLD}Done.${RESET} ${DIM}temp store kept at ${storeRoot} for inspection — remove when finished.${RESET}\n`
    );
  } catch (error) {
    console.error(`\n${BOLD}Demo failed:${RESET}`, error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
