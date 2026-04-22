# `@pson5/privacy`

Privacy, consent, redaction, and provider-safety helpers for PSON5.

## Install

```bash
npm install @pson5/privacy
```

## Usage

```ts
import { redactProfileForExport, getProviderPolicyDecision } from "@pson5/privacy";

const safeProfile = redactProfileForExport(profile, "safe");
const decision = getProviderPolicyDecision(profile, "simulation");
```

## Primary Exports

- `evaluateScopes(...)`
- `getRequiredProviderScopes(...)`
- `getProviderPolicyDecision(...)`
- `sanitizeProfileForProvider(...)`
- `redactProfileForExport(...)`
