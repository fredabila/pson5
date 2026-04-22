# `@pson5/graph-engine`

Knowledge graph and explainability helpers for PSON5.

## Install

```bash
npm install @pson5/graph-engine
```

## Usage

```ts
import { deriveKnowledgeGraph, explainPredictionSupport } from "@pson5/graph-engine";

const nextProfile = deriveKnowledgeGraph(profile);
const support = explainPredictionSupport(nextProfile, "delayed_start");
```

## Primary Exports

- `deriveKnowledgeGraph(...)`
- `explainPredictionSupport(...)`
