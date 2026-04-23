# CLI Reference

> Complete reference for the `pson` CLI (`@pson5/cli`). Every command, every flag, every exit code.

## Install

```bash
npm install -g @pson5/cli
# or run from the monorepo:
npm run dev:cli -- <command>
```

The CLI ships as `pson` on `PATH`. All commands write machine-readable JSON to stdout by default; `--json` wraps that in a success envelope.

## Global flags

| Flag | Purpose |
| --- | --- |
| `--json` | Wraps stdout in `{ success: true, data }` on success and `{ success: false, error: { code, message } }` on failure. Exit code is still non-zero on error. |
| `--store <dir>` | Root of the PSON5 store (default `.pson5-store`). |

Unless noted, every command accepts `--store`.

## Output modes

- **Default mode** — commands print pretty JSON to stdout; errors print a message to stderr; exit code is 0 on success, 1 on error.
- **`--json` mode** — single-line JSON envelope on stdout for both success and error; stderr is empty.

Example:

```bash
$ pson init user_123 --store .pson5-store
{
  "profile_id": "pson_1776913414584",
  "revision": 1,
  "store_root": ".pson5-store",
  "current_path": ".pson5-store/profiles/pson_1776913414584/current.json"
}

$ pson init user_123 --store .pson5-store --json
{"success":true,"data":{"profile_id":"pson_1776913414584","revision":1,...}}
```

---

## Profiles

### `pson init <userId>`
Create and persist a minimal `.pson` profile.

```bash
pson init user_123 --store .pson5-store
```

### `pson inspect <profileId>`
Load and print the full stored profile.

```bash
pson inspect pson_123 --store .pson5-store
```

### `pson inspect-user <userId>`
Load the latest profile mapped to a user id and print it alongside the full `profile_ids` list.

```bash
pson inspect-user user_123 --store .pson5-store
```

### `pson export <profileId> [--redaction <full|safe>]`
Export the serialized `.pson` document. Redaction defaults to adapter default (`full`); pass `--redaction safe` for a redacted variant.

```bash
pson export pson_123 --redaction safe --store .pson5-store > profile.pson.json
```

### `pson import <file> [--overwrite]`
Import a `.pson` JSON file. Fails with `conflict` if the profile id already exists unless `--overwrite` is passed.

```bash
pson import profile.pson.json --store .pson5-store
pson import profile.pson.json --overwrite --store .pson5-store
```

### `pson validate <file>`
Validate a file against the `.pson` schema without persisting it. Exit code 1 on validation failure.

```bash
pson validate profile.pson.json
```

---

## Learning

### `pson question-next <profileId> [--session <id>] [--domains <csv>] [--depth <level>] [--limit <n>]`
Fetch the next adaptive question(s) for a session. Opens a new session if `--session` is omitted.

```bash
pson question-next pson_123 --domains core,education --limit 1 --store .pson5-store
```

Response includes `session.fatigue_score`, `session.confidence_gaps`, `session.contradiction_flags`, and `session.stop_reason` alongside the selected questions.

### `pson learn <profileId> <questionId> <value> [--session <id>] [--domains <csv>] [--depth <level>]`
Submit a single answer. Runs the full pipeline (modeling → state → graph → save) and bumps the revision.

```bash
pson learn pson_123 core_deadline_effect mixed --session learn_... --store .pson5-store
```

---

## Simulation

### `pson simulate <profileId> --context <json> [--domains <csv>]`
Run a scenario simulation against the stored profile. `--context` must be a JSON object; the content is application-specific.

```bash
pson simulate pson_123 \
  --context '{"task":"study for exam","deadline_days":2,"difficulty":"high"}' \
  --domains core,education \
  --store .pson5-store
```

Response includes `prediction`, `confidence`, `reasoning`, `evidence`, `caveats`, `alternatives`, `context_hash`, `cached`, and `provider` metadata.

---

## Agent context

### `pson agent-context <profileId> --intent <text> [--domains <csv>] [--max-items <n>] [--min-confidence <n>] [--include-predictions]`
Build the standardized agent projection for the profile.

```bash
pson agent-context pson_123 \
  --intent "help the user plan a deadline-sensitive task" \
  --include-predictions \
  --max-items 6 \
  --min-confidence 0.6 \
  --store .pson5-store
```

The returned context includes `redaction_notes` explaining any filtered fields (`restricted_field`, `low_confidence`, `consent_not_granted`).

---

## State, graph, explain

### `pson state <profileId>`
Print the active state snapshot with decay applied and triggers evaluated.

