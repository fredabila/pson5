# `@pson5/acquisition-engine`

Question registry, next-question flow, and answer submission helpers for PSON5.

## Install

```bash
npm install @pson5/acquisition-engine
```

## Usage

```ts
import { getNextQuestions, submitLearningAnswers } from "@pson5/acquisition-engine";

const next = await getNextQuestions("pson_123", { limit: 1 });

const learned = await submitLearningAnswers({
  profile_id: "pson_123",
  session_id: next.session.session_id,
  answers: [
    {
      question_id: next.questions[0].id,
      value: "plan_first"
    }
  ]
});
```

## Primary Exports

- `getBuiltInQuestionRegistry()`
- `getQuestionsForDomains(...)`
- `getNextQuestions(...)`
- `submitLearningAnswers(...)`
