#!/usr/bin/env node
/**
 * Claude-driven persona — the zero-registry end-to-end demo.
 *
 * PSON5 starts empty: no pre-registered domain module, no hand-written
 * question list. Everything comes from Claude:
 *
 *   Loop #1   Claude (question-generator)  →  proposes the next high-value
 *             question for the domain brief given current profile state.
 *   Loop #2   Claude (Josh-simulator)      →  answers it as Josh would,
 *             staying in character.
 *   PSON5     writes the observed answer, runs modeling / state / graph /
 *             save, updates session intelligence, feeds the new state back
 *             into Loop #1.
 *
 * Output:
 *   - a rich .pson profile with traits, heuristics, state, graph, and
 *     AI-modeling insight
 *   - graph.html  — standalone D3 force-layout viewer; open in a browser
 *   - graph.cypher — paste into Neo4j Browser if you have one
 *   - profile.json — the full exported profile for later inspection
 *   - transcript.json — every question / answer pair with metadata
 *
 * The API key is read only from the environment; it is never written to
 * disk by this script.
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   PSON_AI_PROVIDER=anthropic \
 *   PSON_AI_MODEL=claude-haiku-4-5-20251001 \
 *   node examples/claude-driven-persona/run.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveGenerativeQuestions,
  getProviderStatusFromEnv,
  listProviderAdapters,
  readProviderCallAuditRecords
} from "../../packages/provider-engine/dist/provider-engine/src/index.js";
import {
  appendGeneratedQuestions,
  openGenerativeSession,
  readSession,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOTAL_TURNS = 24;
const BATCH_SIZE = 2; // how many questions to ask Claude to generate per turn
const MODEL_FOR_JOSH = process.env.PSON_AI_MODEL || "claude-haiku-4-5-20251001";
const BASE_URL = process.env.PSON_AI_BASE_URL || "https://api.anthropic.com/v1";

// Colours for readable output
const OBSERVED = "\x1b[38;5;221m";
const INFERRED = "\x1b[38;5;155m";
const SIMULATED = "\x1b[38;5;117m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function section(title) {
  console.log(`\n${BOLD}══ ${title} ══${RESET}`);
}

function kv(key, value) {
  const valueStr =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  console.log(`  ${DIM}${String(key).padEnd(28)}${RESET}${valueStr}`);
}

function assertProvider() {
  const key =
    process.env.ANTHROPIC_API_KEY || process.env.PSON_AI_API_KEY || "";
  if (!key) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY (or PSON_AI_API_KEY). This demo requires a live Claude key."
    );
  }
  if (!process.env.PSON_AI_PROVIDER) {
    process.env.PSON_AI_PROVIDER = "anthropic";
  }
  if (!process.env.ANTHROPIC_API_KEY && process.env.PSON_AI_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.PSON_AI_API_KEY;
  }
  if (!process.env.PSON_AI_MODEL) {
    process.env.PSON_AI_MODEL = MODEL_FOR_JOSH;
  }
  // Modeling insight responses can run long on Haiku (2k+ tokens of caveats).
  // The default 20s timeout aborts a meaningful chunk of the calls, so bump
  // it unless the caller set their own.
  if (!process.env.PSON_AI_TIMEOUT_MS) {
    process.env.PSON_AI_TIMEOUT_MS = "60000";
  }
}

// ---------------------------------------------------------------------------
// Claude-as-Josh: direct Anthropic call that stays in character
// ---------------------------------------------------------------------------

async function answerAsJosh(persona, question) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const choicesBlock =
    question.type === "single_choice" && question.choices?.length
      ? "\n\nChoices (reply with the exact `value` of the one you'd pick):\n" +
        question.choices
          .map((c) => `  - ${c.value} — ${c.label}`)
          .join("\n")
      : "";

  const systemPrompt = [
    `You are playing the character described below. Stay in voice. No meta-commentary.`,
    ``,
    `CHARACTER:`,
    `Name: ${persona.name}`,
    `Age: ${persona.age}`,
    `Bio: ${persona.short_bio}`,
    `Style: ${persona.answering_style}`,
    ``,
    `Examples of Josh's voice:`,
    ...persona.tone_examples.map((x) => `- "${x}"`),
    ``,
    `TASK:`,
    `You will be asked a question. Reply ONLY with strict JSON:`,
    `{ "answer": <string>, "notes": <short string> }`,
    ``,
    `If the question is single_choice, "answer" MUST be one of the exact choice values.`,
    `If the question is free_text or scenario, "answer" is your natural-voice reply (<= 320 chars, Josh's tone).`,
    `"notes" is a one-line internal justification (not shown to the asker).`
  ].join("\n");

  const userPrompt = `Question type: ${question.type}\nPrompt: ${question.prompt}${choicesBlock}`;

  const response = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL_FOR_JOSH,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Josh simulator HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const body = await response.json();
  const raw = body.content
    ?.filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("")
    .trim();
  if (!raw) {
    throw new Error("Josh simulator returned an empty response");
  }

  // Extract the JSON object even if Claude wrapped it in prose.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Josh simulator returned non-JSON: ${raw.slice(0, 120)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (typeof parsed.answer !== "string" || parsed.answer.length === 0) {
    throw new Error(`Josh simulator returned no 'answer' field: ${raw.slice(0, 120)}`);
  }
  return {
    answer: parsed.answer.trim(),
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() : ""
  };
}

// ---------------------------------------------------------------------------
// Profile state helpers for the generative request
// ---------------------------------------------------------------------------

function extractObservedFacts(profile) {
  const facts = {};
  for (const [domain, value] of Object.entries(profile.layers.observed ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const bucket = value.facts ?? {};
    for (const [key, factValue] of Object.entries(bucket)) {
      facts[`${domain}.${key}`] = factValue;
    }
  }
  return facts;
}

function extractInferredTraits(profile) {
  const traits = {};
  const inferred = profile.layers.inferred ?? {};
  for (const [domain, value] of Object.entries(inferred)) {
    if (domain === "heuristics" || domain === "contradictions" || domain === "ai_model" || domain === "last_modeled_at") {
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const list = value.traits ?? [];
    for (const trait of list) {
      if (trait && typeof trait.key === "string") {
        traits[`${domain}.${trait.key}`] = {
          value: trait.value,
          confidence: trait.confidence?.score ?? 0
        };
      }
    }
  }
  return traits;
}

// ---------------------------------------------------------------------------
// Graph export
// ---------------------------------------------------------------------------

function exportCypher(profile) {
  const lines = [
    "// PSON5 knowledge graph export — paste into Neo4j Browser",
    `// profile_id: ${profile.profile_id}`,
    `// user_id:    ${profile.user_id}`,
    ""
  ];
  for (const node of profile.knowledge_graph?.nodes ?? []) {
    const props = {
      id: node.id,
      type: node.type,
      label: node.label,
      data: JSON.stringify(node.data ?? {})
    };
    lines.push(
      `MERGE (:PsonNode { id: ${JSON.stringify(props.id)}, type: ${JSON.stringify(props.type)}, label: ${JSON.stringify(props.label)}, data: ${JSON.stringify(props.data)} });`
    );
  }
  lines.push("");
  for (const edge of profile.knowledge_graph?.edges ?? []) {
    const edgeLabel = (edge.type || "relates_to").toUpperCase();
    lines.push(
      `MATCH (a:PsonNode { id: ${JSON.stringify(edge.from)} }), (b:PsonNode { id: ${JSON.stringify(edge.to)} }) ` +
        `MERGE (a)-[:${edgeLabel} { id: ${JSON.stringify(edge.id)} }]->(b);`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function exportGraphHtml(profile, agentContexts, simulations) {
  const nodes = (profile.knowledge_graph?.nodes ?? []).map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type
  }));
  const edges = (profile.knowledge_graph?.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: edge.type
  }));

  const payload = {
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    revision: profile.metadata.revision,
    generated_at: new Date().toISOString(),
    nodes,
    edges,
    agent_contexts: agentContexts,
    simulations
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>PSON5 graph · ${profile.profile_id}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..600,0..100&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
<style>
  :root {
    --bg-0: #09090b; --bg-1: #0e0f12; --bg-2: #141518;
    --ink-0: #f5f4ef; --ink-1: #b8b6ae; --ink-2: #7d7b73;
    --line: rgba(245,244,239,0.09);
    --accent: #b6ff5c;
    --observed: #f5c76a; --inferred: #b6ff5c; --simulated: #8ec7ff;
    --font-display: "Fraunces", Georgia, serif;
    --font-ui: "Inter", system-ui, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg-0); color: var(--ink-0); font-family: var(--font-ui); overflow: hidden; }
  .app { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }
  .canvas-wrap { position: relative; }
  svg { width: 100%; height: 100%; display: block; }
  .sidebar {
    border-left: 1px solid var(--line);
    padding: 24px 22px;
    overflow-y: auto;
    background: var(--bg-1);
  }
  .sidebar h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 1.4rem;
    letter-spacing: -0.02em;
    margin: 0 0 6px;
  }
  .sidebar .meta {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--ink-2);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 28px;
  }
  .sidebar h2 {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-2);
    margin: 24px 0 10px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--ink-1);
    padding: 3px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    margin: 0 4px 4px 0;
  }
  .chip::before {
    content: "";
    width: 7px; height: 7px; border-radius: 999px;
    background: currentColor;
  }
  .chip.trait, .chip.preference, .chip.decision_rule { color: var(--inferred); }
  .chip.state { color: var(--simulated); }
  .chip.observed, .chip.behavior, .chip.domain_fact { color: var(--observed); }
  .node-label {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--ink-1);
    pointer-events: none;
  }
  .edge-label {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--ink-2);
    pointer-events: none;
  }
  .legend {
    position: absolute; top: 16px; left: 16px;
    display: flex; gap: 6px; flex-wrap: wrap;
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .legend-item {
    background: rgba(14,15,18,0.85);
    border: 1px solid var(--line);
    padding: 4px 10px;
    border-radius: 999px;
    color: var(--ink-1);
    display: inline-flex; align-items: center; gap: 6px;
    backdrop-filter: blur(8px);
  }
  .legend-item::before {
    content: ""; width: 7px; height: 7px; border-radius: 999px;
    background: currentColor;
  }
  .count { background: rgba(14,15,18,0.85); border: 1px solid var(--line); padding: 8px 12px; border-radius: 12px; position: absolute; bottom: 16px; left: 16px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-1); backdrop-filter: blur(8px); }
  pre { font-family: var(--font-mono); font-size: 0.78rem; line-height: 1.55; color: var(--ink-1); background: var(--bg-0); border: 1px solid var(--line); border-radius: 10px; padding: 14px; white-space: pre-wrap; word-break: break-word; margin: 8px 0 16px; }
  .info-card { border: 1px solid var(--line); border-left: 2px solid var(--accent); border-radius: 8px; padding: 12px 14px; margin: 0 0 10px; background: var(--bg-0); }
  .info-card strong { display: block; font-family: var(--font-display); font-weight: 500; font-size: 0.98rem; margin-bottom: 4px; }
  .info-card span { font-size: 0.82rem; color: var(--ink-1); }
</style>
</head>
<body>
<div class="app">
  <div class="canvas-wrap">
    <svg id="graph"></svg>
    <div class="legend">
      <span class="legend-item" style="color: var(--observed)">observed</span>
      <span class="legend-item" style="color: var(--inferred)">inferred</span>
      <span class="legend-item" style="color: var(--simulated)">simulated</span>
    </div>
    <div id="count" class="count"></div>
  </div>
  <aside class="sidebar">
    <h1>PSON<span style="font-style:italic">5</span> graph</h1>
    <div class="meta">${profile.profile_id}</div>

    <h2>Node types</h2>
    <div id="type-chips"></div>

    <h2>Agent contexts</h2>
    <div id="agent-contexts"></div>

    <h2>Simulations</h2>
    <div id="simulations"></div>

    <h2>Raw profile</h2>
    <p style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink-2); margin: 0 0 8px;">Open your devtools console and type <code>pson</code> to inspect the data.</p>
  </aside>
</div>

<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
  const pson = ${JSON.stringify(payload, null, 2)};
  window.pson = pson;

  const COLOR_BY_TYPE = {
    trait: "#b6ff5c",
    preference: "#b6ff5c",
    decision_rule: "#b6ff5c",
    heuristic: "#b6ff5c",
    state: "#8ec7ff",
    behavior: "#f5c76a",
    domain_fact: "#f5c76a",
    skill: "#f5c76a",
    trigger: "#b8b6ae"
  };

  const svg = d3.select("#graph");
  const width  = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  const container = svg.append("g");

  svg.call(
    d3.zoom().scaleExtent([0.4, 3]).on("zoom", (e) => container.attr("transform", e.transform))
  );

  const defs = svg.append("defs");
  defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(245,244,239,0.4)");

  const simulation = d3.forceSimulation(pson.nodes)
    .force("link", d3.forceLink(pson.edges).id(d => d.id).distance(90).strength(0.6))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(28));

  const link = container.append("g")
    .attr("stroke-opacity", 0.38)
    .selectAll("line")
    .data(pson.edges)
    .join("line")
    .attr("stroke", "rgba(245,244,239,0.3)")
    .attr("stroke-width", 1.2)
    .attr("marker-end", "url(#arrow)");

  const edgeLabel = container.append("g")
    .selectAll("text")
    .data(pson.edges)
    .join("text")
    .attr("class", "edge-label")
    .text(d => d.type || "");

  const node = container.append("g")
    .selectAll("circle")
    .data(pson.nodes)
    .join("circle")
    .attr("r", 12)
    .attr("fill", d => COLOR_BY_TYPE[d.type] || "#b8b6ae")
    .attr("fill-opacity", 0.85)
    .attr("stroke", "#0e0f12")
    .attr("stroke-width", 1.5)
    .call(drag(simulation));

  node.append("title").text(d => d.id + " · " + d.type);

  const label = container.append("g")
    .selectAll("text")
    .data(pson.nodes)
    .join("text")
    .attr("class", "node-label")
    .attr("dy", -18)
    .attr("text-anchor", "middle")
    .text(d => d.label);

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    edgeLabel
      .attr("x", d => (d.source.x + d.target.x) / 2)
      .attr("y", d => (d.source.y + d.target.y) / 2);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x).attr("y", d => d.y);
  });

  function drag(sim) {
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null; d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }

  // Sidebar
  const typeCounts = {};
  for (const n of pson.nodes) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  const typeChips = document.getElementById("type-chips");
  typeChips.innerHTML = Object.entries(typeCounts)
    .sort((a,b) => b[1]-a[1])
    .map(([t,c]) => '<span class="chip ' + t + '">' + t + ' · ' + c + '</span>')
    .join(" ");
  document.getElementById("count").textContent = pson.nodes.length + " nodes · " + pson.edges.length + " edges";

  const agentHost = document.getElementById("agent-contexts");
  agentHost.innerHTML = pson.agent_contexts.map(ctx => {
    const entries = Object.entries(ctx.personal_data)
      .flatMap(([cat, items]) => items.map(item => ({ cat, ...item })))
      .slice(0, 6);
    return '<div class="info-card">' +
      '<strong>' + ctx.intent + '</strong>' +
      '<span>' + entries.length + ' top entries · ' + (ctx.redaction_notes?.length ?? 0) + ' redaction notes</span>' +
      '<pre>' + entries.map(e => e.key + ' = ' + JSON.stringify(e.value)).join("\\n") + '</pre>' +
    '</div>';
  }).join("");

  const simHost = document.getElementById("simulations");
  simHost.innerHTML = pson.simulations.map(sim => {
    return '<div class="info-card">' +
      '<strong>' + (sim.scenario_label || 'scenario') + '</strong>' +
      '<span>conf ' + (sim.confidence ?? 0).toFixed(2) + ' · ' + (sim.provider?.mode || 'rules') + '</span>' +
      '<pre>' + sim.prediction + '</pre>' +
    '</div>';
  }).join("");
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  section("Provider");
  assertProvider();
  kv("registered adapters", listProviderAdapters().map((a) => a.name).join(", "));
  const status = getProviderStatusFromEnv();
  kv("provider", status.provider);
  kv("model", status.model);
  kv("source", status.source);
  if (!status.configured) {
    throw new Error("Provider is not configured: " + status.reason);
  }

  const persona = JSON.parse(
    readFileSync(path.join(__dirname, "josh-persona.json"), "utf8")
  );
  const brief = JSON.parse(
    readFileSync(path.join(__dirname, "domain-brief.json"), "utf8")
  );

  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-claude-driven-"));
  const outDir = path.join(__dirname, "output");
  mkdirSync(outDir, { recursive: true });
  kv("store root", storeRoot);
  kv("output dir", outDir);
  const storeOptions = { rootDir: storeRoot };

  section("Initialize profile (empty domain registry)");
  const profileInput = {
    user_id: "josh_21",
    tenant_id: "demo-claude-driven",
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
  };
  const initialProfile = await initProfile(profileInput, storeOptions);
  kv("profile_id", initialProfile.profile_id);
  kv("domains", initialProfile.domains.active.join(", "));
  kv("registered questions", "0 (no domain module loaded)");

  section("Open generative session");
  const session = await openGenerativeSession(
    initialProfile.profile_id,
    { domains: [brief.id, "core"], depth: "deep" },
    storeOptions
  );
  kv("session_id", session.session_id);

  const transcript = [];
  let answeredCount = 0;
  let stopReason = null;
  let profileSnapshot = initialProfile;

  section("Claude-driven question loop");

  for (let turn = 0; turn < TOTAL_TURNS; turn += 1) {
    const liveSession = await readSession(session.session_id, storeOptions);
    const liveProfile = await loadProfile(initialProfile.profile_id, storeOptions);
    profileSnapshot = liveProfile;

    const observedFacts = extractObservedFacts(liveProfile);
    const inferredTraits = extractInferredTraits(liveProfile);

    const strategy =
      turn < 4 ? "broad_scan" : turn < 18 ? "depth_focus" : "contradiction_probe";

    const generated = await deriveGenerativeQuestions(
      {
        profile: liveProfile,
        brief,
        strategy,
        question_count: BATCH_SIZE,
        session_state: {
          session_id: liveSession.session_id,
          asked_question_ids: liveSession.asked_question_ids,
          answered_question_ids: liveSession.answered_question_ids,
          confidence_gaps: liveSession.confidence_gaps ?? [],
          fatigue_score: liveSession.fatigue_score ?? 0,
          observed_facts: observedFacts,
          inferred_traits: inferredTraits
        }
      },
      storeOptions
    );

    if (!generated) {
      stopReason = "provider returned null (policy denied or provider error)";
      break;
    }

    if (generated.stop || generated.questions.length === 0) {
      stopReason = generated.stop_reason ?? "provider signalled stop";
      console.log(`  ${DIM}Provider stopped: ${stopReason}${RESET}`);
      break;
    }

    // Filter out any questions that accidentally duplicate previously asked ids
    const askedSet = new Set(liveSession.asked_question_ids);
    const fresh = generated.questions.filter((q) => !askedSet.has(q.id));
    if (fresh.length === 0) {
      continue;
    }

    await appendGeneratedQuestions(session.session_id, fresh, storeOptions);

    for (const question of fresh) {
      if (answeredCount >= TOTAL_TURNS) break;

      console.log(
        `\n  ${DIM}turn ${answeredCount + 1} [${strategy}]${RESET}  ${BOLD}${question.prompt}${RESET}`
      );
      console.log(
        `  ${DIM}    id=${question.id}  type=${question.type}  domain=${question.domain}  targets=[${question.information_targets.join(", ")}]${RESET}`
      );

      let joshReply;
      try {
        joshReply = await answerAsJosh(persona, question);
      } catch (error) {
        console.log(`  ${DIM}    Josh simulator failed: ${error.message}${RESET}`);
        continue;
      }
      console.log(`  ${OBSERVED}Josh:${RESET} ${joshReply.answer}`);
      if (joshReply.notes) {
        console.log(`  ${DIM}    note: ${joshReply.notes}${RESET}`);
      }

      try {
        const result = await submitLearningAnswers(
          {
            profile_id: initialProfile.profile_id,
            session_id: session.session_id,
            answers: [{ question_id: question.id, value: joshReply.answer }],
            options: { return_next_questions: false }
          },
          storeOptions
        );
        profileSnapshot = result.profile;
        answeredCount += 1;
        console.log(
          `  ${DIM}    rev→${result.profile.metadata.revision}  confidence=${result.profile.metadata.confidence.toFixed(2)}  gaps=${result.session.confidence_gaps?.length ?? 0}${RESET}`
        );
        transcript.push({
          turn: answeredCount,
          strategy,
          question: {
            id: question.id,
            prompt: question.prompt,
            type: question.type,
            domain: question.domain,
            information_targets: question.information_targets,
            generation_rationale: question.generation_rationale
          },
          answer: joshReply.answer,
          josh_notes: joshReply.notes,
          revision_after: result.profile.metadata.revision
        });
      } catch (error) {
        console.log(`  ${DIM}    learn failed: ${error.message}${RESET}`);
      }
    }

    if (answeredCount >= TOTAL_TURNS) break;
  }

  section("Final profile state");
  profileSnapshot = await loadProfile(initialProfile.profile_id, storeOptions);
  kv("answered turns", answeredCount);
  kv("final revision", profileSnapshot.metadata.revision);
  kv("confidence", profileSnapshot.metadata.confidence);
  kv("stop reason", stopReason ?? "TOTAL_TURNS reached");

  section("Observed facts");
  const observed = extractObservedFacts(profileSnapshot);
  const observedKeys = Object.keys(observed);
  kv("fact count", observedKeys.length);
  for (const key of observedKeys.slice(0, 12)) {
    const value = observed[key];
    const text =
      typeof value === "string" && value.length > 80 ? value.slice(0, 77) + "…" : value;
    console.log(`  ${OBSERVED}${key.padEnd(36)}${RESET} ${text}`);
  }
  if (observedKeys.length > 12) {
    console.log(`  ${DIM}… ${observedKeys.length - 12} more not shown${RESET}`);
  }

  section("Inferred traits");
  const inferredTraits = extractInferredTraits(profileSnapshot);
  kv("trait count", Object.keys(inferredTraits).length);
  for (const [key, value] of Object.entries(inferredTraits).slice(0, 10)) {
    console.log(
      `  ${INFERRED}${key.padEnd(36)}${RESET} ${String(value.value).padEnd(24)} ${DIM}conf=${value.confidence.toFixed(2)}${RESET}`
    );
  }

  const aiModel = profileSnapshot.layers.inferred?.ai_model;
  if (aiModel) {
    console.log("");
    console.log(`  ${INFERRED}ai_model.summary${RESET}`);
    console.log(`    ${aiModel.summary}`);
    if (aiModel.trait_candidates?.length) {
      console.log(`  ${DIM}ai trait candidates: ${aiModel.trait_candidates.length}${RESET}`);
    }
    if (aiModel.heuristic_candidates?.length) {
      console.log(`  ${DIM}ai heuristic candidates: ${aiModel.heuristic_candidates.length}${RESET}`);
    }
  }

  section("State snapshot");
  const stateSnap = getActiveStateSnapshot(profileSnapshot);
  kv("evaluated triggers", stateSnap.evaluated_triggers.join(", ") || "—");
  for (const s of stateSnap.active_states) {
    console.log(
      `  ${s.state_id.padEnd(14)} likelihood=${s.likelihood.toFixed(2)}  base=${s.base_confidence.toFixed(2)}  trigger_boost=${s.trigger_boost.toFixed(2)}`
    );
  }

  section("Agent contexts");
  const intents = [
    {
      label: "recruiting-outreach",
      intent: "draft a personalised cold-outreach message for a founding-engineer role at a series-A AI infra startup",
      include_predictions: true
    },
    {
      label: "career-coaching",
      intent: "help the user pick the next 12-month career move that maximises learning rate and equity upside",
      include_predictions: true
    },
    {
      label: "team-fit-check",
      intent: "judge whether this person will thrive on a 4-person platform team with async-first workflow and rigorous PR review",
      include_predictions: false
    }
  ];
  const agentContexts = intents.map(({ label, intent, include_predictions }) => {
    const ctx = buildAgentContext(profileSnapshot, {
      intent,
      domains: [brief.id, "core"],
      max_items: 6,
      min_confidence: 0.55,
      include_predictions
    });
    console.log(`\n  ${BOLD}${label}${RESET}  ${DIM}— ${intent}${RESET}`);
    for (const [category, entries] of Object.entries(ctx.personal_data)) {
      if (!entries.length) continue;
      console.log(`    ${DIM}${category}${RESET}`);
      for (const entry of entries.slice(0, 3)) {
        const color =
          entry.source === "observed"
            ? OBSERVED
            : entry.source === "simulation"
              ? SIMULATED
              : INFERRED;
        const valueText =
          typeof entry.value === "string" && entry.value.length > 56
            ? entry.value.slice(0, 53) + "…"
            : entry.value;
        console.log(
          `      ${color}${entry.key.padEnd(30)}${RESET} ${String(valueText).padEnd(30)} ${DIM}rel=${entry.relevance.toFixed(2)}${RESET}`
        );
      }
    }
    return { label, intent, ...ctx };
  });

  section("Simulations");
  const scenarios = [
    {
      scenario_label: "cold-outreach: founding engineer, series-A AI infra",
      context: {
        scenario: "cold_recruiting_outreach",
        role: "Founding engineer — Rust systems",
        stage: "series_A",
        process: "two-hour pairing on the real product",
        mentor: "ex-staff from a well-known infra company"
      }
    },
    {
      scenario_label: "big-co offer: FAANG new-grad infra",
      context: {
        scenario: "big_company_offer",
        role: "Software engineer II — platform",
        stage: "public_company",
        process: "multi-round behavioural + leetcode",
        comp: "top-of-band base, modest equity, 3-day hybrid"
      }
    },
    {
      scenario_label: "solo indie-launch: open-source tool + paid tier",
      context: {
        scenario: "indie_launch",
        commitment: "two-month runway of savings",
        audience: "hacker-news / twitter dev community",
        product: "a new systems-observability CLI"
      }
    }
  ];
  const simulationResults = [];
  for (const s of scenarios) {
    const result = await simulateStoredProfile(
      {
        profile_id: profileSnapshot.profile_id,
        context: s.context,
        domains: [brief.id, "core"],
        options: {
          include_reasoning: true,
          include_evidence: true,
          explanation_level: "standard",
          scenario_label: s.scenario_label
        }
      },
      storeOptions
    );
    console.log(`\n  ${SIMULATED}${s.scenario_label}${RESET}`);
    console.log(`    ${BOLD}${result.prediction}${RESET}`);
    console.log(
      `    ${DIM}confidence=${result.confidence.toFixed(2)} · mode=${result.provider?.mode ?? "rules"}${RESET}`
    );
    if (result.reasoning?.length) {
      for (const r of result.reasoning.slice(0, 3)) {
        console.log(`      - ${r}`);
      }
    }
    simulationResults.push({ scenario_label: s.scenario_label, ...result });
  }

  section("Graph explanation");
  for (const sim of simulationResults) {
    const explanation = explainPrediction(profileSnapshot, sim.prediction);
    if (explanation.paths.length === 0) {
      console.log(`  ${DIM}no structural path for "${sim.prediction.slice(0, 60)}"…${RESET}`);
    } else {
      console.log(`  ${sim.scenario_label}`);
      for (const support of explanation.support.slice(0, 3)) {
        console.log(`    ${support}`);
      }
    }
  }

  section("Write artifacts");
  const profileJson = exportProfile(profileSnapshot, { redaction_level: "full" });
  writeFileSync(path.join(outDir, "profile.json"), profileJson);
  kv("profile.json", path.join(outDir, "profile.json"));

  writeFileSync(path.join(outDir, "graph.cypher"), exportCypher(profileSnapshot));
  kv("graph.cypher", path.join(outDir, "graph.cypher"));

  const html = exportGraphHtml(profileSnapshot, agentContexts, simulationResults);
  writeFileSync(path.join(outDir, "graph.html"), html);
  kv("graph.html", path.join(outDir, "graph.html"));

  writeFileSync(
    path.join(outDir, "transcript.json"),
    JSON.stringify({ persona, brief, transcript }, null, 2)
  );
  kv("transcript.json", path.join(outDir, "transcript.json"));

  section("Audit summary");
  const revisionAudit = await readRevisionAuditRecords({
    ...storeOptions,
    profile_id: profileSnapshot.profile_id
  });
  kv("revision audit entries", revisionAudit.length);

  const providerCalls = await readProviderCallAuditRecords(storeOptions);
  kv("provider calls (pson)", providerCalls.length);
  const bySchema = providerCalls.reduce((acc, call) => {
    acc[call.schema_name] = (acc[call.schema_name] ?? 0) + 1;
    return acc;
  }, {});
  for (const [schema, n] of Object.entries(bySchema)) {
    console.log(`  ${DIM}${schema.padEnd(30)}${RESET}${n}`);
  }
  const totalPromptTokens = providerCalls.reduce(
    (s, c) => s + (c.estimated_prompt_tokens ?? 0),
    0
  );
  const totalResponseTokens = providerCalls.reduce(
    (s, c) => s + (c.estimated_response_tokens ?? 0),
    0
  );
  kv("est prompt tokens", totalPromptTokens);
  kv("est response tokens", totalResponseTokens);

  console.log(
    `\n${BOLD}Done.${RESET} ${DIM}Open ${path.join(outDir, "graph.html")} in a browser to explore the graph visually.${RESET}`
  );
  console.log(
    `${DIM}Temp store kept at ${storeRoot} for post-run inspection.${RESET}\n`
  );
}

main().catch((error) => {
  console.error("\nDemo failed:", error);
  process.exitCode = 1;
});
