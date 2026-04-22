# Contributing

## Scope

PSON5 is building:

- a profile standard
- a set of TypeScript engines
- SDK and agent integration layers
- CLI and API surfaces
- a documentation experience

Changes should preserve that platform direction rather than solving only one local use case.

## Before You Start

1. Read [README.md](/C:/Users/user/pson5/README.md).
2. Read the relevant docs under [docs/](/C:/Users/user/pson5/docs).
3. Run:

```powershell
npm install
npm run check
npm run build
```

## Repository Conventions

- TypeScript is the default implementation language.
- Keep public contracts explicit and version-aware.
- Prefer additive changes over silent breaking changes.
- Treat privacy, consent, and access-control behavior as product requirements, not optional polish.
- For package code, keep runtime dependencies minimal and prefer Node built-ins when practical.

## Pull Requests

- Keep PRs focused.
- Document user-visible or API-visible changes.
- Add or update docs when behavior changes.
- Include validation steps you ran.

## Release Expectations

If you change a publishable package, update:

- package metadata if needed
- the package README
- any top-level docs affected by the change

## Quality Bar

Contributions should leave the workspace passing:

```powershell
npm run check
npm run build
```

For storage changes, also run:

```powershell
npm run test:storage
npm run test:postgres-store
```
