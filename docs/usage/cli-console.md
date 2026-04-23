# CLI Console

PSON5 now exposes three CLI surfaces:

- one-shot scripting commands such as `init`, `learn`, `simulate`, and `agent-context`
- an interactive terminal console started with `pson console`
- a local stdio MCP transport started with `pson mcp-stdio`

The console is intended to feel like an operator workspace, not a raw REPL. It keeps a live dashboard on screen with:

- Ink-based split panes
- an animated cognition panel
- session, provider, and profile status
- slash-command autocomplete
- a staged question card
- a main view pane for the last operation
- a recent activity feed

Provider setup can now be handled inside PSON instead of shell env setup every session:

```powershell
npm run dev --workspace @pson5/cli -- provider-set openai --api-key YOUR_KEY --model gpt-4.1-mini --store C:\Users\user\pson5\.pson5-store
```

Neo4j setup can also be handled inside the CLI:

```powershell
npm run dev --workspace @pson5/cli -- neo4j-wizard --store C:\Users\user\pson5\.pson5-store
```

## Start

From the repo root:

```powershell
npm run build --workspace @pson5/cli
npm run dev --workspace @pson5/cli -- console --store C:\Users\user\pson5\.pson5-store
```

To start with a profile already loaded:

```powershell
npm run dev --workspace @pson5/cli -- console --store C:\Users\user\pson5\.pson5-store --profile <profileId>
```

For local MCP clients:

```powershell
npm run dev --workspace @pson5/cli -- mcp-stdio --store C:\Users\user\pson5\.pson5-store
```

## First Use

Start the console, then follow this exact sequence:

```text
/init alice
/next
reading
/next
delay_start
/simulate study for exam with 2 days left
/agent-context tutoring
```

The important behavior is this:

- when a question is staged, plain text input is treated as the answer
- Tab autocompletes slash commands
- up/down walks command history
- the screen updates after each action, so the main pane becomes your guide

## Help

- `/home`
- `/help flow`
- `/help commands`
- `/help learning`
- `/help simulate`
- `/help agent`
- `/help provider`
- `/status`
- `/examples`

## Slash Commands

- `/help [topic]`
- `/provider`
- `/provider-policy <modeling|simulation>`
- `/init <userId>`
- `/load <profileId>`
- `/next`
- `/answer <value>`
- `/simulate <task text or json>`
- `/agent-context <intent>`
- `/inspect [full|observed|inferred|privacy]`
- `/state`
- `/graph`
- `/neo4j`
- `/neo4j-sync`
- `/export [safe|full]`
- `/clear`
- `/quit`

## Behavior

- Tab completes slash commands.
- `/next` stages the first returned question.
- Once a question is staged, plain text input is treated as the answer.
- `/simulate` accepts either raw JSON or a plain task string.
- `/agent-context` returns the filtered agent-standardized projection rather than the full `.pson` profile.
- `/provider` shows env and stored provider state.
- `/neo4j` shows Neo4j config and connectivity.
- `/neo4j-sync` pushes the current profile graph into Neo4j.

## One-Shot Examples

```powershell
npm run dev --workspace @pson5/cli -- init user_123 --store C:\Users\user\pson5\.pson5-store
npm run dev --workspace @pson5/cli -- question-next <profileId> --store C:\Users\user\pson5\.pson5-store
npm run dev --workspace @pson5/cli -- learn <profileId> core_learning_mode reading --store C:\Users\user\pson5\.pson5-store
npm run dev --workspace @pson5/cli -- simulate <profileId> --context "{""task"":""study for exam"",""deadline_days"":2}" --store C:\Users\user\pson5\.pson5-store
npm run dev --workspace @pson5/cli -- agent-context <profileId> --intent tutoring --include-predictions --store C:\Users\user\pson5\.pson5-store
```
