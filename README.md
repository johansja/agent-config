# Pi Extensions

Custom extensions for [pi](https://github.com/MarioZechner/pi-coding-agent), the coding agent harness.

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

## Skills

Skills are model-invoked capability packages following the [Agent Skills standard](https://agentskills.io). They trigger automatically when the task matches their description.

| Skill | Description |
|---|---|
| `capture-lesson` | Record corrections and non-obvious gotchas to prevent repeated mistakes. |
| `codebase-design` | Shared vocabulary (module, seam, depth, adapter, leverage, locality) for designing deep modules. Use when restructuring code or evaluating architecture. |
| `codebase-navigation` | Navigate and understand unfamiliar codebases. Composes with `codebase-design`, `diagrams`, `domain-modeling`, and subagent templates (`scout`, `planner`). |
| `diagnosing-bugs` | Diagnose hard bugs and performance regressions with a structured loop. |
| `diagrams` | Draw Mermaid diagrams (flowchart, sequence, class, ER, state) when visualization is needed. |
| `domain-modeling` | Build and sharpen domain terminology and ubiquitous language. Records glossary in `CONTEXT.md` and decisions in `docs/adr/`. |
| `grilling` | Interview the user relentlessly about a plan, decision, or idea before implementation. |

## Installation

```bash
# Clone and symlink
 git clone <repo-url> ~/projects/pi-extensions

# ai-permission-gate
ln -sf ~/projects/pi-extensions/ai-permission-gate.ts ~/.pi/agent/extensions/ai-permission-gate.ts

# auto-session-name
ln -sf ~/projects/pi-extensions/auto-session-name.ts ~/.pi/agent/extensions/auto-session-name.ts

# Prompts (slash commands)
ln -sf ~/projects/pi-extensions/prompts/mr-review.md ~/.pi/agent/prompts/mr-review.md
ln -sf ~/projects/pi-extensions/prompts/triple-review.md ~/.pi/agent/prompts/triple-review.md

# Subagent templates
ln -sf ~/projects/pi-extensions/agents/planner.md ~/.pi/agent/agents/planner.md
ln -sf ~/projects/pi-extensions/agents/reviewer.md ~/.pi/agent/agents/reviewer.md
ln -sf ~/projects/pi-extensions/agents/scout.md ~/.pi/agent/agents/scout.md
ln -sf ~/projects/pi-extensions/agents/worker.md ~/.pi/agent/agents/worker.md

# Skills (model-invoked)
ln -sf ~/projects/pi-extensions/skills/capture-lesson ~/.pi/agent/skills/capture-lesson
ln -sf ~/projects/pi-extensions/skills/codebase-navigation ~/.pi/agent/skills/codebase-navigation
ln -sf ~/projects/pi-extensions/skills/diagnosing-bugs ~/.pi/agent/skills/diagnosing-bugs
ln -sf ~/projects/pi-extensions/skills/diagrams ~/.pi/agent/skills/diagrams
ln -sf ~/projects/pi-extensions/skills/domain-modeling ~/.pi/agent/skills/domain-modeling
ln -sf ~/projects/pi-extensions/skills/grilling ~/.pi/agent/skills/grilling

```

The symlinks ensure edits in this repo are immediately reflected in pi without copying.

## References

Derivation sources for this repo — consult when improving the corresponding artifacts:

- **[pi-mono](https://github.com/MarioZechner/pi-mono)** — pi, the coding agent these extensions target.
- **[mattpocock/skills](https://github.com/mattpocock/skills)** (MIT) — production-ready Claude skills.
- **[obra/superpowers](https://github.com/obra/superpowers)** (MIT) — agentic skills framework and methodology.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** (MIT) — lazy-senior-dev persona for pi.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** (MIT) — terse-prose output compression skill.
