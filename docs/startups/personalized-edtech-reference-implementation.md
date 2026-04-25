# Personalized EdTech Reference Implementation

This is a concrete implementation guide for a startup building an adaptive learning product with PSON5.

## Product Definition

The product has four user-facing surfaces:

- Learner AI tutor.
- Adaptive practice generator.
- Teacher insight dashboard.
- Guardian/learner data controls.

PSON5 owns the learner personalization profile. Your application owns auth, classrooms, assignments, billing, and UI.

## Domain Model

```ts
interface Learner {
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
}

interface TutorTurn {
  learner_id: string;
  assignment_id?: string;
  message: string;
}
```

PSON profile identity:

```ts
const psonUserId = learner.id;
const tenantId = learner.school_id;
```

## Profile Initialization

```ts
const profile = await pson.ensureProfile(
  {
    user_id: learner.id,
    tenant_id: learner.school_id,
    domains: ["core", "education"],
    depth: "standard"
  },
  psonStore
);
```

Immediately observe facts your product already knows and is allowed to store:

```ts
await pson.observeFact({
  profile_id: profile.profile_id,
  domain: "education",
  key: "grade_band",
  value: learner.grade_band,
  confidence: 1,
  note: "Imported from learner account settings."
}, psonStore);
```

## Learner Onboarding Questions

Ask only a small number on day one.

```ts
const onboarding = await pson.getNextQuestions(
  profile.profile_id,
  {
    domains: ["education", "core"],
    depth: "light",
    limit: 3
  },
  psonStore
);
```

When the learner answers:

```ts
await pson.learn(
  {
    profile_id: profile.profile_id,
    session_id: onboarding.session.session_id,
    answers: [
      { question_id: "education_learning_preference", value: "worked_examples" },
      { question_id: "core_explanation_preference", value: "step_by_step" }
    ],
    options: {
      return_next_questions: false,
      next_question_limit: 0
    }
  },
  psonStore
);
```

## AI Tutor Route

```ts
export async function tutorTurn(input: {
  learner: Learner;
  assignment?: Assignment;
  message: string;
}) {
  const profile = await pson.ensureProfile(
    {
      user_id: input.learner.id,
      tenant_id: input.learner.school_id,
      domains: ["core", "education"],
      depth: "standard"
    },
    psonStore
  );

  const context = await pson.getAgentContext(
    profile.profile_id,
    {
      intent: input.message,
      domains: ["education", "core"],
      include_predictions: true,
      max_items: 20,
      min_confidence: 0.35,
      task_context: {
        surface: "ai_tutor",
        subject: input.assignment?.subject,
        skill: input.assignment?.skill,
        due_at: input.assignment?.due_at
      }
    },
    psonStore
  );

  return runTutorModel({
    learnerMessage: input.message,
    psonContext: context,
    assignment: input.assignment
  });
}
```

## Tutor Prompt

```text
You are an adaptive tutor.

Use PSON context to personalize:
- explanation style
- pacing
- examples
- amount of scaffolding
- encouragement style
- whether to ask a guiding question or show a worked example

Rules:
- Do not reveal raw profile contents.
- Do not mention inferred traits unless the learner asks why.
- Treat simulated predictions as uncertain.
- If the learner explicitly states a preference, call pson_observe_fact.
- Do not store diagnoses, medical claims, or sensitive assumptions as observed facts.
- Do not give the final answer immediately unless the learner asks for it.
```

## Practice Generator

```ts
export async function generatePractice(input: {
  learner: Learner;
  subject: string;
  skill: string;
  minutes: number;
}) {
  const profile = await pson.ensureProfile({
    user_id: input.learner.id,
    tenant_id: input.learner.school_id,
    domains: ["education", "core"],
    depth: "standard"
  }, psonStore);

  const context = await pson.getAgentContext(profile.profile_id, {
    intent: `Generate ${input.minutes} minutes of practice for ${input.skill}.`,
    domains: ["education", "core"],
    include_predictions: true,
    max_items: 16,
    task_context: {
      surface: "practice_generator",
      subject: input.subject,
      skill: input.skill,
      time_budget_minutes: input.minutes
    }
  }, psonStore);

  return runPracticeModel({
    psonContext: context,
    subject: input.subject,
    skill: input.skill,
    minutes: input.minutes
  });
}
```

