# `@pson5/state-engine`

Dynamic state derivation for PSON5 profiles.

## Install

```bash
npm install @pson5/state-engine
```

## Usage

```ts
import { deriveStateProfile, getActiveStateSnapshot } from "@pson5/state-engine";

const nextProfile = deriveStateProfile(profile);
const snapshot = getActiveStateSnapshot(nextProfile);
```

## Primary Exports

- `deriveStateProfile(...)`
- `getActiveStateSnapshot(...)`
