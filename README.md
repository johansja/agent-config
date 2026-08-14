# agent-config

Source-of-truth for pi, opencode, and Claude Code agent configuration, deployed by symlinking into `~/.pi/agent/` (pi), `~/.config/opencode/` (opencode), and `~/.claude/` (Claude Code). This repo is NOT itself a pi, opencode, or Claude Code project — files here are source-only; symlinks ensure edits land immediately in every agent without copying.

Shared artifact classes (skills, commands, global rules) deploy to all three agents. Agent-specific artifacts differ: pi has TypeScript extensions; each agent's subagent templates use a different frontmatter schema, so they live in per-agent directories (`pi/agents/`, `opencode/agents/`, `claude/agents/`) sharing an identical body. Claude Code's built-in `general-purpose`, `Plan`, and `Explore` subagents cover pi's `general`/`plan`/`scout`, so only `review` (no built-in equivalent) is mirrored under `claude/agents/`.

## Structure

```
agent-config/
├── AGENTS.md                  # project-level instructions (this repo's own guidance)
├── README.md
├── global/
│   └── AGENTS.md              # canonical global rules — symlinked by ALL agents
├── skills/                    # shared model-invoked skills — symlinked by ALL agents
│   └── <name>/SKILL.md        # each skill lives in its own subdir
├── commands/                  # shared slash-command templates — symlinked by ALL agents
├── pi/                        # pi-specific artifacts
│   ├── *.ts                   # single-file extensions (root of pi/)
│   ├── *.mjs                  # tests alongside their extension
│   └── agents/                # subagent templates
├── opencode/                  # opencode-specific artifacts
│   └── agents/
│       └── review.md          # review subagent (body shared across agents; frontmatter differs per schema)
└── claude/                    # Claude Code-specific artifacts
    └── agents/
        └── review.md          # review subagent (body shared across agents; Claude frontmatter — PascalCase tools, model: inherit)
```

