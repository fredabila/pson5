# Publishing

## Publishable Packages

The current publishable workspace targets are:

- `@pson5/core-types`
- `@pson5/schemas`
- `@pson5/privacy`
- `@pson5/serialization-engine`
- `@pson5/provider-engine`
- `@pson5/modeling-engine`
- `@pson5/state-engine`
- `@pson5/graph-engine`
- `@pson5/simulation-engine`
- `@pson5/acquisition-engine`
- `@pson5/agent-context`
- `@pson5/sdk`
- `@pson5/postgres-store`
- `@pson5/cli`

## Prepublish Checks

Run:

```powershell
npm install
npm run ci
npm run pack:publishable
```

## NPM Access

Scoped packages use public access:

```powershell
npm publish --access public --workspace @pson5/sdk
```

## Release Notes

Before publishing:

- update package versions
- update affected package READMEs
- update top-level docs for changed public behavior
- confirm the docs site still reflects current usage

## Recommended Next Improvement

If you want automated versioning, add a dedicated release-management layer such as Changesets or Release Please on top of the current workflow.
