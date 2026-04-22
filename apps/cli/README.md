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

## Useful Commands

- `pson init <userId>`
- `pson question-next <profileId>`
- `pson learn <profileId> <questionId> <value>`
- `pson simulate <profileId> --context "{...}"`
- `pson agent-context <profileId> --intent tutoring`
- `pson provider-status`

## Console Mode

The interactive console provides:

- staged question answering
- formatted simulation output
- formatted agent-context output
- slash-command workflow for profile operations
