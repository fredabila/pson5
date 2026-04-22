# `@pson5/modeling-engine`

Rules-first inference engine for deriving traits and heuristics from observed profile data.

## Install

```bash
npm install @pson5/modeling-engine
```

## Usage

```ts
import { deriveInferredProfile, getModeledFieldPaths } from "@pson5/modeling-engine";

const nextProfile = deriveInferredProfile(profile);
const changedFields = getModeledFieldPaths(nextProfile);
```

## Primary Exports

- `deriveInferredProfile(...)`
- `getModeledFieldPaths(...)`
