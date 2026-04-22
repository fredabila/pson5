export const site = {
  sections: [
    {
      title: "Introduction",
      pages: [
        {
          slug: "introduction/overview",
          title: "Overview",
          summary: "What PSON5 is, what it ships, and how to think about the stack.",
          content: `
            <div class="callout">
              <strong>PSON5</strong> is a personalization infrastructure stack: a portable profile format, a set of engines,
              an SDK, a CLI, an API, and product surfaces that let agents learn about users in a structured, privacy-aware way.
            </div>
            <h2 id="what-you-get">What you get</h2>
            <div class="cards">
              <div class="card"><strong>.pson standard</strong><p>Portable JSON profile format for observed, inferred, simulated, and privacy-tagged data.</p></div>
              <div class="card"><strong>Core engines</strong><p>Acquisition, modeling, simulation, state, graph, serialization, and provider integration.</p></div>
              <div class="card"><strong>Surfaces</strong><p>TypeScript SDK, HTTP API, CLI, web console, public landing page, and docs site.</p></div>
            </div>
            <h2 id="system-shape">System shape</h2>
            <pre><code>User → PSON profile → engines → agent context → personalized output</code></pre>
            <h2 id="current-status">Current status</h2>
            <p>The repo is beyond prototype scaffolding. It already includes storage backends, agent context projection, provider-backed simulation, auth boundaries, access audit logging, and asymmetric JWT verification.</p>
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
              <li>Probabilistic simulation instead of pretending preferences are static facts</li>
              <li>Agent-safe projection instead of dumping the entire profile into prompts</li>
            </ul>
            <h2 id="design-principles">Design principles</h2>
            <ul>
              <li>Probabilistic, not mystical</li>
              <li>Configurable, not hard-coded</li>
              <li>Privacy-aware, not data-maximalist</li>
              <li>Composable, not app-locked</li>
            </ul>
          `
        }
      ]
    },
    {
      title: "Getting Started",
      pages: [
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
npm run test:postgres-store</code></pre>
          `
        },
        {
          slug: "getting-started/first-profile",
          title: "Create Your First Profile",
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
    {
      question_id: next.questions[0].id,
      value: "plan_first"
    }
  ]
});

const context = await client.getAgentContext(profile.profile_id, {
  intent: "tutoring",
  include_predictions: true
});</code></pre>
          `
        }
      ]
    },
    {
      title: "Concepts",
      pages: [
        {
          slug: "concepts/profile-model",
          title: ".pson Profile Model",
          summary: "Observed, inferred, simulated, cognitive, behavioral, state, graph, privacy, and metadata layers.",
          content: `
            <h2 id="top-level-shape">Top-level shape</h2>
            <pre><code>{
  "pson_version": "5.0",
  "profile_id": "pson_...",
  "user_id": "user_123",
  "tenant_id": "tenant_acme",
  "layers": {
    "observed": {},
    "inferred": {},
    "simulated": {}
  },
  "cognitive_model": {},
  "behavioral_model": {},
  "state_model": {},
  "knowledge_graph": {},
  "privacy": {},
  "metadata": {}
}</code></pre>
            <h2 id="why-canonical">Why a canonical format matters</h2>
            <p>It makes validation, export, redaction, simulation, and multi-agent portability possible.</p>
          `
        },
        {
          slug: "concepts/agent-context",
          title: "Agent Context",
          summary: "Why agents should use the projection layer instead of the raw profile.",
          content: `
            <h2 id="default-rule">Default rule</h2>
            <p>Agents should usually consume <code>getAgentContext(...)</code>, not the full profile.</p>
            <h2 id="why">Why</h2>
            <ul>
              <li>filters irrelevant data</li>
              <li>separates observed facts from inference and prediction</li>
              <li>honors privacy restrictions</li>
              <li>keeps prompts compact</li>
            </ul>
            <h2 id="shape">Shape</h2>
            <pre><code>{
  profile_id,
  personal_data: {
    preferences: [],
    communication_style: [],
    behavioral_patterns: [],
    learning_profile: [],
    current_state: [],
    predictions: []
  },
  constraints: {},
  reasoning_policy: {}
}</code></pre>
          `
        }
      ]
    },
    {
      title: "SDK",
      pages: [
        {
          slug: "sdk/overview",
          title: "SDK Overview",
          summary: "The main SDK surface and what belongs in app code versus package internals.",
          content: `
            <h2 id="entry-point">Entry point</h2>
            <pre><code>import { PsonClient } from "@pson5/sdk";</code></pre>
            <h2 id="main-operations">Main operations</h2>
            <ul>
              <li>profile creation and loading</li>
              <li>question flow and learning</li>
              <li>simulation</li>
              <li>agent-context building</li>
              <li>provider setup</li>
              <li>domain module registration</li>
            </ul>
          `
        },
        {
          slug: "sdk/agent-integration",
          title: "Agent Integration",
          summary: "How an agent should call PSON5 as a tool layer.",
          content: `
            <h2 id="recommended-pattern">Recommended pattern</h2>
            <ol>
              <li>resolve the profile by app user id</li>
              <li>get agent context</li>
              <li>respond or ask a next question</li>
              <li>write the answer back with <code>learn(...)</code></li>
              <li>simulate when behavior-sensitive planning matters</li>
            </ol>
            <pre><code>const profile = await client.loadProfileByUserId("app_user_42");
const context = await client.getAgentContext(profile.profile_id, { intent: "tutoring" });
const next = await client.getNextQuestions(profile.profile_id, { limit: 1 });</code></pre>
          `
        }
      ]
    },
    {
      title: "API",
      pages: [
        {
          slug: "api/overview",
          title: "API Overview",
          summary: "Route groups, backend modes, and what the API is responsible for.",
          content: `
            <h2 id="route-groups">Route groups</h2>
            <ul>
              <li>profile lifecycle: init, load, import, export, validate</li>
              <li>learning: next question and learn</li>
              <li>simulation and explainability</li>
              <li>agent context projection</li>
              <li>provider status</li>
            </ul>
            <h2 id="backend-modes">Backend modes</h2>
            <pre><code>PSON_STORE_BACKEND=file|memory|postgres</code></pre>
          `
        },
        {
          slug: "api/auth-and-tenancy",
          title: "Auth, JWT, and Tenancy",
          summary: "API key mode, signed identity mode, tenant enforcement, subject-user binding, and audit logs.",
          content: `
            <h2 id="security-layers">Security layers</h2>
            <ul>
              <li>optional API key</li>
              <li>optional signed JWT identity</li>
              <li>optional tenant enforcement</li>
              <li>optional subject-user enforcement</li>
              <li>role/scope checks</li>
              <li>persistent API access audit logging</li>
            </ul>
            <h2 id="jwt-modes">JWT modes</h2>
            <ul>
              <li>HS256 with <code>PSON_JWT_SECRET</code></li>
              <li>RS256 with <code>PSON_JWT_PUBLIC_KEY</code></li>
              <li>RS256 with <code>PSON_JWKS_JSON</code>, <code>PSON_JWKS_PATH</code>, or <code>PSON_JWKS_URL</code></li>
            </ul>
            <h2 id="audit-log">Audit log</h2>
            <pre><code>.pson5-store/audit/api-access.jsonl</code></pre>
          `
        }
      ]
    },
    {
      title: "CLI",
      pages: [
        {
          slug: "cli/overview",
          title: "CLI Overview",
          summary: "The developer CLI and interactive terminal flow.",
          content: `
            <h2 id="modes">Modes</h2>
            <ul>
              <li>one-shot command mode</li>
              <li>interactive console mode</li>
            </ul>
            <h2 id="common-commands">Common commands</h2>
            <pre><code>pson console --store .pson5-store
pson init user_123
pson question-next &lt;profileId&gt;
pson simulate &lt;profileId&gt; --context "{...}"</code></pre>
          `
        }
      ]
    },
    {
      title: "Storage",
      pages: [
        {
          slug: "storage/overview",
          title: "Storage Adapters",
          summary: "How file, memory, document, and Postgres adapters fit together.",
          content: `
            <h2 id="adapters">Adapters</h2>
            <ul>
              <li>file adapter</li>
              <li>memory adapter</li>
              <li>document repository adapter</li>
              <li>Postgres repository package</li>
            </ul>
            <h2 id="why-abstraction">Why it matters</h2>
            <p>The SDK and API can stay stable while storage moves from local files to cloud-backed persistence.</p>
          `
        }
      ]
    },
    {
      title: "Deployment",
      pages: [
        {
          slug: "deployment/open-source-readiness",
          title: "Open-Source Readiness",
          summary: "What the repo now includes for GitHub, publishing, and contribution workflows.",
          content: `
            <h2 id="repo-contract">Repo contract</h2>
            <ul>
              <li>license</li>
              <li>contributing guide</li>
              <li>code of conduct</li>
              <li>security policy</li>
              <li>support guide</li>
              <li>GitHub issue and PR templates</li>
              <li>CI workflow</li>
              <li>manual package publish workflow</li>
            </ul>
            <h2 id="publishable-workspaces">Publishable workspaces</h2>
            <p>The core libraries and CLI now carry package metadata and package-level READMEs suitable for npm publication.</p>
          `
        },
        {
          slug: "deployment/package-publishing",
          title: "Package Publishing",
          summary: "How the workspace is prepared for npm publication and what to check before release.",
          content: `
            <h2 id="prepublish">Prepublish</h2>
            <pre><code>npm run ci
npm run pack:publishable</code></pre>
            <h2 id="publishable-packages">Publishable packages</h2>
            <ul>
              <li><code>@pson5/sdk</code></li>
              <li><code>@pson5/core-types</code></li>
              <li><code>@pson5/schemas</code></li>
              <li><code>@pson5/privacy</code></li>
              <li><code>@pson5/serialization-engine</code></li>
              <li><code>@pson5/provider-engine</code></li>
              <li><code>@pson5/modeling-engine</code></li>
              <li><code>@pson5/state-engine</code></li>
              <li><code>@pson5/graph-engine</code></li>
              <li><code>@pson5/simulation-engine</code></li>
              <li><code>@pson5/acquisition-engine</code></li>
              <li><code>@pson5/agent-context</code></li>
              <li><code>@pson5/postgres-store</code></li>
              <li><code>@pson5/cli</code></li>
            </ul>
          `
        }
      ]
    },
    {
      title: "Reference",
      pages: [
        {
          slug: "reference/packages",
          title: "Package Matrix",
          summary: "What each package is for and when to use it.",
          content: `
            <table>
              <thead><tr><th>Package</th><th>Role</th></tr></thead>
              <tbody>
                <tr><td><code>@pson5/sdk</code></td><td>Main integration surface for apps and agents.</td></tr>
                <tr><td><code>@pson5/core-types</code></td><td>Shared TypeScript contracts.</td></tr>
                <tr><td><code>@pson5/schemas</code></td><td>Validation and profile schema support.</td></tr>
                <tr><td><code>@pson5/privacy</code></td><td>Consent, redaction, policy helpers.</td></tr>
                <tr><td><code>@pson5/serialization-engine</code></td><td>Storage, import/export, adapters.</td></tr>
                <tr><td><code>@pson5/provider-engine</code></td><td>OpenAI/Anthropic and provider policy integration.</td></tr>
                <tr><td><code>@pson5/acquisition-engine</code></td><td>Question flow and learning writeback.</td></tr>
                <tr><td><code>@pson5/agent-context</code></td><td>Agent-safe projection layer.</td></tr>
              </tbody>
            </table>
          `
        }
      ]
    }
  ]
};