`.pi/workflow/` (pi's live session state) rides with the repo but is gitignored and not deployed.

## Extensions (pi)

### ai-permission-gate

→ Moved to its own repo: [johansja/pi-permission-gate](https://github.com/johansja/pi-permission-gate). Install via `pi install git:github.com/johansja/pi-permission-gate`.

### auto-session-name

Automatically generates a short, human-readable name for each new session after the first user/assistant exchange completes — opencode-style auto-naming for pi. The name appears in `/resume` and `pi -r` instead of the first-message preview.

**Behavior:**

- Fires once per session on the first `agent_settled` (after the initial exchange — including tool calls, retries, and auto-compaction — fully completes).
- Only names brand-new sessions (branch has 0 prior user messages at `session_start`). Resumed (`pi -c`, `/resume`) and forked sessions are left alone.
- Skips if a name is already set (`/name`, `--name`, or another extension).
- Skips ephemeral sessions (`--no-session`).
- Silently skips on any error; set `PI_AUTO_SESSION_NAME_DEBUG=1` for diagnostics.

**Configuration (precedence: env var > settings.json > default):**

Set a cheaper model in `~/.pi/agent/settings.json` (same file as `permissionGate`):

```json
{
  "autoSessionName": {
    "model": "bitdeerai/deepseek-ai/DeepSeek-V4-Pro"
  }
}
```

Environment variables override settings.json:

| Variable | Default | Description |
|---|---|---|
| `PI_AUTO_SESSION_NAME_MODEL` | session model | Model for naming, `provider/modelId` or bare id |
| `PI_AUTO_SESSION_NAME_DISABLED` | unset | `1`/`true`/`yes` disables the extension |
| `PI_AUTO_SESSION_NAME_DEBUG` | unset | `1`/`true`/`yes` logs diagnostics to stderr and TUI |
| `PI_AUTO_SESSION_NAME_MAX_CHARS` | `60` | Truncate generated name to N chars |
| `PI_AUTO_SESSION_NAME_TIMEOUT` | `15000` | LLM call timeout in ms |

**Install:** Symlink `pi/auto-session-name.ts` into `~/.pi/agent/extensions/`.

**Test:** `node --test pi/auto-session-name.test.mjs`

## Commands (shared)

Slash-command templates (markdown with YAML frontmatter). Compatible with pi (`prompts/`), opencode (`commands/`), and Claude Code (`commands/`). Each lives in `commands/<name>.md` and is symlinked into `~/.pi/agent/prompts/`, `~/.config/opencode/commands/`, and `~/.claude/commands/`.

## Global rules (shared)

`global/AGENTS.md` is the single canonical rules file. `~/.pi/agent/AGENTS.md`, `~/.config/opencode/AGENTS.md`, and `~/.claude/CLAUDE.md` all symlink to it — same rules in every session. (Claude Code's memory file is `CLAUDE.md`; the content is agent-agnostic markdown.) Editing it is the only way to change agent behavior across all agents in one step.

## Installation

Clone, then symlink each artifact class to its deployment target:

```bash
git clone <repo-url> ~/projects/agent-config
cd ~/projects/agent-config

# Pi extensions → ~/.pi/agent/extensions/
ln -sf "$PWD/pi/<ext>.ts" ~/.pi/agent/extensions/<ext>.ts

# Pi subagent extension — symlinked straight to pi's upstream example
# (no local copy; tracks the installed pi package automatically)
PI_EXAMPLES="$(npm root -g)/@earendil-works/pi-coding-agent/examples/extensions/subagent"
mkdir -p ~/.pi/agent/extensions/subagent
ln -sf "$PI_EXAMPLES/agents.ts" ~/.pi/agent/extensions/subagent/agents.ts
ln -sf "$PI_EXAMPLES/index.ts" ~/.pi/agent/extensions/subagent/index.ts

# Pi subagent templates → ~/.pi/agent/agents/
ln -sf "$PWD/pi/agents/<name>.md" ~/.pi/agent/agents/<name>.md

# OpenCode subagent templates → ~/.config/opencode/agents/
ln -sf "$PWD/opencode/agents/<name>.md" ~/.config/opencode/agents/<name>.md

# Claude Code subagent templates → ~/.claude/agents/
# (only agents with no Claude built-in equivalent — e.g. review;
#  general/plan/scout are covered by built-in general-purpose/Plan/Explore)
ln -sf "$PWD/claude/agents/<name>.md" ~/.claude/agents/<name>.md

# Skills → ~/.agents/skills/ (pi + opencode) and ~/.claude/skills/ (Claude Code)
ln -sf "$PWD/skills/<name>" ~/.agents/skills/<name>
ln -sf "$PWD/skills/<name>" ~/.claude/skills/<name>

# Commands → ~/.pi/agent/prompts/, ~/.config/opencode/commands/, ~/.claude/commands/
ln -sf "$PWD/commands/<name>.md" ~/.pi/agent/prompts/<name>.md
ln -sf "$PWD/commands/<name>.md" ~/.config/opencode/commands/<name>.md
ln -sf "$PWD/commands/<name>.md" ~/.claude/commands/<name>.md

# Global rules → ~/.pi/agent/AGENTS.md, ~/.config/opencode/AGENTS.md, ~/.claude/CLAUDE.md
ln -sf "$PWD/global/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$PWD/global/AGENTS.md" ~/.config/opencode/AGENTS.md
ln -sf "$PWD/global/AGENTS.md" ~/.claude/CLAUDE.md
```

Symlinks ensure edits land immediately in both agents without copying.

## References

Derivation sources — consult when improving the corresponding artifacts.

- **[Agent Skills standard](https://agentskills.io)** — the skills format this repo follows (`SKILL.md` with YAML frontmatter).
- **[pi](https://github.com/earendil-works/pi)** — pi, the coding agent the extensions and prompts target.
- **[opencode](https://opencode.ai)** — opencode, the coding agent whose subagent and global rules live here.
- **[mattpocock/skills](https://github.com/mattpocock/skills)** (MIT) — production-ready Claude skills.
- **[obra/superpowers](https://github.com/obra/superpowers)** (MIT) — agentic skills framework and methodology.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** (MIT) — lazy-senior-dev persona for pi.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** (MIT) — terse-prose output compression skill.
