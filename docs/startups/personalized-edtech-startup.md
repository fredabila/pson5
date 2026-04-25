# Building a Personalized EdTech Startup with PSON5

This is a complete product blueprint for an EdTech company using PSON5 as its personalization layer.

Example startup:

> A tutoring platform that adapts explanations, practice sets, pacing, reminders, and intervention strategy to each learner.

## Product Surfaces

- AI tutor chat.
- Lesson planner.
- Adaptive practice generator.
- Parent/teacher progress summary.
- Study schedule coach.
- Intervention recommender.

## Core Data Model

Use one PSON profile per learner:

```ts
await pson.ensureProfile({
  user_id: learner.id,
  tenant_id: schoolOrOrg.id,
  domains: ["core", "education"],
  depth: "standard"
});
```

Recommended education-domain observed facts:

- `grade_band`
- `current_subjects`
- `learning_goal`
- `preferred_explanation_style`
- `prefers_visual_examples`
- `prefers_step_by_step`
- `practice_tolerance`
- `frustration_signals`
- `motivation_drivers`
- `assessment_anxiety`
- `schedule_constraints`
- `accessibility_needs`

## First Session Flow

1. Create or load learner profile.
2. Ask two low-friction onboarding questions.
3. Build agent context for the first tutoring task.
4. Generate response.
5. Observe explicit preferences the learner states.
6. After the session, summarize safe facts into PSON.

```ts
const profile = await pson.ensureProfile({
  user_id: learner.id,
  tenant_id: org.id,
  domains: ["core", "education"],
  depth: "light"
});

const questions = await pson.getNextQuestions(profile.profile_id, {
  domains: ["education"],
  depth: "light",
  limit: 2
});

const context = await pson.getAgentContext(profile.profile_id, {
  intent: "Start a tutoring session for algebra basics.",
  domains: ["education", "core"],
  include_predictions: true,
  max_items: 10
});
```

## AI Tutor Chat Pattern

Before every model call:

```ts
const psonContext = await pson.getAgentContext(profileId, {
  intent: learnerMessage,
  domains: ["education", "core"],
  include_predictions: true,
  max_items: 16,
  task_context: {
    product_surface: "ai_tutor",
    current_subject: "algebra",
    current_skill: "two_step_equations"
  }
});
```

System prompt:

```text
You are an adaptive tutor.
Use the PSON context to personalize explanation style, pacing, examples, and encouragement.
Do not reveal private profile details.
Treat inferred and simulated items as uncertain.
If the learner states a durable preference, call pson_observe_fact.
If you need to know something important and the learner opted into setup, call pson_get_next_questions.
```

## Practice Generator Pattern

Use PSON context to adjust:

- Difficulty ramp.
- Hint granularity.
- Number of problems.
- Worked-example ratio.
- Feedback tone.
- Visual vs symbolic examples.

```ts
const context = await pson.getAgentContext(profileId, {
  intent: "Generate a 10-minute practice set for factoring quadratics.",
  domains: ["education"],
  task_context: {
    time_budget_minutes: 10,
    target_skill: "factoring_quadratics"
  }
});
```

## Simulation Use Cases

Call simulation when you are choosing between interventions:

```ts
const policy = await pson.getProviderPolicy(profileId, "simulation");

if (policy.allowed) {
  const sim = await pson.simulate({
    profile_id: profileId,
    domains: ["education"],
    context: {
      scenario: "The learner has failed three practice questions in a row.",
      options: [
        "Give a full worked example",
        "Ask a guiding question",
        "Switch to a visual analogy",
        "Recommend a short break"
      ],
      question: "Which intervention is most likely to keep the learner engaged?"
    }
  });
}
```

## Teacher Dashboard Pattern

Do not show raw inferred/simulated data without labels. Use safe summaries:

- Observed preferences confirmed by learner.
- Inferred patterns with confidence.
- Recent state signals.
- Suggested next interventions.
- Redaction notes when data is withheld.

```ts
const teacherContext = await pson.getAgentContext(profileId, {
  intent: "Summarize learner support needs for a teacher.",
  domains: ["education"],
  include_predictions: false,
  min_confidence: 0.6
});
```

## Startup Architecture

```text
Web/mobile app
  -> App backend auth
  -> PSON SDK
  -> Postgres profile store
  -> Optional provider engine
  -> LLM provider

Admin/teacher dashboard
  -> App backend
  -> PSON agent context
  -> Redacted summaries

ChatGPT app or external agent
  -> PSON HTTP MCP endpoint
  -> Same profile store
```

## MVP Scope

Week 1:

- User auth and learner IDs.
- PSON profile creation.
- Agent context before tutor response.
- Observe explicit learning preferences.
- Safe profile export.

Week 2:

- Structured onboarding questions.
- Practice generator personalization.
- Provider policy checks.
- Simulation for intervention choice.

Week 3:

- Teacher dashboard.
- Postgres storage.
- Tenant enforcement.
- Audit review tooling.

Week 4:

- Domain modules for education.
- School/org admin controls.
- Consent and data deletion flows.
- Evaluation dataset for personalization quality.

## Production Configuration

```bash
PSON_STORE_BACKEND=postgres
DATABASE_URL=postgres://...

PSON_API_KEY=...
PSON_ENFORCE_TENANT=true
PSON_ENFORCE_SUBJECT_USER=true
PSON_DEFAULT_API_KEY_ROLE=editor

PSON_AI_PROVIDER=openai
OPENAI_API_KEY=...
PSON_AI_MODEL=gpt-4.1-mini
PSON_AI_TIMEOUT_MS=20000

PSON_ACCESS_AUDIT_ENABLED=true
```

## Privacy and Safety

Required product controls:

- Learner/guardian consent.
- Explain what is remembered and why.
- One-click profile export.
- One-click profile deletion.
- Restricted fields for sensitive data.
- Tenant isolation for schools.
- No unlabelled inference in teacher-facing reports.
- No storage of medical/diagnostic guesses as observed facts.

## Success Metrics

Measure:

- Completion rate of practice sessions.
- Time-to-first-helpful-answer.
- Hint acceptance rate.
- Follow-up question rate.
- Learner-reported usefulness.
- Teacher override rate.
- Personalization correction rate.

Do not optimize only for engagement. Track correctness, learner autonomy, and privacy outcomes.

