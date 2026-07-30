# agent-config

Source-of-truth for pi and opencode agent configuration, deployed by symlinking into `~/.pi/agent/` (pi) and `~/.config/opencode/` (opencode). This repo is NOT itself a pi or opencode project — files here are source-only; symlinks ensure edits land immediately in both agents without copying.

## Structure

```
agent-config/
├── AGENTS.md                  # project-level instructions (this repo's own guidance)
├── README.md
├── global/
│   └── AGENTS.md              # canonical global rules — symlinked by BOTH agents
├── skills/                    # shared model-invoked skills — symlinked by BOTH agents
│   └── <name>/SKILL.md        # each skill lives in its own subdir
├── commands/                  # shared slash-command templates — symlinked by BOTH agents
├── pi/                        # pi-specific artifacts
│   ├── *.ts                   # single-file extensions (root of pi/)
│   ├── *.mjs                  # tests alongside their extension
│   ├── shared/                # helpers imported by extensions (no index/package.json)
│   └── agents/                # subagent templates
└── opencode/                  # opencode-specific artifacts
    └── agents/
        └── review.md          # review subagent (body shared with pi/agents/review.md; frontmatter differs per agent schema)
```

`.pi/workflow/` (pi's live session state) rides with the repo but is gitignored and not deployed.

## Extensions (pi)

### ai-permission-gate

Uses an LLM (spawned as a child pi process) to classify bash commands by risk level before execution. Instead of maintaining regex patterns, a fast model judges each command with CWD-aware context — project-local operations are treated as less risky than system-wide equivalents.

**Configuration (environment variables):**

| Variable | Default | Description |
|---|---|---|
| `PI_AI_PERM_GATE_MODEL` | pi's default | Model to use for classification |
| `PI_AI_PERM_GATE_BLOCK_LEVEL` | `low` | Minimum risk level to block: `low` \| `medium` \| `high` |
| `PI_AI_PERM_GATE_TIMEOUT` | `10000` | Timeout in ms for the LLM call |
| `PI_AI_PERM_GATE_FALLBACK` | `confirm` | What to do if LLM fails: `allow` \| `block` \| `confirm` |

**Install:** Symlink `pi/ai-permission-gate.ts` into `~/.pi/agent/extensions/`.

**Test:** `node --test pi/ai-permission-gate.test.mjs`

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
    "model": "bitdeerai/MiniMaxAI/MiniMax-M3"
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

Slash-command templates (markdown with YAML frontmatter). Compatible with both pi (`prompts/`) and opencode (`commands/`). Each lives in `commands/<name>.md` and is symlinked into both `~/.pi/agent/prompts/` and `~/.config/opencode/commands/`.

## Global rules (shared)

`global/AGENTS.md` is the single canonical rules file. Both `~/.pi/agent/AGENTS.md` and `~/.config/opencode/AGENTS.md` symlink to it — same rules in both sessions. Editing it is the only way to change agent behavior across both agents in one step.

## Installation

Clone, then symlink each artifact class to its deployment target:

```bash
git clone <repo-url> ~/projects/agent-config
cd ~/projects/agent-config

# Pi extensions → ~/.pi/agent/extensions/ (extension files + the shared/ symlink)
ln -sf "$PWD/pi/<ext>.ts" ~/.pi/agent/extensions/<ext>.ts
ln -sf "$PWD/pi/shared" ~/.pi/agent/extensions/shared

# Pi subagent templates → ~/.pi/agent/agents/
ln -sf "$PWD/pi/agents/<name>.md" ~/.pi/agent/agents/<name>.md

# OpenCode subagent templates → ~/.config/opencode/agents/
ln -sf "$PWD/opencode/agents/<name>.md" ~/.config/opencode/agents/<name>.md

# Skills → ~/.agents/skills/ (both pi and opencode load skills from there)
ln -sf "$PWD/skills/<name>" ~/.agents/skills/<name>

# Commands → BOTH ~/.pi/agent/prompts/ and ~/.config/opencode/commands/
ln -sf "$PWD/commands/<name>.md" ~/.pi/agent/prompts/<name>.md
ln -sf "$PWD/commands/<name>.md" ~/.config/opencode/commands/<name>.md

# Global rules → BOTH ~/.pi/agent/AGENTS.md and ~/.config/opencode/AGENTS.md
ln -sf "$PWD/global/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$PWD/global/AGENTS.md" ~/.config/opencode/AGENTS.md
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
