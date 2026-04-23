# `@pson5/cli`

Interactive terminal interface for PSON5.

## Install

```bash
npm install -g @pson5/cli
```

## Usage

```bash
pson console --store .pson5-store
```

The default `console` command now targets the Ink-based terminal UI.

## Useful Commands

- `pson init <userId>`
- `pson question-next <profileId>`
- `pson learn <profileId> <questionId> <value>`
- `pson simulate <profileId> --context "{...}"`
- `pson agent-context <profileId> --intent tutoring`
- `pson provider-status`
- `pson neo4j-status`
- `pson neo4j-sync <profileId>`

## Console Mode

The interactive console provides:

- Ink-based split-pane layout
- animated cognition panel
- slash-command autocomplete
- staged question answering
- formatted simulation output
- formatted agent-context output
- Neo4j status and sync commands