```bash
pson state pson_123 --store .pson5-store
```

### `pson graph <profileId>`
Print `profile.knowledge_graph` (nodes + edges).

```bash
pson graph pson_123 --store .pson5-store
```

### `pson explain <profileId> <prediction>`
Return path-formatted support strings for a prediction.

```bash
pson explain pson_123 delayed_start --store .pson5-store
```

---

## Provider

### `pson provider-status`
Print the current provider configuration as resolved from env + stored config.

```bash
pson provider-status
```

### `pson provider-config`
Print the stored provider config summary (without the API key).

```bash
pson provider-config --store .pson5-store
```

### `pson provider-set <openai|anthropic> --api-key <key> [--model <name>] [--base-url <url>] [--timeout-ms <n>]`
Save a provider config to `<store>/config/provider.json`.

```bash
pson provider-set openai --api-key sk-... --model gpt-4.1-mini --store .pson5-store
```

### `pson provider-wizard`
Interactive Clack-based setup flow.

```bash
pson provider-wizard --store .pson5-store
```

### `pson provider-clear`
Remove the stored provider config.

```bash
pson provider-clear --store .pson5-store
```

### `pson provider-policy <profileId> <modeling|simulation>`
Check whether provider-backed modeling or simulation is allowed for a given profile.

```bash
pson provider-policy pson_123 simulation --store .pson5-store
```

---

## Neo4j

### `pson neo4j-status`
Check connectivity and configuration.

```bash
pson neo4j-status --store .pson5-store
```

### `pson neo4j-config`
Print the stored Neo4j config summary (without the password).

```bash
pson neo4j-config --store .pson5-store
```

### `pson neo4j-set --uri <uri> --username <user> --password <password> [--database <name>] [--disabled]`
Save a Neo4j connection to `<store>/config/neo4j.json`.

```bash
pson neo4j-set --uri neo4j+s://... --username neo4j --password *** --store .pson5-store
```

### `pson neo4j-wizard`
Interactive Clack-based setup flow.

```bash
pson neo4j-wizard --store .pson5-store
```

### `pson neo4j-clear`
Remove the stored Neo4j config.

```bash
pson neo4j-clear --store .pson5-store
```

### `pson neo4j-sync <profileId>`
Sync the profile's knowledge graph to Neo4j. Idempotent — previous profile-scoped nodes are replaced on each sync.

```bash
pson neo4j-sync pson_123 --store .pson5-store
```

---

## Consoles

### `pson console [--profile <id>]`
Start the Ink/React interactive console (default). Provides slash commands, live state, and a session-aware workflow. See [CLI Console](./cli-console.md) for the command palette.

```bash
pson console --store .pson5-store --profile pson_123
```

### `pson console-legacy [--profile <id>]`
Start the legacy readline console (kept for automation that depends on the older scripted flow).

```bash
pson console-legacy --store .pson5-store
```

### `pson mcp-stdio`
Start a local MCP server over stdio. Exposes the PSON5 agent tools to any MCP-speaking framework.

```bash
pson mcp-stdio --store .pson5-store
```

Supported JSON-RPC methods: `initialize`, `ping`, `tools/list`, `tools/call`.

---

## Help and version

### `pson --help`, `pson help`, `pson -h`, or `pson <command> --help`
Print usage for the top-level CLI or a specific command.

### `pson --version` or `pson -v`
Print the CLI's version.

---

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | Any failure — surface the stderr message (or `--json` error envelope) for details. |

Future versions may introduce finer exit codes for typed error categories (`validation_error`, `profile_not_found`, `conflict`, etc.). Until then, branch on the `error.code` field when using `--json`.

---

## Flag conventions

Across all commands:

- `--store <dir>` — root of the profile store. Defaults to `.pson5-store` in the current directory.
- `--session <id>` — reuse an existing learning session id.
- `--profile <id>` — seed the console with a specific profile.
- `--domains <csv>` — comma-separated domain ids.
- `--depth <light|standard|deep>` — learning depth.
- `--limit <n>` — how many items to return from a paginated call.
- `--json` — machine-readable envelope.
- `--overwrite`, `--disabled`, `--include-predictions` — boolean flags.

All string values are read as UTF-8. JSON flags (`--context`) expect a single valid JSON argument — quote it for your shell.

## Related docs

- [CLI Console](./cli-console.md) — the interactive Ink console and its slash commands.
- [Agent Tools](./agent-tools.md) — the tool contract that `mcp-stdio` exposes.
- [SDK Usage](./sdk-usage.md) — the SDK that every command wraps.
