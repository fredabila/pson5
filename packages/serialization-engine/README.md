# `@pson5/serialization-engine`

Creation, validation, import/export, and storage-adapter runtime for PSON5 profiles.

## Install

```bash
npm install @pson5/serialization-engine
```

## Usage

```ts
import { initProfile, loadProfile, exportStoredProfile } from "@pson5/serialization-engine";

const profile = await initProfile({
  user_id: "user_123",
  domains: ["core"]
});

const loaded = await loadProfile(profile.profile_id);
const exported = await exportStoredProfile(profile.profile_id, { redaction_level: "safe" });
```

## Primary Exports

- `initProfile(...)`
- `loadProfile(...)`
- `loadProfileByUserId(...)`
- `findProfilesByUserId(...)`
- `exportStoredProfile(...)`
- `importProfileDocument(...)`
- `createMemoryProfileStoreAdapter()`
- `createDocumentProfileStoreAdapter(...)`
