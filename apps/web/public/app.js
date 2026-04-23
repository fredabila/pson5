const ACCESS_KEY = "pson5_console_access";

if (window.location.pathname === "/console" && sessionStorage.getItem(ACCESS_KEY) !== "granted") {
  window.location.replace("/access");
}

const state = {
  apiBase: "/api",
  profileId: "",
  sessionId: "",
  profile: null,
  providerStatus: null,
  lastSession: null
};

const els = {
  apiOrigin: document.querySelector("#api-origin"),
  saveConfig: document.querySelector("#save-config"),
  configStatus: document.querySelector("#config-status"),
  currentApi: document.querySelector("#current-api"),
  currentProfile: document.querySelector("#current-profile"),
  currentSession: document.querySelector("#current-session"),
  providerBrief: document.querySelector("#provider-brief"),
  heroHeadline: document.querySelector("#hero-headline"),
  heroSubcopy: document.querySelector("#hero-subcopy"),
  initForm: document.querySelector("#init-form"),
  loadForm: document.querySelector("#load-form"),
  refreshProfile: document.querySelector("#refresh-profile"),
  newUserId: document.querySelector("#new-user-id"),
  newDomains: document.querySelector("#new-domains"),
  newDepth: document.querySelector("#new-depth"),
  profileId: document.querySelector("#profile-id"),
  summaryCards: document.querySelector("#summary-cards"),
  questionForm: document.querySelector("#question-form"),
  questionDomains: document.querySelector("#question-domains"),
  questionDepth: document.querySelector("#question-depth"),
  questionBrief: document.querySelector("#question-brief"),
  questionOutput: document.querySelector("#question-output"),
  sessionIntelligence: document.querySelector("#session-intelligence"),
  answerForm: document.querySelector("#answer-form"),
  answerQuestionId: document.querySelector("#answer-question-id"),
  answerValue: document.querySelector("#answer-value"),
  observedOutput: document.querySelector("#observed-output"),
  inferredOutput: document.querySelector("#inferred-output"),
  privacyOutput: document.querySelector("#privacy-output"),
  graphOverview: document.querySelector("#graph-overview"),
  graphMap: document.querySelector("#graph-map"),
  stateOutput: document.querySelector("#state-output"),
  simulateForm: document.querySelector("#simulate-form"),
  simulateTask: document.querySelector("#simulate-task"),
  simulateDeadline: document.querySelector("#simulate-deadline"),
  simulateDifficulty: document.querySelector("#simulate-difficulty"),
  simulateDomains: document.querySelector("#simulate-domains"),
  simulationBrief: document.querySelector("#simulation-brief"),
  simulationOutput: document.querySelector("#simulation-output"),
  agentForm: document.querySelector("#agent-form"),
  agentIntent: document.querySelector("#agent-intent"),
  agentOutput: document.querySelector("#agent-output"),
  explainForm: document.querySelector("#explain-form"),
  predictionId: document.querySelector("#prediction-id"),
  explainOutput: document.querySelector("#explain-output"),
  refreshProvider: document.querySelector("#refresh-provider"),
  checkProviderPolicy: document.querySelector("#check-provider-policy"),
  providerName: document.querySelector("#provider-name"),
  providerModel: document.querySelector("#provider-model"),
  providerOutput: document.querySelector("#provider-output"),
  exportSafe: document.querySelector("#export-safe"),
  exportFull: document.querySelector("#export-full"),
  exportOutput: document.querySelector("#export-output"),
  tabs: [...document.querySelectorAll(".tab")],
  panes: [...document.querySelectorAll(".pane")]
};

