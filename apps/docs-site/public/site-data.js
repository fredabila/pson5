const REPO_DOCS = "https://github.com/fredabila/pson5/blob/main/docs";

function githubLink(relativePath, label = "Read the full reference on GitHub →") {
  return `<p><a href="${REPO_DOCS}/${relativePath}" target="_blank" rel="noreferrer">${label}</a></p>`;
}

export const site = {
  sections: [
    // ======================================================================
    // INTRODUCTION
    // ======================================================================
    {
      title: "Introduction",
      pages: [
        {
          slug: "introduction/overview",
          title: "Overview",
          summary: "What PSON5 is, what it ships, and how to think about the stack.",
          content: `
            <div class="callout">
              <strong>PSON5</strong> is an open standard and infrastructure for cognitive user profiles. It keeps
              <em>what the user said</em>, <em>what the model inferred</em>, and <em>what the simulator predicts</em>
              as three separate things — so agents can plan, explain, and fail gracefully on top of them.
            </div>
            <h2 id="what-you-get">What you get</h2>
            <div class="cards">
              <div class="card"><strong>.pson 5.0 standard</strong><p>Portable profile format with observed, inferred, simulated, state, graph, and privacy layers.</p></div>
              <div class="card"><strong>Six engines</strong><p>Acquisition, modeling, state, graph, simulation, and projection — composable behind one contract.</p></div>
              <div class="card"><strong>Four transports</strong><p>SDK, HTTP API, CLI, and MCP (HTTP + stdio) — same executor under every one.</p></div>
              <div class="card"><strong>Agent-safe by default</strong><p>Consent gates, redaction notes, confidence decay, and tenant binding baked into the read path.</p></div>
            </div>
            <h2 id="system-shape">System shape</h2>
            <pre><code>User → Acquisition → Modeling → State → Graph → Simulation → Projection → Agent</code></pre>
            <h2 id="current-status">Current status</h2>
            <p>The repo includes: the full engine pipeline, Neo4j sync, Claude agent tool contracts, an MCP transport, JWT / JWKS-based auth with tenant binding, per-request audit with redaction-aware profile reads, time-decay and trigger-boost on the state engine, graph traversal and path-based explanations, and an integration test suite covering init → learn → simulate → export.</p>
          `
        },
        {
          slug: "introduction/why-pson5",
          title: "Why PSON5",
          summary: "Why this project exists and what problem it solves better than ad hoc memory blobs.",
          content: `
            <h2 id="problem">The problem</h2>
            <p>Most agent systems treat user memory as loosely structured notes. That is difficult to validate, hard to redact, awkward to simulate from, and dangerous to expose to other agents.</p>
            <h2 id="pson-answer">The PSON5 answer</h2>
            <ul>
              <li>A canonical profile shape instead of free-form app-specific blobs</li>
              <li>Structured acquisition and normalization instead of only raw chat history</li>
              <li>Probabilistic simulation with explicit confidence — not preference as fact</li>
              <li>Agent-safe projection with typed redaction reasons, not a full profile dump</li>
              <li>Confidence that decays over time, triggered by observed signals at query time</li>
            </ul>
            <h2 id="design-principles">Design principles</h2>
            <ul>
              <li><strong>Probabilistic over absolute.</strong> Every derived claim carries confidence.</li>
              <li><strong>Consent-first data collection.</strong> Scopes gate acquisition; restricted fields follow the profile out the door.</li>
              <li><strong>Explainability as a deliverable.</strong> Predictions carry reasoning traces. Redactions carry reason codes.</li>
              <li><strong>Portability of the profile.</strong> <code>.pson</code> is exportable, validatable, and agnostic to your runtime.</li>
              <li><strong>Confidence that decays.</strong> Yesterday's inference is weaker than today's. Evidence ages.</li>
            </ul>
          `
        }
      ]
    },

    // ======================================================================
    // GETTING STARTED
    // ======================================================================
    {
      title: "Getting Started",
      pages: [
        {
          slug: "getting-started/quickstart",
          title: "Quickstart",
          summary: "Get a real PSON5 profile running end-to-end in five minutes.",
          content: `
            <div class="callout">
              Three paths — local SDK, HTTP API, or CLI. Pick whichever matches your runtime.
              PSON5 works fully without a model; every engine has a rule-based fallback.
            </div>
            <h2 id="4-line">The 4-line starter</h2>
            <pre><code>import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();
const profile = await pson.createAndSaveProfile({ user_id: "user_123" });
console.log(profile.profile_id, profile.metadata.revision); // pson_... 1</code></pre>
            <h2 id="provider">Add a provider (optional)</h2>
            <pre><code># Claude
export PSON_AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export PSON_AI_MODEL=claude-haiku-4-5-20251001

# Any OpenAI-compatible endpoint (Ollama / vLLM / Groq / …)
export PSON_AI_PROVIDER=openai-compatible
export PSON_AI_BASE_URL=http://localhost:11434/v1
export PSON_AI_MODEL=llama3.1</code></pre>
            ${githubLink("usage/quickstart.md")}
          `
        },
        {
          slug: "getting-started/install",
          title: "Install",
          summary: "Workspace install, development commands, and what to run first.",
          content: `
            <h2 id="requirements">Requirements</h2>
            <ul>
              <li>Node.js 20 or newer</li>
              <li>npm workspaces</li>
            </ul>
            <h2 id="install">Install the workspace</h2>
            <pre><code>npm install
npm run check
npm run build</code></pre>
            <h2 id="useful-dev-commands">Useful commands</h2>
            <pre><code>npm run dev:api
npm run dev:cli
npm run dev:docs
npm run test:storage
npm run test:core-flow
npm run test:provider-retry
npm run test:cli-json
npm run ci</code></pre>
            <h2 id="publishable">Publishable packages</h2>
            <p><code>@pson5/core-types</code>, <code>schemas</code>, <code>privacy</code>, <code>serialization-engine</code>, <code>provider-engine</code>, <code>modeling-engine</code>, <code>state-engine</code>, <code>graph-engine</code>, <code>neo4j-store</code>, <code>simulation-engine</code>, <code>acquisition-engine</code>, <code>agent-context</code>, <code>sdk</code>, <code>postgres-store</code>, <code>cli</code>.</p>
          `
        },
        {
          slug: "getting-started/first-profile",
          title: "Create your first profile",
          summary: "Minimal SDK flow from init to learning to simulation.",
          content: `
            <h2 id="sdk-flow">Minimal SDK flow</h2>
            <pre><code>import { PsonClient } from "@pson5/sdk";

const client = new PsonClient();

const profile = await client.createAndSaveProfile({
  user_id: "user_123",
  domains: ["core", "education"],
  depth: "standard"
});

const next = await client.getNextQuestions(profile.profile_id, { limit: 1 });

await client.learn({
  profile_id: profile.profile_id,
  session_id: next.session.session_id,
  answers: [
    { question_id: next.questions[0].id, value: "plan_first" }
  ]
});

const context = await client.getAgentContext(profile.profile_id, {
  intent: "help the user plan a deadline-sensitive task",
  include_predictions: true
});</code></pre>
            <h2 id="cli-flow">Or via the CLI</h2>
            <pre><code>pson init user_123 --store .pson5-store --json
pson question-next &lt;profile_id&gt; --limit 1 --json
pson learn &lt;profile_id&gt; &lt;question_id&gt; &lt;value&gt; --json
pson agent-context &lt;profile_id&gt; --intent "study plan" --json</code></pre>
          `
        }
      ]
    },

    // ======================================================================
    // CONCEPTS
    // ======================================================================
    {
      title: "Concepts",
      pages: [
        {
          slug: "concepts/profile-model",
          title: ".pson profile model",
          summary: "The canonical file shape: observed, inferred, simulated, cognitive, behavioral, state, graph, privacy, metadata.",
          content: `
            <h2 id="top-level-shape">Top-level shape</h2>
            <pre><code>{
  "pson_version": "5.0",
  "profile_id": "pson_1776913414584",
  "user_id": "user_123",
  "tenant_id": "tenant_acme",
  "consent":   { "granted": true, "scopes": ["ai:use"], ... },
  "domains":   { "active": ["core"], "depth": "light" },
  "layers":    { "observed": {}, "inferred": {}, "simulated": {} },
  "cognitive_model":   { "thinking_style": {}, "learning_style": {}, "processing_patterns": {} },
  "behavioral_model":  { "decision_functions": [], "action_patterns": [], "motivation_model": {} },
  "state_model":       { "states": [], "transitions": [] },
  "knowledge_graph":   { "nodes": [], "edges": [] },
  "simulation_profiles": { "scenarios": [], "domains": {} },
  "privacy":  { "encryption": false, "access_levels": {}, "local_only": false, "restricted_fields": [] },
  "metadata": { "confidence": 0, "created_at": "...", "updated_at": "...", "source_count": 0, "revision": 1 }
}</code></pre>
            <h2 id="three-layers">The three layers</h2>
            <div class="pill-row">
              <span class="pill pill--observed">Observed</span>
              <span class="pill pill--inferred">Inferred</span>
              <span class="pill pill--simulated">Simulated</span>
            </div>
            <p>Every piece of data in the profile belongs to exactly one layer. The modeling engine never overwrites observed; the simulation engine never overwrites inferred; the agent-context projection surfaces each with a distinct <code>source</code> field.</p>
            ${githubLink("schemas/pson-schema.md", "Full .pson schema reference on GitHub →")}
          `
        },
        {
          slug: "concepts/agent-context",
          title: "Agent context",
          summary: "Why agents consume the projection layer instead of the raw profile.",
          content: `
            <h2 id="default-rule">Default rule</h2>
            <p>Agents should consume <code>getAgentContext(...)</code> not the raw profile. The projection is relevance-ranked, consent-gated, confidence-filtered, and carries explicit redaction notes.</p>
            <h2 id="shape">Shape</h2>
            <pre><code>{
  profile_id, pson_version, context_version: "1.0",
  intent, generated_at,
  personal_data: {
    preferences: [], communication_style: [],
    behavioral_patterns: [], learning_profile: [],
    current_state: [], predictions: []
  },
  constraints: { restricted_fields, local_only, allowed_for_agent },
  reasoning_policy: { treat_as_fact, treat_as_inference, treat_as_prediction },
  redaction_notes: [
    { path, reason: "restricted_field" | "low_confidence" | "consent_not_granted", detail? }
  ]
}</code></pre>
            <h2 id="withheld">Consent withheld</h2>
            <p>When <code>profile.consent.granted === false</code> the entire <code>personal_data</code> payload is empty and a single <code>consent_not_granted</code> redaction note is returned.</p>
            ${githubLink("usage/agent-context.md")}
          `
        },
        {
          slug: "concepts/layering-invariant",
          title: "The layering invariant",
          summary: "Observed vs inferred vs simulated — the single rule that protects explainability.",
          content: `
            <blockquote>Agents building PSON5 must preserve this distinction throughout the codebase: what the user said, what the system inferred, what the simulator predicts. Collapsing those three layers into one data model will damage trust, explainability, and safety.</blockquote>
            <h2 id="why">Why this matters</h2>
            <ul>
              <li>LLMs can then treat each layer with the weight it deserves.</li>
              <li>Predictions get clearly labelled caveats and reasoning traces.</li>
              <li>Corrections from the user don't overwrite simulated state or vice versa.</li>
              <li>Privacy restrictions scope cleanly to one layer.</li>
            </ul>
            <h2 id="enforcement">How it's enforced</h2>
            <ul>
              <li>Simulation outputs live in <code>layers.simulated</code> and <code>simulation_profiles.scenarios</code>; never promoted.</li>
              <li>Modeling writes to <code>layers.inferred</code>; never overwrites <code>layers.observed</code>.</li>
              <li>Agent context tags every entry with <code>source: "observed" | "inferred" | "simulated"</code>.</li>
              <li>The API returns safe-redacted profiles to non-admin callers so the raw observed layer never leaks.</li>
            </ul>
          `
        }
      ]
    },

    // ======================================================================
    // ENGINES
    // ======================================================================
    {
      title: "Engines",
      pages: [
        {
          slug: "engines/acquisition",
          title: "Acquisition engine",
          summary: "Adaptive question flow, sessions, fatigue, contradictions.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Adaptive question selection with confidence-gap scoring, provider-generated follow-ups, session persistence, and fatigue detection. Every answer triggers the full pipeline (modeling → state → graph → save).</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>getNextQuestions(profileId, input, options)</code></li>
              <li><code>submitLearningAnswers(input, options)</code></li>
              <li><code>getBuiltInQuestionRegistry()</code>, <code>getQuestionRegistry(options)</code></li>
              <li><code>saveDomainModules(modules, options)</code></li>
            </ul>
            <h2 id="session-intel">Session intelligence</h2>
            <p>Each session carries <code>fatigue_score</code>, <code>confidence_gaps</code>, <code>contradiction_flags</code>, and <code>stop_reason</code>. Agents should respect all four; stop when <code>stop_reason</code> is set or <code>confidence_gaps</code> collapses for the active domains.</p>
            ${githubLink("usage/acquisition-engine.md")}
          `
        },
        {
          slug: "engines/modeling",
          title: "Modeling engine",
          summary: "Traits, heuristics, and cross-domain signals with confidence + evidence + decay.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Transforms <code>layers.observed</code> into <code>layers.inferred</code>. Rule-based pass first, optional provider-backed augmentation second. Every derived claim carries a confidence record.</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>deriveInferredProfile(profile)</code></li>
              <li><code>deriveInferredProfileWithProvider(profile, options)</code></li>
              <li><code>getModeledFieldPaths(profile)</code></li>
            </ul>
            <h2 id="heuristics">Built-in heuristics</h2>
            <ul>
              <li><code>deadline_driven_activation</code></li>
              <li><code>structured_workflow_preference</code></li>
              <li><code>last_minute_study_pattern</code></li>
            </ul>
            <p>AI-generated candidates are filtered through <code>@pson5/privacy.filterSensitiveProviderCandidates</code> before landing in <code>layers.inferred.ai_model</code>.</p>
            ${githubLink("usage/modeling-engine.md")}
          `
        },
        {
          slug: "engines/state",
          title: "State engine",
          summary: "Time-decay on confidence, trigger evaluation against observed facts at query time.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Derives transient user states and answers "what is the user's state <em>now</em>?" with live decay and trigger-context boosts. Not what the profile knew at write time.</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>deriveStateProfile(profile)</code></li>
              <li><code>getActiveStateSnapshot(profile, options?)</code></li>
              <li><code>applyConfidenceDecay(confidence, now?)</code></li>
              <li><code>getProfileTriggerContext(profile)</code></li>
            </ul>
            <h2 id="snapshot">Snapshot shape</h2>
            <pre><code>{
  profile_id, generated_at, decay_applied,
  evaluated_triggers: ["deadline_pressure", "clear_structure", ...],
  active_states: [
    {
      state_id: "stressed",
      likelihood: 0.82,
      base_confidence: 0.72,
      decayed_confidence: 0.69,
      trigger_boost: 0.13,
      matched_triggers: ["deadline_pressure"]
    }, ...
  ]
}</code></pre>
            ${githubLink("usage/state-engine.md")}
          `
        },
        {
          slug: "engines/graph",
          title: "Graph engine",
          summary: "Knowledge graph construction, k-hop traversal, path-based explanations.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Builds the in-profile knowledge graph from traits, heuristics, and states. Exposes traversal primitives used by simulation and any caller that wants to explain <em>why</em> a prediction holds.</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>deriveKnowledgeGraph(profile)</code></li>
              <li><code>getNodeNeighborhood(profile, nodeId, options)</code></li>
              <li><code>explainPrediction(profile, prediction, options?)</code></li>
              <li><code>explainPredictionSupport(profile, prediction)</code> (legacy string shim)</li>
            </ul>
            <h2 id="traversal">k-hop traversal</h2>
            <pre><code>const n = getNodeNeighborhood(profile, "heuristic:deadline_driven_activation", {
  depth: 2,
  direction: "both",
  edge_types: ["reinforces", "correlates_with"]
});
// { center, nodes, edges }</code></pre>
            ${githubLink("usage/graph-engine.md")}
          `
        },
        {
          slug: "engines/simulation",
          title: "Simulation engine",
          summary: "Scenario-specific predictions with reasoning, caveats, alternatives. Never promoted to fact.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Predicts likely user behaviour under a scenario context. Returns a structured response with <code>prediction</code>, <code>confidence</code>, <code>reasoning</code>, <code>evidence</code>, <code>caveats</code>, <code>alternatives</code>. Cacheable by <code>context_hash</code> + <code>profile_revision</code>.</p>
            <h2 id="request">Request shape</h2>
            <pre><code>{
  profile_id: "pson_123",
  context: { task: "study for exam", deadline_days: 2, difficulty: "high" },
  domains: ["core", "education"],
  options: { include_reasoning: true, include_evidence: true, explanation_level: "standard" }
}</code></pre>
            <h2 id="invariant">Hard invariant</h2>
            <p>Simulation outputs are never written back as observed facts. They live inside <code>simulation_profiles.scenarios</code> as candidates; the agent is expected to treat them as probabilistic support, not truth.</p>
            ${githubLink("simulation/simulation-contract.md")}
          `
        },
        {
          slug: "engines/agent-context",
          title: "Agent-context engine",
          summary: "The agent-facing projection with consent gating, redaction notes, and relevance ranking.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Filters, ranks, and redacts the profile into an agent-safe projection. The primary read path for every agent workflow.</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>buildAgentContext(profile, options)</code></li>
              <li><code>buildStoredAgentContext(profileId, options, storeOptions)</code></li>
            </ul>
            <h2 id="notes">Redaction notes</h2>
            <ul>
              <li><code>restricted_field</code> — field or its domain path is in <code>privacy.restricted_fields</code></li>
              <li><code>low_confidence</code> — entry fell below <code>min_confidence</code></li>
              <li><code>consent_not_granted</code> — returned for every request when <code>consent.granted === false</code></li>
            </ul>
            ${githubLink("usage/agent-context.md")}
          `
        },
        {
          slug: "engines/privacy",
          title: "Privacy",
          summary: "Consent evaluation, provider policy, export redaction, sensitive-candidate filtering.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>The single source of truth for "is this allowed to leave the profile?". Every other engine calls it before handing data out.</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>evaluateScopes(profile, scopes)</code></li>
              <li><code>getProviderPolicyDecision(profile, operation)</code></li>
              <li><code>sanitizeProfileForProvider(profile)</code></li>
              <li><code>redactProfileForExport(profile, level)</code></li>
              <li><code>isSensitiveProviderCandidate(text)</code>, <code>filterSensitiveProviderCandidates(...)</code></li>
            </ul>
            <h2 id="reasons">Policy denial reasons</h2>
            <ul>
              <li>"User consent is not granted."</li>
              <li>"Profile is marked local_only, so remote AI providers are disabled."</li>
              <li>"Required AI consent scopes are missing."</li>
            </ul>
            ${githubLink("usage/privacy.md")}
          `
        },
        {
          slug: "engines/provider-adapters",
          title: "Provider adapters",
          summary: "Plug any model into PSON5 via one interface. OpenAI / Anthropic / OpenAI-compatible built in.",
          content: `
            <h2 id="built-in">Built-in adapters</h2>
            <ul>
              <li><code>openai</code> — OpenAI responses API with JSON-schema structured outputs.</li>
              <li><code>anthropic</code> — Anthropic messages API with schema embedded in the prompt.</li>
              <li><code>openai-compatible</code> — any <code>/chat/completions</code> endpoint (Ollama, vLLM, LiteLLM, OpenRouter, Groq, Together, Fireworks, Azure OpenAI, …) via <code>base_url</code>.</li>
            </ul>
            <h2 id="register">Register your own</h2>
            <pre><code>import { registerProviderAdapter } from "@pson5/provider-engine";

registerProviderAdapter({
  name: "my-provider",
  default_base_url: "https://api.my-provider.com/v1",
  default_model: "my-model-v1",
  async callJson({ config, format, instructions, payload, signal }) {
    const response = await fetch(\`\${config.base_url}/generate\`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: \`Bearer \${config.api_key}\` },
      body: JSON.stringify({ model: config.model, prompt: instructions, payload }),
      signal
    });
    const bodyText = await response.text();
    return {
      parsed: JSON.parse(bodyText),
      endpoint: response.url,
      attempt: { response, body_text: bodyText, attempts: 1, final_status_code: response.status, final_error: null, duration_ms: 0 }
    };
  }
});</code></pre>
            <h2 id="select">Select it</h2>
            <pre><code>export PSON_AI_PROVIDER=my-provider
export PSON_AI_API_KEY=...
export PSON_AI_MODEL=my-model-v1</code></pre>
            ${githubLink("usage/provider-adapters.md")}
          `
        },
        {
          slug: "engines/provider",
          title: "Provider engine",
          summary: "OpenAI + Anthropic. Per-call audit, token estimation, retry-with-backoff on 429 / 5xx.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>The only part of PSON5 that talks to external LLMs. Always falls back to rules when unconfigured or policy-denied.</p>
            <h2 id="config">Configuration</h2>
            <p>Env vars win over stored config. Set <code>PSON_AI_PROVIDER</code>, <code>PSON_AI_API_KEY</code>, <code>PSON_AI_MODEL</code>, and optionally <code>PSON_AI_BASE_URL</code>, <code>PSON_AI_TIMEOUT_MS</code>, <code>PSON_AI_ENABLED</code>.</p>
            <h2 id="retry">Retry semantics</h2>
            <p>Retries on <code>429</code>, <code>408</code>, and <code>5xx</code> (except <code>501</code>). Backoff <code>500ms → 1s → 2s</code>, capped at <code>8s</code>. Honours <code>Retry-After</code> (seconds or HTTP-date) up to a 15-second clamp. Max 3 attempts.</p>
            <h2 id="audit">Audit</h2>
            <p>Every attempt writes to <code>&lt;store&gt;/audit/provider-call.jsonl</code> with <code>attempts</code>, <code>final_status_code</code>, <code>estimated_prompt_tokens</code>, <code>estimated_response_tokens</code>, <code>duration_ms</code>.</p>
            ${githubLink("usage/provider-engine.md")}
          `
        }
      ]
    },

    // ======================================================================
    // STORAGE
    // ======================================================================
    {
      title: "Storage",
      pages: [
        {
          slug: "storage/serialization",
          title: "Serialization engine",
          summary: "Create / load / save pipeline, revision audit, import / export with redaction.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>The storage and lifecycle core. All writes go through <code>saveProfile(...)</code>, which validates via <code>@pson5/schemas</code> and appends to <code>&lt;store&gt;/audit/revisions.jsonl</code>.</p>
            <h2 id="exports">Key exports</h2>
            <ul>
              <li><code>initProfile</code>, <code>loadProfile</code>, <code>saveProfile</code>, <code>profileExists</code></li>
              <li><code>loadProfileByUserId</code>, <code>findProfilesByUserId</code>, <code>listProfileRevisions</code></li>
              <li><code>exportProfile</code>, <code>exportStoredProfile</code>, <code>importProfileDocument</code>, <code>validateProfile</code></li>
              <li><code>readRevisionAuditRecords(options)</code></li>
            </ul>
            <h2 id="adapters">Storage adapters</h2>
            <ul>
              <li><strong>File</strong> — default, local dev.</li>
              <li><strong>Memory</strong> — <code>createMemoryProfileStoreAdapter()</code>, tests.</li>
              <li><strong>Document</strong> — <code>createDocumentProfileStoreAdapter(repo)</code>, any custom backend.</li>
              <li><strong>Postgres</strong> — <code>@pson5/postgres-store</code>, production.</li>
            </ul>
            ${githubLink("usage/serialization-engine.md")}
          `
        },
        {
          slug: "storage/postgres",
          title: "Postgres store",
          summary: "Postgres-backed ProfileStoreAdapter for multi-node deployments.",
          content: `
            <h2 id="usage">Usage</h2>
            <pre><code>import {
  createDocumentProfileStoreAdapter,
  initProfile
} from "@pson5/serialization-engine";
import { createPostgresProfileStoreRepository } from "@pson5/postgres-store";

const repository = await createPostgresProfileStoreRepository({
  connectionString: process.env.DATABASE_URL,
  schema: "pson5"
});
const adapter = createDocumentProfileStoreAdapter(repository);

const profile = await initProfile({ user_id: "user_123" }, { adapter });</code></pre>
            <h2 id="schema">Schema</h2>
            <p>Three tables: <code>profile_current</code>, <code>profile_revisions</code>, <code>user_profile_index</code>. Auto-bootstrapped on first use.</p>
            ${githubLink("usage/postgres-store.md")}
          `
        },
        {
          slug: "storage/neo4j",
          title: "Neo4j store",
          summary: "Optional Neo4j persistence for the knowledge graph.",
          content: `
            <h2 id="purpose">Purpose</h2>
            <p>Sync a profile's knowledge graph to Neo4j for cross-profile queries. One-way: the <code>.pson</code> profile is always the source of truth.</p>
            <h2 id="usage">Usage</h2>
            <pre><code>import {
  saveNeo4jConfig,
  getNeo4jStatus,
  syncStoredProfileKnowledgeGraph
} from "@pson5/neo4j-store";

await saveNeo4jConfig({ uri, username, password, database: null, enabled: true });
const status = await getNeo4jStatus();
const result = await syncStoredProfileKnowledgeGraph("pson_123");
// { profile_id, user_id, node_count, edge_count, synced_at, ... }</code></pre>
            <h2 id="cypher">Cypher schema</h2>
            <p>Every node and relationship is tagged with <code>profile_id</code>. Sync is idempotent — previous profile-scoped nodes are <code>DETACH DELETE</code>'d and rewritten on each run.</p>
            ${githubLink("usage/neo4j-store.md")}
          `
        },
        {
          slug: "storage/schemas",
          title: "Schemas",
          summary: "The Zod validator for .pson documents. Used on every import and on /v1/pson/validate.",
          content: `
            <h2 id="exports">Exports</h2>
            <ul>
              <li><code>validatePsonProfile(document)</code> → <code>ValidationResult&lt;PsonProfile&gt;</code></li>
              <li><code>pson5Schema</code> — the raw Zod schema, extendable</li>
            </ul>
            <h2 id="usage">Usage</h2>
            <pre><code>import { validatePsonProfile } from "@pson5/schemas";

const result = validatePsonProfile(untrustedJson);
if (!result.success) {
  for (const issue of result.issues) console.error(issue.path + ": " + issue.message);
}</code></pre>
            ${githubLink("usage/schemas.md")}
          `
        }
      ]
    },

    // ======================================================================
    // SDK
    // ======================================================================
    {
      title: "SDK",
      pages: [
        {
          slug: "sdk/overview",
          title: "SDK overview",
          summary: "The primary TypeScript entry point: PsonClient.",
          content: `
            <h2 id="entry-point">Entry point</h2>
            <pre><code>import { PsonClient } from "@pson5/sdk";
const client = new PsonClient();</code></pre>
            <h2 id="operations">Main operations</h2>
            <ul>
              <li><strong>Profile</strong> — <code>createAndSaveProfile</code>, <code>loadProfile</code>, <code>loadProfileByUserId</code>, <code>findProfilesByUserId</code>, <code>import</code>, <code>export</code>, <code>exportById</code>, <code>validate</code>, <code>getPreference</code>.</li>
              <li><strong>Learning</strong> — <code>getNextQuestions</code>, <code>learn</code>.</li>
              <li><strong>Modeling / Simulation</strong> — <code>simulate</code>, <code>getGraphSupport</code>, <code>getStateSnapshot</code>.</li>
              <li><strong>Agent context</strong> — <code>buildAgentContext</code>, <code>getAgentContext</code>.</li>
              <li><strong>Provider</strong> — <code>getProviderStatus</code>, <code>configureProvider</code>, <code>getProviderPolicy</code>, <code>clearProviderConfig</code>.</li>
              <li><strong>Neo4j</strong> — <code>getNeo4jConfig</code>, <code>getNeo4jStatus</code>, <code>saveNeo4jConfig</code>, <code>clearNeo4jConfig</code>, <code>syncProfileGraph</code>.</li>
              <li><strong>Domain modules</strong> — <code>getQuestionRegistry</code>, <code>listDomainModules</code>, <code>saveDomainModules</code>.</li>
            </ul>
            ${githubLink("usage/sdk-usage.md")}
          `
        },
        {
          slug: "sdk/agent-integration",
          title: "Agent integration",
          summary: "Recommended pattern for agents calling PSON5 as a tool layer.",
          content: `
            <h2 id="pattern">Recommended pattern</h2>
            <ol>
              <li>Resolve the profile by app user id (<code>loadProfileByUserId</code>)</li>
              <li>Build agent context (<code>getAgentContext</code>)</li>
              <li>Respond, or ask a next question (<code>getNextQuestions</code>)</li>
              <li>Write the answer back (<code>learn</code>)</li>
              <li>Recompute context before the next turn</li>
              <li>Simulate when behaviour-sensitive planning matters (<code>simulate</code>)</li>
            </ol>
            <pre><code>const profile = await client.loadProfileByUserId("app_user_42");
const context = await client.getAgentContext(profile.profile_id, { intent: "tutoring" });
const next = await client.getNextQuestions(profile.profile_id, { limit: 1 });</code></pre>
            ${githubLink("usage/agent-integration.md")}
          `
        },
        {
          slug: "sdk/agent-tools",
          title: "Agent tool contract",
          summary: "Seven typed tools + executor. Shared by the SDK, API, MCP, and stdio transports.",
          content: `
            <h2 id="tools">Tools</h2>
            <ul>
              <li><code>pson_load_profile_by_user_id</code></li>
              <li><code>pson_create_profile</code></li>
              <li><code>pson_get_agent_context</code></li>
              <li><code>pson_get_next_questions</code></li>
              <li><code>pson_learn</code></li>
              <li><code>pson_simulate</code></li>
              <li><code>pson_get_provider_policy</code></li>
            </ul>
            <h2 id="executor">Usage</h2>
            <pre><code>import { PsonClient, createPsonAgentToolExecutor, getPsonAgentToolDefinitions } from "@pson5/sdk";

const client = new PsonClient();
const definitions = getPsonAgentToolDefinitions();
const executor = createPsonAgentToolExecutor(client, { rootDir: ".pson5-store" });

const result = await executor.execute({
  name: "pson_get_next_questions",
  arguments: { profile_id: "pson_123", limit: 1 }
});</code></pre>
            ${githubLink("usage/agent-tools.md")}
          `
        },
        {
          slug: "sdk/agent-skill",
          title: "Claude agent skill",
          summary: "Drop-in skill file that encodes the PSON safe-use contract.",
          content: `
            <h2 id="file">File</h2>
            <p><code>skills/pson-agent/SKILL.md</code>. Any Claude-style agent can load it to inherit PSON's safe-use contract.</p>
            <h2 id="rules">Contract highlights</h2>
            <ul>
              <li>Use <code>pson_get_agent_context</code> by default, not the raw profile.</li>
              <li>Ask <code>pson_get_next_questions</code> only when uncertainty matters.</li>
              <li>Write with <code>pson_learn</code>; never mutate profile JSON directly.</li>
              <li>Treat <code>pson_simulate</code> output as probabilistic support.</li>
              <li>Respect <code>stop_reason</code>, <code>fatigue_score</code>, <code>confidence_gaps</code>, <code>contradiction_flags</code>.</li>
            </ul>
            ${githubLink("usage/pson-agent-skill.md")}
          `
        }
      ]
    },

    // ======================================================================
    // API
    // ======================================================================
    {
      title: "API",
      pages: [
        {
          slug: "api/overview",
          title: "API overview",
          summary: "HTTP surface, base URL, response envelope, error codes.",
          content: `
            <h2 id="base">Base URL</h2>
            <p><code>/v1</code>. JSON in, JSON out. Every response carries <code>x-pson-request-id: req_&lt;uuid&gt;</code>.</p>
            <h2 id="env">Envelope</h2>
            <pre><code>// success
{ "data": { ... } }

// error
{ "error": { "code": "validation_error", "message": "..." } }</code></pre>
            <h2 id="codes">Error codes</h2>
            <p><code>bad_request</code>, <code>validation_error</code>, <code>unauthorized</code>, <code>forbidden</code>, <code>tenant_mismatch</code>, <code>profile_not_found</code>, <code>conflict</code>, <code>tool_unsupported</code>.</p>
            ${githubLink("api/api-contract.md", "Full API contract on GitHub →")}
          `
        },
        {
          slug: "api/auth",
          title: "Auth, JWT, and tenancy",
          summary: "API keys, JWT / JWKS identity, tenant binding, subject-user binding, redaction.",
          content: `
            <h2 id="layers">Auth layers</h2>
            <ul>
              <li><strong>API key</strong> — <code>x-api-key</code> header when <code>PSON_API_KEY</code> is set.</li>
              <li><strong>Signed identity</strong> — Bearer JWT verified against HS256 secret, PEM public key, or JWKS (inline / file / remote with caching).</li>
              <li><strong>Headers</strong> — fallback tenant / caller / user / role / scopes headers for deployments behind a trusted proxy.</li>
            </ul>
            <h2 id="scopes">Role and scopes</h2>
            <p>Every route declares a required <code>role</code> and <code>scopes</code>. Roles: <code>anonymous &lt; viewer &lt; editor &lt; admin</code>.</p>
            <h2 id="redaction">Profile redaction</h2>
            <p>Profile reads return a <code>safe</code>-redacted variant unless the caller is <code>admin</code> or holds <code>profiles:admin</code>. Admins can request <code>?redaction_level=full</code>. Non-admins asking for <code>full</code> get <code>forbidden</code>.</p>
            <h2 id="audit">Audit</h2>
            <p>Every request is written to <code>&lt;store&gt;/audit/api-access.jsonl</code> with <code>request_id</code>, decision, duration, and (for reads) <code>redaction_applied</code> / <code>redaction_level</code>.</p>
            ${githubLink("usage/agent-auth.md")}
          `
        },
        {
          slug: "api/transports",
          title: "Agent transports",
          summary: "SDK, HTTP tools, MCP over HTTP, local stdio MCP.",
          content: `
            <table>
              <thead>
                <tr><th>Mode</th><th>Best when</th><th>Auth boundary</th></tr>
              </thead>
              <tbody>
                <tr><td>Direct SDK</td><td>Agent runs in your backend</td><td>Your app handles auth</td></tr>
                <tr><td>HTTP tools</td><td>Remote agent or external service</td><td>API key and/or JWT</td></tr>
                <tr><td>MCP over HTTP</td><td>Framework expects MCP JSON-RPC</td><td>Same as API</td></tr>
                <tr><td>stdio MCP</td><td>Local desktop or dev agent</td><td>Local process trust only</td></tr>
              </tbody>
            </table>
            ${githubLink("usage/agent-tools.md")}
          `
        }
      ]
    },

    // ======================================================================
    // CLI
    // ======================================================================
    {
      title: "CLI",
      pages: [
        {
          slug: "cli/overview",
          title: "CLI overview",
          summary: "The pson command — one-shot commands, Ink console, MCP stdio server.",
          content: `
            <h2 id="install">Install</h2>
            <pre><code>npm install -g @pson5/cli
pson --help</code></pre>
            <h2 id="modes">Modes</h2>
            <ul>
              <li><strong>One-shot</strong> — <code>init</code>, <code>inspect</code>, <code>export</code>, <code>import</code>, <code>learn</code>, <code>simulate</code>, etc. All accept <code>--json</code>.</li>
              <li><strong>Console</strong> — <code>pson console</code> starts the Ink/React interactive dashboard.</li>
              <li><strong>MCP stdio</strong> — <code>pson mcp-stdio</code> exposes every PSON tool as a local MCP server.</li>
            </ul>
            <h2 id="json">Scripting</h2>
            <pre><code>pson init user_123 --store .pson5-store --json
# => {"success":true,"data":{"profile_id":"pson_...","revision":1,...}}</code></pre>
            ${githubLink("usage/cli-reference.md", "Full CLI reference on GitHub →")}
          `
        },
        {
          slug: "cli/console",
          title: "Interactive console",
          summary: "Ink/React console with slash commands, session state, live activity feed.",
          content: `
            <h2 id="start">Start</h2>
            <pre><code>pson console --store .pson5-store --profile pson_123</code></pre>
            <h2 id="commands">Slash commands</h2>
            <p><code>/help</code>, <code>/init</code>, <code>/load</code>, <code>/next</code>, <code>/answer</code>, <code>/simulate</code>, <code>/agent-context</code>, <code>/inspect</code>, <code>/state</code>, <code>/graph</code>, <code>/provider</code>, <code>/neo4j</code>, <code>/neo4j-sync</code>, <code>/export</code>, <code>/clear</code>, <code>/quit</code>.</p>
            <h2 id="legacy">Legacy console</h2>
            <p><code>pson console-legacy</code> keeps the earlier readline-based experience for automation.</p>
            ${githubLink("usage/cli-console.md")}
          `
        }
      ]
    },

    // ======================================================================
    // PRIVACY
    // ======================================================================
    {
      title: "Privacy",
      pages: [
        {
          slug: "privacy/model",
          title: "Privacy model",
          summary: "Consent, restricted fields, provider policy, export redaction.",
          content: `
            <h2 id="pillars">Five pillars</h2>
            <ol>
              <li><strong>Consent is the gate.</strong> <code>profile.consent.granted === false</code> blocks every agent-facing path.</li>
              <li><strong>Scopes narrow consent.</strong> Provider policy requires specific scopes like <code>ai:use</code>, <code>ai:simulation</code>.</li>
              <li><strong>Restricted fields travel.</strong> <code>privacy.restricted_fields</code> is honoured at projection, sanitization, and export time.</li>
              <li><strong>Sensitive inference is filtered.</strong> AI-generated candidates pass through keyword-based filtering before being applied.</li>
              <li><strong>Every decision is auditable.</strong> API + provider audits record redaction reasons, missing scopes, and deny codes.</li>
            </ol>
            <h2 id="levels">Access levels</h2>
            <p>Three buckets: <code>public</code>, <code>private</code>, <code>restricted</code>. Applied per field via <code>privacy.access_levels</code>.</p>
            ${githubLink("privacy/privacy-model.md")}
          `
        }
      ]
    },

    // ======================================================================
    // DEPLOYMENT
    // ======================================================================
    {
      title: "Deployment",
      pages: [
        {
          slug: "deployment/open-source-readiness",
          title: "Open-source readiness",
          summary: "License, governance, CI, issue templates, contribution surface.",
          content: `
            <h2 id="license">License</h2>
            <p>MIT. See <code>LICENSE</code> at the repo root.</p>
            <h2 id="governance">Governance</h2>
            <ul>
              <li><code>CODE_OF_CONDUCT.md</code>, <code>CONTRIBUTING.md</code>, <code>SECURITY.md</code>, <code>SUPPORT.md</code></li>
              <li>GitHub issue templates for bug / feature / question</li>
              <li>Pull request template</li>
            </ul>
            <h2 id="ci">CI</h2>
            <p>GitHub Actions workflow: <code>npm run check</code>, <code>npm run build</code>, storage + core-flow + provider-retry + cli-json integration tests.</p>
          `
        },
        {
          slug: "deployment/publishing",
          title: "Package publishing",
          summary: "How to pack and publish the 15 @pson5/* packages.",
          content: `
            <h2 id="pack">Pack</h2>
            <pre><code>npm run pack:publishable</code></pre>
            <h2 id="publish">Publish</h2>
            <p>Use the manual publish workflow under <code>.github/workflows/</code>. See <code>PUBLISHING.md</code> for the release checklist.</p>
          `
        }
      ]
    },

    // ======================================================================
    // REFERENCE
    // ======================================================================
    {
      title: "Reference",
      pages: [
        {
          slug: "reference/packages",
          title: "Package matrix",
          summary: "Role of each @pson5/* package and when to use it.",
          content: `
            <table>
              <thead><tr><th>Package</th><th>Role</th></tr></thead>
              <tbody>
                <tr><td><code>@pson5/core-types</code></td><td>Shared TypeScript interfaces</td></tr>
                <tr><td><code>@pson5/schemas</code></td><td>Zod validator for .pson documents</td></tr>
                <tr><td><code>@pson5/privacy</code></td><td>Consent, policy, redaction</td></tr>
                <tr><td><code>@pson5/acquisition-engine</code></td><td>Questions, sessions, answer writeback</td></tr>
                <tr><td><code>@pson5/modeling-engine</code></td><td>Traits, heuristics</td></tr>
                <tr><td><code>@pson5/state-engine</code></td><td>Transient states, decay, trigger evaluation</td></tr>
                <tr><td><code>@pson5/graph-engine</code></td><td>Knowledge graph, traversal, explain</td></tr>
                <tr><td><code>@pson5/simulation-engine</code></td><td>Scenario prediction</td></tr>
                <tr><td><code>@pson5/agent-context</code></td><td>Agent-safe projection</td></tr>
                <tr><td><code>@pson5/provider-engine</code></td><td>OpenAI + Anthropic integration</td></tr>
                <tr><td><code>@pson5/serialization-engine</code></td><td>Lifecycle + adapters + audit</td></tr>
                <tr><td><code>@pson5/neo4j-store</code></td><td>Optional Neo4j graph sync</td></tr>
                <tr><td><code>@pson5/postgres-store</code></td><td>Postgres-backed adapter</td></tr>
                <tr><td><code>@pson5/sdk</code></td><td>Client + tool executor</td></tr>
                <tr><td><code>@pson5/cli</code></td><td>Command line + Ink console + MCP stdio</td></tr>
              </tbody>
            </table>
          `
        },
        {
          slug: "reference/architecture",
          title: "System architecture",
          summary: "How the pieces fit end-to-end.",
          content: `
            <h2 id="pipeline">Pipeline</h2>
            <pre><code>User signal
  ├── Acquisition engine       (questions, sessions, writeback)
  ├── Modeling engine          (traits, heuristics)
  ├── State engine             (decay, triggers)
  ├── Graph engine             (nodes + edges, traversal)
  ├── Simulation engine        (predictions with reasoning)
  └── Agent-context            (projection with redaction)

Persistence
  ├── Serialization engine     (file / memory / document / postgres)
  ├── Neo4j store (optional)   (external graph mirror)
  └── Audit jsonl              (access + revisions + provider-call)

Transports
  ├── SDK                       (in-process)
  ├── API                       (HTTP, auth-gated, audited)
  ├── CLI                       (local; --json for scripting)
  └── MCP                       (HTTP JSON-RPC / stdio)</code></pre>
            ${githubLink("architecture/system-architecture.md")}
          `
        }
      ]
    }
  ]
};
