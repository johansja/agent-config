# Pi Extensions

Custom extensions for [pi](https://github.com/MarioZechner/pi-coding-agent), the coding agent harness.

> **Attribution:** These extensions are derived from example extensions in the [pi-mono](https://github.com/MarioZechner/pi-mono) repository:
> - **ai-permission-gate** evolved from pi-mono's `permission-gates` example — replacing regex-based pattern matching with LLM-powered classification and CWD-aware risk assessment.
> - **team** evolved from pi-mono's `subagent` example — expanding from a simple subagent spawner into a full multi-role workflow orchestrator with phase tracking, file-based mailboxes, and auto-orchestration.
- **auto-session-name** is the repo's first greenfield extension (not derived from a pi-mono example) — bringing opencode-style auto session naming to pi via the `agent_settled` hook.

## Extensions

### ai-permission-gate

Uses an LLM (spawned as a child pi process) to classify bash commands by risk level before execution. Instead of maintaining regex patterns, a fast model judges each command with CWD-aware context — project-local operations are treated as less risky than system-wide equivalents.

**Configuration (environment variables):**

| Variable | Default | Description |
|---|---|---|
| `PI_AI_PERM_GATE_MODEL` | pi's default | Model to use for classification |
| `PI_AI_PERM_GATE_BLOCK_LEVEL` | `low` | Minimum risk level to block: `low` \| `medium` \| `high` |
| `PI_AI_PERM_GATE_TIMEOUT` | `10000` | Timeout in ms for the LLM call |
| `PI_AI_PERM_GATE_FALLBACK` | `confirm` | What to do if LLM fails: `allow` \| `block` \| `confirm` |

**Install:** Symlink `ai-permission-gate.ts` into `~/.pi/agent/extensions/`.

**Test:** `node --test ai-permission-gate.test.mjs`

### auto-session-name

Automatically generates a short, human-readable name for each new session after the first user/assistant exchange completes — opencode-style auto-naming for pi. The name appears in `/resume` and `pi -r` instead of the first-message preview.

**Behavior:**

- Fires once per session on the first `agent_settled` (after the initial exchange — including tool calls, retries, and auto-compaction — fully completes).
- Only names brand-new sessions (branch has 0 prior user messages at `session_start`). Resumed (`pi -c`, `/resume`) and forked sessions are left alone.
- Skips if a name is already set (`/name`, `--name`, or another extension).
- Skips ephemeral sessions (`--no-session`).
- Silently skips on any error; set `PI_AUTO_SESSION_NAME_DEBUG=1` for diagnostics.

**Configuration** (precedence: env var > settings.json > default):

Set a cheaper model in `~/.pi/agent/settings.json` (same file as `permissionGate`):

```json
{
  "autoSessionName": {
    "model": "bitdeerai/MiniMaxAI/MiniMax-M2.5"
  }
}
```

Environment variables override settings.json:

| Variable | Default | Description |
|---|---|---|
| `PI_AUTO_SESSION_NAME_MODEL` | session model | Model for naming, `provider/modelId` or bare id |
| `PI_AUTO_SESSION_NAME_DISABLED` | unset | `1`/`true` disables the extension |
| `PI_AUTO_SESSION_NAME_DEBUG` | unset | `1`/`true` logs diagnostics to stderr and TUI |
| `PI_AUTO_SESSION_NAME_MAX_CHARS` | `60` | Truncate generated name to N chars |
| `PI_AUTO_SESSION_NAME_TIMEOUT` | `15000` | LLM call timeout in ms |

**Install:** Symlink `auto-session-name.ts` into `~/.pi/agent/extensions/`.

**Test:** `node --test auto-session-name.test.mjs`

### team

Orchestrates multi-role development workflows across cmux panes. Each role (planner, coder, reviewer) runs as a full pi session with its own pane, model, tools, and file-based mailbox for inter-role communication.

**Commands:**

| Command | Description |
|---|---|
| `/team init <task-name> [<agent>...]` | Create workflow, become orchestrator (omitting agents loads all) |
| `/team status [task-name]` | Show workflow state |
| `/team resume [task-name]` | Resume an interrupted team session |
| `/team list` | List available agents |
| `/team history [task-name]` | Show dispatch history |
| `/team cleanup <team-name>` | Remove a team regardless of status |

**Workflow model:** LLM-driven orchestration. After `/team init`, you use the `team_orchestrate` tool to dispatch agents one at a time. The orchestrator (main pi session) decides what to run next based on agent results.

**Agent configuration:** Place `.md` files in `~/.pi/agent/team/` (user-level) or `.pi/team/` (project-level). Each file has YAML frontmatter:

```yaml
---
name: reviewer
description: Code review and testing specialist — scrutinizes quality, correctness, and test coverage
tools: read, grep, find, ls
roles: review, testing
model: <your-preferred-model>
thinking: high
---
```

See `team/examples/` for starter templates.

## Installation

```bash
# Clone and symlink
 git clone <repo-url> ~/projects/pi-extensions

# ai-permission-gate
ln -sf ~/projects/pi-extensions/ai-permission-gate.ts ~/.pi/agent/extensions/ai-permission-gate.ts

# auto-session-name
ln -sf ~/projects/pi-extensions/auto-session-name.ts ~/.pi/agent/extensions/auto-session-name.ts

# team
ln -sf ~/projects/pi-extensions/team ~/.pi/agent/extensions/team

# Agent configuration for team (required)
mkdir -p ~/.pi/agent/team
cp ~/projects/pi-extensions/team/examples/*.md ~/.pi/agent/team/
# Then edit ~/.pi/agent/team/*.md to set your model and preferences

# Prompts (slash commands)
ln -sf ~/projects/pi-extensions/prompts/mr-review.md ~/.pi/agent/prompts/mr-review.md
ln -sf ~/projects/pi-extensions/prompts/triple-review.md ~/.pi/agent/prompts/triple-review.md

# Subagent templates
ln -sf ~/projects/pi-extensions/agents/planner.md ~/.pi/agent/agents/planner.md
ln -sf ~/projects/pi-extensions/agents/reviewer.md ~/.pi/agent/agents/reviewer.md
ln -sf ~/projects/pi-extensions/agents/scout.md ~/.pi/agent/agents/scout.md
ln -sf ~/projects/pi-extensions/agents/worker.md ~/.pi/agent/agents/worker.md

# Local skill overrides (hand-symlinked; not managed by `npx skills`)
ln -sf ~/projects/pi-extensions/skills/code-review ~/.agents/skills/code-review
ln -sf ~/projects/pi-extensions/skills/codebase-design ~/.agents/skills/codebase-design
ln -sf ~/projects/pi-extensions/skills/improve-codebase-architecture ~/.agents/skills/improve-codebase-architecture
```

The symlinks ensure edits in this repo are immediately reflected in pi without copying.