async function request(path, options = {}) {
  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function parseCsv(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function setPre(element, value) {
  element.textContent = typeof value === "string" ? value : formatJson(value);
  element.classList.remove("empty");
}

function setEmpty(element, message) {
  element.textContent = message;
  element.classList.add("empty");
}

function syncStatusStrip() {
  els.currentApi.textContent = state.apiBase;
  els.currentProfile.textContent = state.profileId || "None loaded";
  els.currentSession.textContent = state.sessionId || "No session";

  if (!state.providerStatus) {
    els.providerBrief.textContent = "Unknown";
    return;
  }

  if (!state.providerStatus.configured) {
    els.providerBrief.textContent = state.providerStatus.reason || "Unavailable";
    return;
  }

  els.providerBrief.textContent = `${state.providerStatus.provider}:${state.providerStatus.model}`;
}

function renderSummary(profile) {
  if (!profile) {
    els.summaryCards.innerHTML = "";
    els.heroHeadline.textContent = "Load a profile to activate the dashboard.";
    els.heroSubcopy.textContent =
      "The dashboard will surface acquisition signals, provider policy, simulation output, and profile layers.";
    return;
  }

  els.heroHeadline.textContent = `Profile ${profile.profile_id} for ${profile.user_id}`;
  els.heroSubcopy.textContent = `Revision ${profile.metadata.revision} with ${profile.metadata.source_count} recorded sources across ${profile.domains.active.join(", ")}.`;

  const aiModel = profile.layers.inferred?.ai_model;
  const cards = [
    ["Revision", profile.metadata.revision],
    ["Confidence", profile.metadata.confidence],
    ["Domains", profile.domains.active.join(", ")],
    ["Sources", profile.metadata.source_count],
    ["States", profile.state_model.states.length],
    ["Graph Nodes", profile.knowledge_graph.nodes.length],
    ["Local Only", String(profile.privacy.local_only)],
    ["AI Layer", aiModel ? "present" : "rules only"]
  ];

  els.summaryCards.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span class="label">${label}</span>
          <span class="value">${value}</span>
        </article>
      `
    )
    .join("");
}

function renderSessionIntelligence(session) {
  state.lastSession = session ?? null;

  if (!session) {
    els.sessionIntelligence.innerHTML = "Fetch a question to inspect fatigue, confidence gaps, contradictions, and stop logic.";
    els.sessionIntelligence.classList.add("empty");
    return;
  }

  els.sessionIntelligence.classList.remove("empty");
  const contradictions = session.contradiction_flags ?? [];
  const confidenceGaps = session.confidence_gaps ?? [];

  els.sessionIntelligence.innerHTML = `
    <article class="signal-card">
      <h3>Session status</h3>
      <p>${session.status} session ${session.session_id}</p>
    </article>
    <article class="signal-card">
      <h3>Fatigue score</h3>
      <p>${typeof session.fatigue_score === "number" ? session.fatigue_score.toFixed(2) : "0.00"}</p>
    </article>
    <article class="signal-card">
      <h3>Confidence gaps</h3>
      <p>${confidenceGaps.length ? confidenceGaps.join(", ") : "No unresolved high-value gaps in active domains."}</p>
    </article>
    <article class="signal-card">
      <h3>Contradictions</h3>
      ${
        contradictions.length
          ? `<ul>${contradictions
              .slice(-4)
              .map(
                (item) =>
                  `<li><strong>${item.target}</strong>: ${String(item.previous_value)} -> ${String(item.incoming_value)}</li>`
              )
              .join("")}</ul>`
          : "<p>No contradictions detected in this session.</p>"
      }
    </article>
    <article class="signal-card">
      <h3>Stop logic</h3>
      <p>${session.stop_reason || "No stop reason triggered yet."}</p>
    </article>
  `;
}

function renderQuestionCard(payload) {
  const session = payload?.session ?? null;
  const question = payload?.questions?.[0] ?? payload?.next_questions?.[0] ?? null;
  renderSessionIntelligence(session);

  if (!question) {
    els.questionBrief.innerHTML = "No more questions available for this session.";
    els.questionBrief.classList.add("empty");
    return;
  }

  els.questionBrief.classList.remove("empty");
  const chips = [
    question.domain,
    question.type,
    question.depth,
    question.generated_by === "provider" ? "provider-routed" : "registry"
  ]
    .filter(Boolean)
    .map((value) => `<span class="signal-chip">${value}</span>`)
    .join("");

  const choices =
    question.choices?.length
      ? `<div class="signal-card"><h3>Structured choices</h3><p>${question.choices
          .map((choice) => `${choice.label} (${choice.value})`)
          .join(", ")}</p></div>`
      : "";

  els.questionBrief.innerHTML = `
    <div class="brief-meta">${chips}</div>
    <div>
      <h3>${question.prompt}</h3>
      <p>${question.answer_style_hint || "Answer naturally. PSON will normalize where possible."}</p>
    </div>
    ${
      question.generation_rationale
        ? `<div class="signal-card"><h3>Why this question</h3><p>${question.generation_rationale}</p></div>`
        : ""
    }
    ${question.source_question_id ? `<div class="signal-card"><h3>Underlying target</h3><p>${question.source_question_id}</p></div>` : ""}
    ${choices}
  `;
}

function renderGraph(graph) {
  if (!graph || !graph.nodes?.length) {
    els.graphOverview.textContent = "No graph data available for this profile yet.";
    els.graphOverview.classList.add("empty");
    els.graphMap.textContent = "Load a profile to render the graph map.";
    els.graphMap.classList.add("empty");
    return;
  }

  els.graphOverview.classList.remove("empty");
  els.graphMap.classList.remove("empty");

  const nodeMarkup = graph.nodes
    .slice(0, 12)
    .map(
      (node) => `
        <div class="graph-item">
          <strong>${node.label}</strong>
          <span>${node.type}</span>
        </div>
      `
    )
    .join("");

  const edgeMarkup = graph.edges
    .slice(0, 12)
    .map(
      (edge) => `
        <div class="graph-item">
          <strong>${edge.type}</strong>
          <span>${edge.from} -> ${edge.to}</span>
        </div>
      `
    )
    .join("");

  els.graphOverview.innerHTML = `
    <div><strong>${graph.nodes.length}</strong> nodes and <strong>${graph.edges.length}</strong> edges</div>
    <div class="graph-columns">
      <div>
        <h3>Nodes</h3>
        <div class="graph-list">${nodeMarkup}</div>
      </div>
      <div>
        <h3>Edges</h3>
        <div class="graph-list">${edgeMarkup}</div>
      </div>
    </div>
  `;

  const lanes = {
    preference: graph.nodes.filter((node) => node.type === "preference").slice(0, 6),
    behavior: graph.nodes.filter((node) => node.type === "behavior").slice(0, 6),
    state: graph.nodes.filter((node) => node.type === "state").slice(0, 6)
  };

  const fallbackNodes = graph.nodes.slice(0, 6);

  const renderNodeLane = (title, nodes) => `
    <section class="graph-lane">
      <h3>${title}</h3>
      <div class="node-chip-list">
        ${(nodes.length ? nodes : fallbackNodes)
          .map(
            (node) => `
              <div class="node-chip">
                ${node.label}
                <span>${node.type}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;

  const edgeFlow = graph.edges
    .slice(0, 8)
    .map(
      (edge) => `
        <div class="edge-flow">
          <strong>${edge.type}</strong>
          <div>${edge.from} -> ${edge.to}</div>
        </div>
      `
    )
    .join("");

  els.graphMap.innerHTML = `
    <div class="graph-lane-grid">
      ${renderNodeLane("Preference Lane", lanes.preference)}
      ${renderNodeLane("Behavior Lane", lanes.behavior)}
      ${renderNodeLane("State Lane", lanes.state)}
    </div>
    <section class="graph-lane">
      <h3>Relation Flow</h3>
      <div class="edge-flow-list">${edgeFlow || '<div class="edge-flow"><strong>No edges yet</strong><div>Learning and modeling will populate graph relations.</div></div>'}</div>
    </section>
  `;
}

function renderSimulation(result) {
  if (!result) {
    els.simulationBrief.textContent =
      "Run a simulation to inspect prediction, provider mode, confidence, reasoning, and alternatives.";
    els.simulationBrief.classList.add("empty");
    return;
  }

  els.simulationBrief.classList.remove("empty");

  const providerLabel = result.provider
    ? `${result.provider.mode} | ${result.provider.provider} | ${result.provider.model}`
    : "rules only";

  const reasoning = (result.reasoning ?? [])
    .slice(0, 6)
    .map((item) => `<div>${item}</div>`)
    .join("");

  const caveats = (result.caveats ?? [])
    .slice(0, 6)
    .map((item) => `<div>${item}</div>`)
    .join("");

  const alternatives = (result.alternatives ?? [])
    .slice(0, 8)
    .map((item) => `<span class="alt-chip">${item}</span>`)
    .join("");

  els.simulationBrief.innerHTML = `
    <div class="simulation-hero">
      <div class="simulation-prediction">
        <p class="eyebrow">Prediction</p>
        <p class="prediction-text">${result.prediction || "No prediction"}</p>
      </div>
      <div class="simulation-metrics">
        <article class="metric-card">
          <span class="metric-label">Confidence</span>
          <strong>${result.confidence ?? "n/a"}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Provider mode</span>
          <strong>${providerLabel}</strong>
        </article>
      </div>
    </div>
    <div class="simulation-detail-grid">
      <section class="detail-panel">
        <h3>Reasoning</h3>
        <div class="reason-list">${reasoning || "<div>No reasoning returned.</div>"}</div>
      </section>
      <section class="detail-panel">
        <h3>Caveats</h3>
        <div class="caveat-list">${caveats || "<div>No caveats returned.</div>"}</div>
      </section>
      <section class="detail-panel">
        <h3>Alternatives</h3>
        <div class="alt-chip-row">${alternatives || '<span class="alt-chip">No alternatives</span>'}</div>
      </section>
    </div>
  `;
}

async function loadProviderStatus() {
  const result = await request("/v1/pson/provider/status");
  state.providerStatus = result.data;
  els.providerName.textContent = result.data.provider || "Not configured";
  els.providerModel.textContent = result.data.model || "No model";
  setPre(els.providerOutput, result.data);
  syncStatusStrip();
}

async function loadProviderPolicy() {
  if (!state.profileId) {
    setEmpty(els.providerOutput, "Load a profile before checking provider policy.");
    return;
  }

  const result = await request(
    `/v1/pson/provider/status?profile_id=${encodeURIComponent(state.profileId)}&operation=simulation`
  );
  setPre(els.providerOutput, result.data);
}

async function loadState(profileId) {
  const stateSnapshot = await request(`/v1/pson/state/${profileId}`);
  setPre(els.stateOutput, stateSnapshot.data);
}

async function loadGraph(profileId) {
  const graph = await request(`/v1/pson/graph/${profileId}`);
  renderGraph(graph.data);
}

async function loadProfile(profileId) {
  const profileResponse = await request(`/v1/pson/profile/${profileId}`);
  const profile = profileResponse.data;
  state.profileId = profileId;
  state.profile = profile;
  els.profileId.value = profileId;
  syncStatusStrip();
  renderSummary(profile);
  setPre(els.observedOutput, profile.layers.observed);
  setPre(els.inferredOutput, profile.layers.inferred);
  setPre(els.privacyOutput, {
    consent: profile.consent,
    privacy: profile.privacy
  });
  await Promise.all([loadState(profileId), loadGraph(profileId)]);
}

async function runExport(level) {
  if (!state.profileId) {
    setEmpty(els.exportOutput, "Load a profile before exporting.");
    return;
  }

  const result = await request(
    `/v1/pson/export?profile_id=${encodeURIComponent(state.profileId)}&redaction_level=${encodeURIComponent(level)}`
  );
  setPre(els.exportOutput, result);
}

function activateTab(targetId) {
  for (const tab of els.tabs) {
    tab.classList.toggle("active", tab.dataset.target === targetId);
  }

  for (const pane of els.panes) {
    pane.classList.toggle("active", pane.id === targetId);
  }
}

async function bootstrapConfig() {
  try {
    const saved = localStorage.getItem("pson5_api_base");
    const config = await fetch("/config.json").then((response) => response.json());
    state.apiBase = saved || "/api";
    els.apiOrigin.value = saved || config.apiOrigin || "/api";
    els.configStatus.textContent = `Using ${state.apiBase}`;
  } catch {
    state.apiBase = "/api";
    els.apiOrigin.value = "/api";
    els.configStatus.textContent = "Defaulting to /api";
  }

  syncStatusStrip();
  await loadProviderStatus();
}

els.saveConfig.addEventListener("click", async () => {
  state.apiBase = els.apiOrigin.value.trim() || "/api";
  localStorage.setItem("pson5_api_base", state.apiBase);
  els.configStatus.textContent = `Using ${state.apiBase}`;
  syncStatusStrip();
  await loadProviderStatus();
});

els.refreshProvider.addEventListener("click", async () => {
  await loadProviderStatus();
});

els.checkProviderPolicy.addEventListener("click", async () => {
  await loadProviderPolicy();
});

els.exportSafe.addEventListener("click", async () => {
  await runExport("safe");
});

els.exportFull.addEventListener("click", async () => {
  await runExport("full");
});

els.initForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    user_id: els.newUserId.value.trim(),
    domains: parseCsv(els.newDomains.value),
    depth: els.newDepth.value
  };

  const result = await request("/v1/pson/init", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  await loadProfile(result.data.profile_id);
});

els.loadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!els.profileId.value.trim()) {
    return;
  }

  await loadProfile(els.profileId.value.trim());
});

els.refreshProfile.addEventListener("click", async () => {
  if (!state.profileId) {
    return;
  }

  await loadProfile(state.profileId);
});

els.questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.profileId) {
    setEmpty(els.questionOutput, "Load a profile before requesting questions.");
    return;
  }

  const payload = {
    profile_id: state.profileId,
    session_id: state.sessionId || undefined,
    domains: parseCsv(els.questionDomains.value),
    depth: els.questionDepth.value || undefined,
    limit: 1
  };

  const result = await request("/v1/pson/question/next", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.sessionId = result.data.session?.session_id || result.data.session_id;
  syncStatusStrip();
  renderQuestionCard(result.data);
  setPre(els.questionOutput, result.data);

  const question = result.data.questions?.[0] ?? null;
  if (question) {
    els.answerQuestionId.value = question.id;
  }
});

els.answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.profileId) {
    setEmpty(els.questionOutput, "Load a profile before submitting answers.");
    return;
  }

  const payload = {
    profile_id: state.profileId,
    session_id: state.sessionId || undefined,
    answers: [
      {
        question_id: els.answerQuestionId.value.trim(),
        value: els.answerValue.value.trim()
      }
    ],
    options: {
      return_next_questions: true,
      next_question_limit: 1
    }
  };

  const result = await request("/v1/pson/learn", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.sessionId = result.data.session?.session_id || result.data.session_id;
  syncStatusStrip();
  renderQuestionCard(result.data);
  setPre(els.questionOutput, { latest_learn_result: result.data });

  const nextQuestion = result.data.next_questions?.[0];
  if (nextQuestion) {
    els.answerQuestionId.value = nextQuestion.id;
  }

  els.answerValue.value = "";
  await loadProfile(state.profileId);
});

els.simulateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.profileId) {
    setEmpty(els.simulationOutput, "Load a profile before running simulations.");
    return;
  }

  const payload = {
    profile_id: state.profileId,
    context: {
      task: els.simulateTask.value.trim(),
      deadline_days: Number(els.simulateDeadline.value),
      difficulty: els.simulateDifficulty.value
    },
    domains: parseCsv(els.simulateDomains.value),
    options: {
      include_reasoning: true,
      include_evidence: true,
      explanation_level: "detailed"
    }
  };

  const result = await request("/v1/pson/simulate", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  setPre(els.simulationOutput, result.data);
  renderSimulation(result.data);
  if (result.data.prediction) {
    els.predictionId.value = result.data.prediction;
  }
});

els.agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.profileId) {
    setEmpty(els.agentOutput, "Load a profile before building agent context.");
    return;
  }

  const result = await request("/v1/pson/agent-context", {
    method: "POST",
    body: JSON.stringify({
      profile_id: state.profileId,
      intent: els.agentIntent.value.trim() || "general_assistance",
      include_predictions: true,
      max_items: 12
    })
  });

  setPre(els.agentOutput, result.data);
});

els.explainForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.profileId || !els.predictionId.value.trim()) {
    setEmpty(els.explainOutput, "Load a profile and enter a prediction.");
    return;
  }

  const result = await request(
    `/v1/pson/explain?profile_id=${encodeURIComponent(state.profileId)}&prediction=${encodeURIComponent(
      els.predictionId.value.trim()
    )}`
  );

  setPre(els.explainOutput, result.data);
});

for (const tab of els.tabs) {
  tab.addEventListener("click", () => activateTab(tab.dataset.target));
}

bootstrapConfig();