## Intervention Simulation

Run this when the platform detects struggle.

```ts
export async function chooseIntervention(input: {
  learner: Learner;
  profileId: string;
  recentEvents: Array<{ type: string; detail: string }>;
}) {
  const policy = await pson.getProviderPolicy(input.profileId, "simulation", psonStore);
  if (!policy.allowed) {
    return {
      mode: "rules",
      intervention: "Ask a guiding question and offer a worked example if the learner asks.",
      policy
    };
  }

  return pson.simulate({
    profile_id: input.profileId,
    domains: ["education", "core"],
    context: {
      scenario: "Learner appears stuck during an active practice session.",
      recent_events: input.recentEvents,
      options: [
        "show worked example",
        "ask guiding question",
        "switch to visual analogy",
        "reduce difficulty",
        "recommend short break"
      ],
      question: "Which intervention is most likely to preserve confidence and learning progress?"
    },
    options: {
      include_reasoning: true,
      include_evidence: true,
      explanation_level: "standard"
    }
  }, psonStore);
}
```

## Teacher Dashboard Query

```ts
export async function getTeacherLearnerSummary(input: {
  teacherId: string;
  learner: Learner;
  profileId: string;
}) {
  await assertTeacherCanAccessLearner(input.teacherId, input.learner.id);

  const context = await pson.getAgentContext(input.profileId, {
    intent: "Prepare a privacy-safe teacher summary for supporting this learner.",
    domains: ["education"],
    include_predictions: false,
    min_confidence: 0.55,
    max_items: 20,
    task_context: {
      surface: "teacher_dashboard"
    }
  }, psonStore);

  return {
    learner_id: input.learner.id,
    observed_preferences: context.personal_data.preferences.filter((item) => item.source === "observed"),
    inferred_patterns: context.personal_data.behavioral_patterns.filter((item) => item.source === "inferred"),
    redaction_notes: context.redaction_notes
  };
}
```

## Memory Write Policy

Store:

- "I understand better with diagrams."
- "I need a slower pace."
- "I get anxious before timed quizzes."
- "I prefer examples about sports."

Do not store as observed facts:

- "The learner probably has ADHD."
- "The learner is lazy."
- "The learner is bad at math."
- "The learner's home environment is unstable."

If the system needs those ideas, keep them as provisional model reasoning and do not write them to PSON observed facts.

## Consent Model

Recommended product controls:

- Learner/guardian opt-in for personalization.
- Separate toggle for AI-backed simulation.
- Export profile button.
- Delete profile button.
- "What do you remember about me?" screen.
- Teacher access audit.
- School tenant isolation.

Required profile scopes for AI-backed simulation:

```json
{
  "consent": {
    "granted": true,
    "scopes": ["ai:use", "ai:simulation"]
  }
}
```

## Deployment Checklist

```bash
PSON_STORE_BACKEND=postgres
DATABASE_URL=postgres://...
PSON_ENFORCE_TENANT=true
PSON_ENFORCE_SUBJECT_USER=true
PSON_ACCESS_AUDIT_ENABLED=true

PSON_AI_PROVIDER=openai
OPENAI_API_KEY=...
PSON_AI_MODEL=gpt-4.1-mini
```

Before launch:

- Test learner A cannot read learner B profile.
- Test school A cannot read school B profile.
- Test provider policy denial when consent scopes are missing.
- Test safe export redacts sensitive data.
- Test deletion removes profile and audit linkability according to your retention policy.
- Test teacher summary never displays raw simulated predictions as fact.

