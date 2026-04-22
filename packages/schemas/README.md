# `@pson5/schemas`

Schema validation helpers for PSON5 profile documents.

## Install

```bash
npm install @pson5/schemas
```

## Usage

```ts
import { validatePsonProfile } from "@pson5/schemas";

const result = validatePsonProfile(input);

if (!result.success) {
  console.error(result.issues);
}
```

## Primary Export

- `validatePsonProfile(input)`
