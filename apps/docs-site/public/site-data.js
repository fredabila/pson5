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
    // IMPLEMENTATION GUIDES
    // ======================================================================
    {
      title: "Implementation Guides",
      pages: [
        {
          slug: "implementation/sdk-full-setup",
          title: "Full SDK setup",
          summary: "End-to-end SDK setup for production apps: install, store, profile lifecycle, provider setup, simulation, agent context, and operations.",
          content: `
            <div class="callout">
              Use this page when you are building a real product backend with PSON5. The SDK is the most reliable path when your app owns auth, tenancy, and user identity.
            </div>
            <h2 id="install">Install</h2>
            <pre><code>npm install @pson5/sdk</code></pre>
            <h2 id="minimal-boot">Minimal boot</h2>
            <pre><code>import { PsonClient } from "@pson5/sdk";

const pson = new PsonClient();

const profile = await pson.ensureProfile(
  {
    user_id: "user_123",
    tenant_id: "tenant_acme",
    domains: ["core", "education"],
    depth: "standard"
  },
  { rootDir: ".pson5-store" }
);

console.log(profile.profile_id);</code></pre>
            <h2 id="store-options">Store options</h2>
            <table>
              <thead><tr><th>Mode</th><th>Use for</th><th>Configuration</th></tr></thead>
              <tbody>
                <tr><td>Filesystem</td><td>Local dev, demos, one-node apps</td><td><code>{ rootDir: ".pson5-store" }</code></td></tr>
                <tr><td>Memory adapter</td><td>Tests and ephemeral sandboxes</td><td><code>{ adapter: createMemoryProfileStoreAdapter() }</code></td></tr>
                <tr><td>Postgres adapter</td><td>Production multi-node apps</td><td><code>PSON_STORE_BACKEND=postgres</code> on the API or adapter in-process</td></tr>
                <tr><td>Custom adapter</td><td>DynamoDB, Firestore, proprietary stores</td><td>Implement the profile store adapter contract</td></tr>
              </tbody>
            </table>
            <h2 id="full-lifecycle">Full lifecycle</h2>
            <pre><code>const store = { rootDir: ".pson5-store" };

const profile = await pson.ensureProfile({
  user_id: appUser.id,
  tenant_id: appUser.tenantId,
  domains: ["core", "education"],
  depth: "standard"
}, store);

await pson.observeFact({
  profile_id: profile.profile_id,
  domain: "education",
  key: "prefers_worked_examples",
  value: true,
  confidence: 1,
  note: "User said worked examples help them learn."
}, store);

const next = await pson.getNextQuestions(profile.profile_id, {
  domains: ["education"],
  depth: "standard",
  limit: 2
}, store);

const context = await pson.getAgentContext(profile.profile_id, {
  intent: "Personalize an algebra lesson.",
  domains: ["education", "core"],
  include_predictions: true,
  max_items: 16,
  min_confidence: 0.35
}, store);</code></pre>
            <h2 id="provider">Provider setup</h2>
            <pre><code>await pson.configureProvider({
  provider: "openai",
  api_key: process.env.OPENAI_API_KEY,
  model: "gpt-4.1-mini",
  enabled: true,
  timeout_ms: 20000
}, store);

const policy = await pson.getProviderPolicy(profile.profile_id, "simulation", store);</code></pre>
            <h2 id="production-checklist">Production checklist</h2>
            <ul>
              <li>Use app-stable user IDs, not names or emails as profile identity.</li>
              <li>Set <code>tenant_id</code> in multi-tenant products.</li>
              <li>Use <code>getAgentContext</code> for LLM prompts; do not send raw profiles by default.</li>
              <li>Use <code>observeFact</code> only for user-stated facts, not model guesses.</li>
              <li>Check provider policy before simulation/modeling.</li>
              <li>Use Postgres/custom adapter for multi-node production deployments.</li>
              <li>Keep audit logs enabled or replace them with equivalent external telemetry.</li>
            </ul>
            ${githubLink("usage/sdk-full-setup.md")}
          `
        },
        {
          slug: "implementation/full-stack-reference",
          title: "Full-stack reference app",
          summary: "A concrete backend-owned integration with auth, PSON routes, chat, learning, memory writes, simulation, and production request examples.",
          content: `
            <div class="callout">
              This is the fastest path for a startup building its own app: your backend owns auth and calls PSON5 through the SDK. No guessed user IDs, no MCP identity ambiguity.
            </div>
            <h2 id="file-tree">File tree</h2>
            <pre><code>src/
  env.ts
  auth.ts
  pson.ts
  llm.ts
  server.ts
  routes/
    chat.ts
    profile.ts
    learning.ts
    simulation.ts</code></pre>
            <h2 id="pson-client">PSON client module</h2>
            <pre><code>import { PsonClient } from "@pson5/sdk";

export const pson = new PsonClient();
export const psonStore = { rootDir: process.env.PSON_STORE_DIR ?? ".pson5-store" };

export async function ensureUserProfile(user) {
  return pson.ensureProfile({
    user_id: user.id,
    tenant_id: user.tenantId,
    domains: ["core", "education"],
    depth: "standard"
  }, psonStore);
}</code></pre>
            <h2 id="chat-route">Chat route</h2>
            <pre><code>export async function chat(req) {
  const user = await requireUser(req);
  const { message } = await req.json();
  const profile = await ensureUserProfile(user);

  const context = await pson.getAgentContext(profile.profile_id, {
    intent: message,
    domains: ["core", "education"],
    include_predictions: true,
    max_items: 16,
    min_confidence: 0.35,
    task_context: { surface: "chat", tenant_id: user.tenantId }
  }, psonStore);

  const answer = await runLlm({
    messages: [
      { role: "system", content: "Use PSON context to personalize. Do not expose raw profile data." },
      { role: "developer", content: JSON.stringify({ pson_agent_context: context }) },
      { role: "user", content: message }
    ]
  });

  return Response.json({
    answer: answer.text,
    profile_id: profile.profile_id,
    redactions: context.redaction_notes
  });
}</code></pre>
            <h2 id="memory-route">Memory write route</h2>
            <pre><code>export async function rememberFact(req) {
  const user = await requireUser(req);
  const body = await req.json();
  const profile = await ensureUserProfile(user);

  const updated = await pson.observeFact({
    profile_id: profile.profile_id,
    domain: body.domain,
    key: body.key,
    value: body.value,
    confidence: 1,
    note: body.note
  }, psonStore);

  return Response.json({
    profile_id: updated.profile_id,
    revision: updated.metadata.revision
  });
}</code></pre>
            <h2 id="learning-route">Learning route</h2>
            <pre><code>export async function nextQuestions(req) {
  const user = await requireUser(req);
  const profile = await ensureUserProfile(user);

  return Response.json(await pson.getNextQuestions(profile.profile_id, {
    domains: ["education"],
    depth: "standard",
    limit: 2
  }, psonStore));
}</code></pre>
            <h2 id="simulation-route">Simulation route</h2>
            <pre><code>export async function simulate(req) {
  const user = await requireUser(req);
  const body = await req.json();
  const profile = await ensureUserProfile(user);

  const policy = await pson.getProviderPolicy(profile.profile_id, "simulation", psonStore);
  if (!policy.allowed) return Response.json({ allowed: false, policy }, { status: 403 });

  return Response.json(await pson.simulate({
    profile_id: profile.profile_id,
    domains: ["education", "core"],
    context: {
      scenario: body.scenario,
      question: body.question,
      options: body.options ?? []
    },
    options: {
      include_reasoning: true,
      include_evidence: true,
      explanation_level: "standard"
    }
  }, psonStore));
}</code></pre>
            <h2 id="requests">Request examples</h2>
            <pre><code>curl -X POST http://localhost:3000/chat \\
  -H "content-type: application/json" \\
  -H "x-demo-user-id: learner_123" \\
  -H "x-demo-tenant-id: school_456" \\
  -d '{"message":"Explain two-step equations"}'</code></pre>
            <pre><code>curl -X POST http://localhost:3000/profile/facts \\
  -H "content-type: application/json" \\
  -H "x-demo-user-id: learner_123" \\
  -d '{"domain":"education","key":"prefers_visual_examples","value":true}'</code></pre>
            <h2 id="production-notes">Production notes</h2>
            <ul>
              <li>Replace demo headers with your real auth/session provider.</li>
              <li>Use Postgres/custom adapter for multi-node deployments.</li>
              <li>Test tenant isolation and subject-user isolation explicitly.</li>
              <li>Never send raw profiles to the LLM by default.</li>
              <li>Use provider policy before every simulation/modeling call.</li>
            </ul>
            ${githubLink("usage/full-stack-reference-implementation.md")}
          `
        },
        {
          slug: "implementation/llm-integration",
          title: "Connect LLMs to PSON5",
          summary: "How to wire OpenAI-style tools, custom agents, backend-owned chat, and MCP clients to the SDK.",
          content: `
            <h2 id="mental-model">Mental model</h2>
            <p>PSON5 is the personalization substrate. Your LLM runtime calls it to load context, write confirmed memory, ask calibration questions, and simulate likely preferences.</p>
            <h2 id="loop">Standard LLM loop</h2>
            <ol>
              <li>Resolve app user identity.</li>
              <li>Call <code>pson_ensure_profile</code> or SDK <code>ensureProfile</code>.</li>
              <li>Call <code>pson_get_agent_context</code> before personalized generation.</li>
              <li>Send the agent context to the LLM as bounded, labelled personalization context.</li>
              <li>Write durable user-stated facts through <code>pson_observe_fact</code>.</li>
              <li>Use <code>pson_simulate</code> only for scenario prediction, after provider policy allows it.</li>
            </ol>
            <h2 id="prompt-contract">Prompt contract</h2>
            <pre><code>You have access to PSON5.
- Never invent user_id.
- Use pson_get_agent_context before personalizing.
- Use pson_observe_fact only for explicit user-stated facts.
- Use pson_get_next_questions only when setup/calibration is useful.
- Use pson_get_provider_policy before pson_simulate.
- Treat simulated results as probabilistic, not fact.</code></pre>
            <h2 id="tool-adapter">OpenAI-style tool adapter</h2>
            <pre><code>import {
  PsonClient,
  getPsonAgentToolDefinitions,
  createPsonAgentToolExecutor
} from "@pson5/sdk";

const pson = new PsonClient();
const executor = createPsonAgentToolExecutor(pson, { rootDir: ".pson5-store" });

export const tools = getPsonAgentToolDefinitions().map((tool) => ({
  type: "function",
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema
}));

export async function executeTool(name, args) {
  return executor.execute({ name, arguments: args });
}</code></pre>
            <h2 id="backend-owned">Backend-owned chat</h2>
            <pre><code>app.post("/chat", async (req, res) => {
  const user = await requireUser(req);
  const profile = await pson.ensureProfile({
    user_id: user.id,
    tenant_id: user.tenantId,
    domains: ["core"],
    depth: "light"
  });

  const context = await pson.getAgentContext(profile.profile_id, {
    intent: req.body.message,
    include_predictions: true
  });

  const answer = await runYourLlm({
    message: req.body.message,
    psonContext: context
  });

  res.json({ answer });
});</code></pre>
            <h2 id="mcp">MCP clients</h2>
            <p>Expose <code>/v1/mcp</code> when the LLM product owns tool execution. The server supports OpenAI subject metadata, explicit user IDs, profile lookup, bearer hash, and MCP session fallback. For true cross-session user identity, prefer OpenAI subject metadata or per-user JWTs.</p>
            ${githubLink("usage/llm-sdk-integration.md")}
          `
        },
        {
          slug: "implementation/configuration-reference",
          title: "Configuration reference",
          summary: "Every important runtime option for API auth, JWT/JWKS, tenancy, MCP, storage, audit, and AI providers.",
          content: `
            <h2 id="api-runtime">API runtime</h2>
            <table>
              <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><code>HOST</code></td><td><code>0.0.0.0</code></td><td>Bind host. Non-loopback without auth is refused unless allowed.</td></tr>
                <tr><td><code>PORT</code></td><td><code>3000</code></td><td>API port.</td></tr>
                <tr><td><code>PSON_MAX_REQUEST_BYTES</code></td><td>1 MB</td><td>Request body cap.</td></tr>
              </tbody>
            </table>
            <h2 id="storage">Storage</h2>
            <table>
              <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><code>PSON_STORE_BACKEND</code></td><td><code>file</code></td><td><code>file</code>, <code>memory</code>, or <code>postgres</code>.</td></tr>
                <tr><td><code>PSON_STORE_DIR</code></td><td><code>.pson5-store</code></td><td>Filesystem store root.</td></tr>
                <tr><td><code>DATABASE_URL</code></td><td>none</td><td>Postgres connection fallback.</td></tr>
                <tr><td><code>PSON_PG_CONNECTION_STRING</code></td><td>none</td><td>Postgres connection string.</td></tr>
                <tr><td><code>PSON_PG_SCHEMA</code></td><td><code>public</code></td><td>Postgres schema.</td></tr>
                <tr><td><code>PSON_PG_APPLY_SCHEMA</code></td><td><code>false</code></td><td>Apply schema SQL on startup.</td></tr>
              </tbody>
            </table>
            <h2 id="auth">Auth and identity</h2>
            <table>
              <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><code>PSON_API_KEY</code></td><td>none</td><td>Shared API secret.</td></tr>
                <tr><td><code>PSON_DEFAULT_API_KEY_ROLE</code></td><td><code>editor</code></td><td>Role for API-key callers.</td></tr>
                <tr><td><code>PSON_ENFORCE_TENANT</code></td><td><code>false</code></td><td>Require tenant binding.</td></tr>
                <tr><td><code>PSON_ENFORCE_SUBJECT_USER</code></td><td><code>false</code></td><td>Require subject-user binding for user-data operations.</td></tr>
                <tr><td><code>PSON_JWT_SECRET</code></td><td>none</td><td>HS256 JWT secret.</td></tr>
                <tr><td><code>PSON_JWT_PUBLIC_KEY</code></td><td>none</td><td>RS256 public key.</td></tr>
                <tr><td><code>PSON_JWKS_URL</code></td><td>none</td><td>Remote JWKS URL.</td></tr>
              </tbody>
            </table>
            <h2 id="mcp">MCP</h2>
            <table>
              <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><code>PSON_DEFAULT_MCP_SUBJECT_ROLE</code></td><td><code>editor</code></td><td>Role for subject-bound MCP callers arriving as anonymous.</td></tr>
                <tr><td><code>PSON_MCP_ALLOW_ARGUMENT_SUBJECT_FALLBACK</code></td><td><code>true</code></td><td>Allows <code>arguments.user_id</code> as a subject fallback.</td></tr>
                <tr><td><code>PSON_MCP_SUBJECT_FALLBACK</code></td><td><code>session_hash</code></td><td><code>session_hash</code>, <code>bearer_hash</code>, or <code>disabled</code>.</td></tr>
                <tr><td><code>PSON_OPENAI_APPS_CHALLENGE_TOKEN</code></td><td>none</td><td>OpenAI Apps domain challenge token.</td></tr>
              </tbody>
            </table>
            <h2 id="providers">Providers</h2>
            <table>
              <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><code>PSON_AI_PROVIDER</code></td><td>none</td><td><code>openai</code>, <code>anthropic</code>, or <code>openai-compatible</code>.</td></tr>
                <tr><td><code>OPENAI_API_KEY</code></td><td>none</td><td>OpenAI key.</td></tr>
                <tr><td><code>ANTHROPIC_API_KEY</code></td><td>none</td><td>Anthropic key.</td></tr>
                <tr><td><code>PSON_AI_API_KEY</code></td><td>none</td><td>Generic provider key.</td></tr>
                <tr><td><code>PSON_AI_MODEL</code></td><td>provider default</td><td>Model override.</td></tr>
                <tr><td><code>PSON_AI_BASE_URL</code></td><td>provider default</td><td>Base URL override.</td></tr>
                <tr><td><code>PSON_AI_TIMEOUT_MS</code></td><td><code>20000</code></td><td>Provider request timeout.</td></tr>
              </tbody>
            </table>
            <h2 id="neo4j">Neo4j</h2>
            <table>
              <thead><tr><th>Variable</th><th>Default</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><code>PSON_NEO4J_URI</code></td><td>none</td><td>Neo4j connection URI.</td></tr>
                <tr><td><code>PSON_NEO4J_USERNAME</code></td><td>none</td><td>Neo4j username.</td></tr>
                <tr><td><code>PSON_NEO4J_PASSWORD</code></td><td>none</td><td>Neo4j password.</td></tr>
                <tr><td><code>PSON_NEO4J_DATABASE</code></td><td>none</td><td>Optional database name.</td></tr>
                <tr><td><code>PSON_NEO4J_ENABLED</code></td><td><code>true</code></td><td>Disable Neo4j integration without deleting config.</td></tr>
              </tbody>
            </table>
            ${githubLink("usage/configuration-reference.md")}
          `
        },
        {
          slug: "implementation/personalized-edtech",
          title: "Personalized EdTech startup",
          summary: "A full startup playbook for tutoring, practice generation, learner state, teacher dashboards, and privacy-safe personalization.",
          content: `
            <div class="callout">
              Example startup: an adaptive tutoring platform that personalizes explanation style, practice sets, pacing, reminders, and intervention strategy for every learner.
            </div>
            <h2 id="surfaces">Product surfaces</h2>
            <ul>
              <li>AI tutor chat</li>
              <li>Lesson planner</li>
              <li>Adaptive practice generator</li>
              <li>Teacher/parent summary</li>
              <li>Study schedule coach</li>
              <li>Intervention recommender</li>
            </ul>
            <h2 id="profile">Learner profile boot</h2>
            <pre><code>const profile = await pson.ensureProfile({
  user_id: learner.id,
  tenant_id: school.id,
  domains: ["core", "education"],
  depth: "standard"
});</code></pre>
            <h2 id="education-facts">Education facts to observe</h2>
            <p><code>grade_band</code>, <code>current_subjects</code>, <code>learning_goal</code>, <code>preferred_explanation_style</code>, <code>prefers_visual_examples</code>, <code>prefers_step_by_step</code>, <code>practice_tolerance</code>, <code>frustration_signals</code>, <code>motivation_drivers</code>, <code>assessment_anxiety</code>, <code>schedule_constraints</code>, <code>accessibility_needs</code>.</p>
            <h2 id="tutor-context">Tutor chat context</h2>
            <pre><code>const context = await pson.getAgentContext(profile.profile_id, {
  intent: learnerMessage,
  domains: ["education", "core"],
  include_predictions: true,
  max_items: 16,
  task_context: {
    product_surface: "ai_tutor",
    current_subject: "algebra",
    current_skill: "two_step_equations"
  }
});</code></pre>
            <h2 id="simulation">Intervention simulation</h2>
            <pre><code>const sim = await pson.simulate({
  profile_id: profile.profile_id,
  domains: ["education"],
  context: {
    scenario: "The learner failed three questions in a row.",
    options: [
      "Give a full worked example",
      "Ask a guiding question",
      "Switch to a visual analogy",
      "Recommend a short break"
    ],
    question: "Which intervention is most likely to keep them engaged?"
  }
});</code></pre>
            <h2 id="mvp-plan">MVP plan</h2>
            <ul>
              <li><strong>Week 1:</strong> user auth, learner IDs, profile creation, agent context, explicit fact capture.</li>
              <li><strong>Week 2:</strong> onboarding questions, practice personalization, provider policy, simulation.</li>
              <li><strong>Week 3:</strong> teacher dashboard, Postgres storage, tenancy, audit review.</li>
              <li><strong>Week 4:</strong> education domain module, consent/data deletion, evaluation dataset.</li>
            </ul>
            <h2 id="privacy">Safety controls</h2>
            <ul>
              <li>Learner/guardian consent and export/delete flows.</li>
              <li>No medical or diagnostic guesses as observed facts.</li>
              <li>Inference labels in teacher-facing reports.</li>
              <li>Restricted fields and tenant isolation.</li>
            </ul>
            ${githubLink("startups/personalized-edtech-startup.md")}
          `
        },
        {
          slug: "implementation/edtech-reference-implementation",
          title: "EdTech reference implementation",
          summary: "Concrete learner profile boot, tutor route, practice generator, intervention simulation, teacher dashboard, and privacy controls.",
          content: `
            <h2 id="domain-model">Domain model</h2>
            <pre><code>interface Learner {
  id: string;
  school_id: string;
  display_name: string;
  grade_band: "elementary" | "middle_school" | "high_school" | "adult";
}

interface Assignment {
  id: string;
  learner_id: string;
  subject: "math" | "science" | "reading" | "writing";
  skill: string;
  due_at?: string;
}</code></pre>
            <h2 id="profile-boot">Profile boot</h2>
            <pre><code>const profile = await pson.ensureProfile({
  user_id: learner.id,
  tenant_id: learner.school_id,
  domains: ["core", "education"],
  depth: "standard"
}, psonStore);

await pson.observeFact({
  profile_id: profile.profile_id,
  domain: "education",
  key: "grade_band",
  value: learner.grade_band,
  confidence: 1,
  note: "Imported from learner account settings."
}, psonStore);</code></pre>
            <h2 id="tutor-turn">Tutor turn</h2>
            <pre><code>export async function tutorTurn({ learner, assignment, message }) {
  const profile = await pson.ensureProfile({
    user_id: learner.id,
    tenant_id: learner.school_id,
    domains: ["core", "education"],
    depth: "standard"
  }, psonStore);

  const context = await pson.getAgentContext(profile.profile_id, {
    intent: message,
    domains: ["education", "core"],
    include_predictions: true,
    max_items: 20,
    min_confidence: 0.35,
    task_context: {
      surface: "ai_tutor",
      subject: assignment?.subject,
      skill: assignment?.skill,
      due_at: assignment?.due_at
    }
  }, psonStore);

  return runTutorModel({ learnerMessage: message, psonContext: context, assignment });
}</code></pre>
            <h2 id="tutor-prompt">Tutor prompt</h2>
            <pre><code>You are an adaptive tutor.
Use PSON context to personalize explanation style, pacing, examples, scaffolding, and encouragement.
Do not reveal raw profile contents.
Treat inferred and simulated data as uncertain.
If the learner explicitly states a preference, store it with pson_observe_fact.
Do not store diagnoses, medical claims, or sensitive assumptions as observed facts.</code></pre>
            <h2 id="practice-generator">Practice generator</h2>
            <pre><code>export async function generatePractice({ learner, subject, skill, minutes }) {
  const profile = await pson.ensureProfile({
    user_id: learner.id,
    tenant_id: learner.school_id,
    domains: ["education", "core"],
    depth: "standard"
  }, psonStore);

  const context = await pson.getAgentContext(profile.profile_id, {
    intent: \`Generate \${minutes} minutes of practice for \${skill}.\`,
    domains: ["education", "core"],
    include_predictions: true,
    task_context: {
      surface: "practice_generator",
      subject,
      skill,
      time_budget_minutes: minutes
    }
  }, psonStore);

  return runPracticeModel({ psonContext: context, subject, skill, minutes });
}</code></pre>
            <h2 id="intervention">Intervention simulation</h2>
            <pre><code>export async function chooseIntervention({ profileId, recentEvents }) {
  const policy = await pson.getProviderPolicy(profileId, "simulation", psonStore);
  if (!policy.allowed) {
    return {
      mode: "rules",
      intervention: "Ask a guiding question and offer a worked example if needed.",
      policy
    };
  }

  return pson.simulate({
    profile_id: profileId,
    domains: ["education", "core"],
    context: {
      scenario: "Learner appears stuck during active practice.",
      recent_events: recentEvents,
      options: ["worked example", "guiding question", "visual analogy", "reduce difficulty", "short break"],
      question: "Which intervention is most likely to preserve confidence and progress?"
    },
    options: {
      include_reasoning: true,
      include_evidence: true,
      explanation_level: "standard"
    }
  }, psonStore);
}</code></pre>
            <h2 id="teacher-dashboard">Teacher dashboard</h2>
            <pre><code>export async function getTeacherLearnerSummary({ teacherId, learner, profileId }) {
  await assertTeacherCanAccessLearner(teacherId, learner.id);

  const context = await pson.getAgentContext(profileId, {
    intent: "Prepare a privacy-safe teacher summary.",
    domains: ["education"],
    include_predictions: false,
    min_confidence: 0.55,
    max_items: 20,
    task_context: { surface: "teacher_dashboard" }
  }, psonStore);

  return {
    learner_id: learner.id,
    observed_preferences: context.personal_data.preferences.filter((item) => item.source === "observed"),
    inferred_patterns: context.personal_data.behavioral_patterns.filter((item) => item.source === "inferred"),
    redaction_notes: context.redaction_notes
  };
}</code></pre>
            <h2 id="memory-policy">Memory write policy</h2>
            <ul>
              <li>Store: "I understand better with diagrams."</li>
              <li>Store: "I need a slower pace."</li>
              <li>Store: "I get anxious before timed quizzes."</li>
              <li>Do not store: "The learner probably has ADHD."</li>
              <li>Do not store: "The learner is lazy."</li>
              <li>Do not store: "The learner is bad at math."</li>
            </ul>
            <h2 id="launch-checklist">Launch checklist</h2>
            <ul>
              <li>Test learner A cannot read learner B.</li>
              <li>Test school A cannot read school B.</li>
              <li>Test provider policy denial when consent scopes are missing.</li>
              <li>Test safe export redacts sensitive data.</li>
              <li>Test teacher summary never displays simulated predictions as fact.</li>
            </ul>
            ${githubLink("startups/personalized-edtech-reference-implementation.md")}
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
