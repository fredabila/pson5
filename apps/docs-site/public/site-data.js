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
        },
        {
          slug: "sdk/agent-skill",
          title: "Agent Skill",
          summary: "Why agents need a stable PSON skill/tool contract and what that contract should enforce.",
          content: `
            <h2 id="why-skill">Why a skill helps</h2>
            <p>An agent will not reliably infer the right PSON behavior just because the SDK exists. A stable skill or tool contract prevents raw-profile overuse, bad writeback patterns, and misuse of simulation output.</p>
            <h2 id="default-rules">Default rules</h2>
            <ul>
              <li>use <code>getAgentContext(...)</code> by default</li>
              <li>ask the next question only when uncertainty matters</li>
              <li>write user answers back with <code>learn(...)</code></li>
              <li>treat simulation as probabilistic support</li>
              <li>do not mutate raw profile JSON directly</li>
            </ul>
            <h2 id="where-llm-lives">Where the LLM lives</h2>
            <p>The SDK is not itself the model runtime. PSON orchestrates the profile lifecycle. Provider-backed language reasoning lives behind the provider engine when configured and allowed by policy.</p>
            <h2 id="repo-artifacts">Repo artifacts</h2>
            <ul>
              <li><code>skills/pson-agent/SKILL.md</code></li>
              <li><code>examples/agent-tools/pson-sdk-tools.ts</code></li>
              <li><code>docs/usage/pson-agent-skill.md</code></li>
            </ul>
          `
        },
        {
          slug: "sdk/agent-tools",
          title: "Agent Tools",
          summary: "Framework-consumable PSON tool definitions and executor helpers.",
          content: `
            <h2 id="sdk-exports">SDK exports</h2>
            <ul>
              <li><code>getPsonAgentToolDefinitions()</code></li>
              <li><code>createPsonAgentToolExecutor(client, storeOptions)</code></li>
            </ul>
            <h2 id="tool-names">Included tool names</h2>
            <ul>
              <li><code>pson_load_profile_by_user_id</code></li>
              <li><code>pson_create_profile</code></li>
              <li><code>pson_get_agent_context</code></li>
              <li><code>pson_get_next_questions</code></li>
              <li><code>pson_learn</code></li>
              <li><code>pson_simulate</code></li>
              <li><code>pson_get_provider_policy</code></li>
            </ul>
            <h2 id="shape">Definition shape</h2>
            <pre><code>{
  type: "function",
  name,
  description,
  input_schema
}</code></pre>
            <h2 id="framework-mapping">Framework mapping</h2>
            <p>You can map <code>input_schema</code> directly into the JSON-schema field expected by your agent framework. For OpenAI-style function tools, rename it to <code>parameters</code>.</p>
            <h2 id="examples">Examples</h2>
            <ul>
              <li><code>examples/agent-tools/pson-sdk-tools.ts</code></li>
              <li><code>examples/agent-tools/sdk-agent-loop.ts</code></li>
              <li><code>examples/agent-tools/openai-function-tools.ts</code></li>
            </ul>
            <h2 id="auth-note">Auth note</h2>
            <p>The SDK itself does not provide remote auth. If an agent is remote, use the API tool endpoints or MCP transport and authenticate there.</p>
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
              <li>remote tool server definitions and execution</li>
            </ul>
            <h2 id="backend-modes">Backend modes</h2>
            <pre><code>PSON_STORE_BACKEND=file|memory|postgres</code></pre>
            <h2 id="remote-tool-server">Remote tool server</h2>
            <ul>
              <li><code>GET /v1/pson/tools/definitions</code></li>
              <li><code>GET /v1/pson/tools/openai</code></li>
              <li><code>POST /v1/pson/tools/execute</code></li>
            </ul>
            <h2 id="mcp-transport">MCP transport</h2>
            <p>The API also exposes a minimal MCP-style JSON-RPC endpoint at <code>POST /v1/mcp</code> with <code>initialize</code>, <code>ping</code>, <code>tools/list</code>, and <code>tools/call</code>.</p>
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
        },
        {
          slug: "api/agent-transports",
          title: "Agent Transports",
          summary: "How SDK, HTTP tools, MCP over HTTP, and stdio MCP fit together.",
          content: `
            <h2 id="transport-choice">Transport choice</h2>
            <ul>
              <li>SDK for in-process backend agents</li>
              <li>HTTP tools for remote agents</li>
              <li>MCP over HTTP for MCP-style remote integrations</li>
              <li>stdio MCP for local machine integrations</li>
            </ul>
            <h2 id="remote-auth">Remote auth</h2>
            <p>HTTP tools and MCP over HTTP use the same API auth boundary: API key, signed JWT, tenant enforcement, subject-user binding, and role/scope checks.</p>
            <h2 id="local-mcp">Local MCP</h2>
            <p>stdio MCP does not use the API auth layer. It relies on the local process boundary and the permissions around the local store path.</p>
            <h2 id="examples">Examples</h2>
            <ul>
              <li><code>examples/agent-tools/http-tool-client.ts</code></li>
              <li><code>examples/agent-tools/mcp-http-client.ts</code></li>
              <li><code>examples/agent-tools/sdk-agent-loop.ts</code></li>
            </ul>
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
              <li>local stdio MCP mode</li>
            </ul>
            <h2 id="common-commands">Common commands</h2>
            <pre><code>pson console --store .pson5-store
pson mcp-stdio --store .pson5-store
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
