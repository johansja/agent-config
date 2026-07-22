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
        └── review.md          # cross-model review subagent (Kimi-K2.6)
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

## Subagents (opencode)

| Subagent | Description |
|---|---|
| `review` | Cross-model plan/code reviewer (Kimi-K2.6). Reads files, traces execution paths, runs tests. Reports by severity (Critical / Important / Minor), does NOT fix. Verdict up front: APPROVED or NEEDS WORK. Use after planning to critique the plan, and after implementation to verify code. |

## Skills (shared)

Skills are model-invoked capability packages following the [Agent Skills standard](https://agentskills.io). They trigger automatically when the task matches their description. Each lives under `skills/<name>/SKILL.md` and is symlinked into both `~/.pi/agent/skills/` (pi) and `~/.agents/skills/` (opencode).

| Skill | Description |
|---|---|
| `capture-lesson` | Record corrections and non-obvious gotchas to prevent repeated mistakes. |
| `codebase-navigation` | Navigate and understand unfamiliar codebases. Composes with `codebase-design` (installed separately under `~/.agents/skills/`), `diagrams`, `domain-modeling`, and subagent templates (`scout`, `plan`). |
| `cruft-hygiene` | Audit and remove session-cruft from durable artifacts before finalization. |
| `diagnosing-bugs` | Diagnose hard bugs and performance regressions with a structured loop. |
| `diagrams` | Draw Mermaid diagrams (flowchart, sequence, class, ER, state) when visualization is needed. |
| `domain-modeling` | Build and sharpen domain terminology and ubiquitous language. Records glossary in `CONTEXT.md` and decisions in `docs/adr/`. |
| `grilling` | Interview the user relentlessly about a plan, decision, or idea before implementation. |

## Commands (shared)

Slash-command templates (markdown with YAML frontmatter). Compatible with both pi (`prompts/`) and opencode (`commands/`). Each lives in `commands/<name>.md` and is symlinked into both `~/.pi/agent/prompts/` and `~/.config/opencode/commands/`.

## Global rules (shared)

`global/AGENTS.md` is the single canonical rules file. Both `~/.pi/agent/AGENTS.md` and `~/.config/opencode/AGENTS.md` symlink to it — same rules in both sessions. Editing it is the only way to change agent behavior across both agents in one step.

## Installation

```bash
git clone <repo-url> ~/projects/agent-config
cd ~/projects/agent-config

# Pi extensions
ln -sf "$PWD/pi/ai-permission-gate.ts" ~/.pi/agent/extensions/ai-permission-gate.ts
ln -sf "$PWD/pi/auto-session-name.ts" ~/.pi/agent/extensions/auto-session-name.ts
ln -sf "$PWD/pi/questionnaire.ts" ~/.pi/agent/extensions/questionnaire.ts
ln -sf "$PWD/pi/shared" ~/.pi/agent/extensions/shared

# Pi subagent templates
ln -sf "$PWD/pi/agents/plan.md" ~/.pi/agent/agents/plan.md
ln -sf "$PWD/pi/agents/review.md" ~/.pi/agent/agents/review.md
ln -sf "$PWD/pi/agents/scout.md" ~/.pi/agent/agents/scout.md
ln -sf "$PWD/pi/agents/general.md" ~/.pi/agent/agents/general.md

# Pi skills (symlinked into BOTH ~/.pi/agent/skills/ and ~/.agents/skills/)
ln -sf "$PWD/skills/capture-lesson" ~/.pi/agent/skills/capture-lesson
ln -sf "$PWD/skills/codebase-navigation" ~/.pi/agent/skills/codebase-navigation
ln -sf "$PWD/skills/cruft-hygiene" ~/.pi/agent/skills/cruft-hygiene
ln -sf "$PWD/skills/diagnosing-bugs" ~/.pi/agent/skills/diagnosing-bugs
ln -sf "$PWD/skills/diagrams" ~/.pi/agent/skills/diagrams
ln -sf "$PWD/skills/domain-modeling" ~/.pi/agent/skills/domain-modeling
ln -sf "$PWD/skills/grilling" ~/.pi/agent/skills/grilling
ln -sf "$PWD/skills/capture-lesson" ~/.agents/skills/capture-lesson
ln -sf "$PWD/skills/codebase-navigation" ~/.agents/skills/codebase-navigation
ln -sf "$PWD/skills/cruft-hygiene" ~/.agents/skills/cruft-hygiene
ln -sf "$PWD/skills/diagnosing-bugs" ~/.agents/skills/diagnosing-bugs
ln -sf "$PWD/skills/diagrams" ~/.agents/skills/diagrams
ln -sf "$PWD/skills/domain-modeling" ~/.agents/skills/domain-modeling
ln -sf "$PWD/skills/grilling" ~/.agents/skills/grilling

# Pi global rules (canonical, shared with opencode below)
ln -sf "$PWD/global/AGENTS.md" ~/.pi/agent/AGENTS.md

# OpenCode subagent
ln -sf "$PWD/opencode/agents/review.md" ~/.config/opencode/agents/review.md

# OpenCode global rules (same canonical file as pi side)
ln -sf "$PWD/global/AGENTS.md" ~/.config/opencode/AGENTS.md

# Commands (shared — symlinked into BOTH ~/.pi/agent/prompts/ and ~/.config/opencode/commands/)
ln -sf "$PWD/commands/cruft-review.md" ~/.pi/agent/prompts/cruft-review.md
ln -sf "$PWD/commands/fix-hard-violations.md" ~/.pi/agent/prompts/fix-hard-violations.md
ln -sf "$PWD/commands/grill-with-docs.md" ~/.pi/agent/prompts/grill-with-docs.md
ln -sf "$PWD/commands/improve-architecture.md" ~/.pi/agent/prompts/improve-architecture.md
ln -sf "$PWD/commands/mr-review.md" ~/.pi/agent/prompts/mr-review.md
ln -sf "$PWD/commands/to-spec.md" ~/.pi/agent/prompts/to-spec.md
ln -sf "$PWD/commands/triple-review.md" ~/.pi/agent/prompts/triple-review.md
ln -sf "$PWD/commands/wayfinder.md" ~/.pi/agent/prompts/wayfinder.md
ln -sf "$PWD/commands/cruft-review.md" ~/.config/opencode/commands/cruft-review.md
ln -sf "$PWD/commands/fix-hard-violations.md" ~/.config/opencode/commands/fix-hard-violations.md
ln -sf "$PWD/commands/grill-with-docs.md" ~/.config/opencode/commands/grill-with-docs.md
ln -sf "$PWD/commands/improve-architecture.md" ~/.config/opencode/commands/improve-architecture.md
ln -sf "$PWD/commands/mr-review.md" ~/.config/opencode/commands/mr-review.md
ln -sf "$PWD/commands/to-spec.md" ~/.config/opencode/commands/to-spec.md
ln -sf "$PWD/commands/triple-review.md" ~/.config/opencode/commands/triple-review.md
ln -sf "$PWD/commands/wayfinder.md" ~/.config/opencode/commands/wayfinder.md
```

The symlinks ensure edits in this repo are immediately reflected in pi and opencode without copying.

## References

Derivation sources — consult when improving the corresponding artifacts.

- **[pi](https://github.com/earendil-works/pi)** — pi, the coding agent the extensions and prompts target.
- **[opencode](https://opencode.ai)** — opencode, the coding agent whose subagent and global rules live here.
- **[mattpocock/skills](https://github.com/mattpocock/skills)** (MIT) — production-ready Claude skills.
- **[obra/superpowers](https://github.com/obra/superpowers)** (MIT) — agentic skills framework and methodology.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** (MIT) — lazy-senior-dev persona for pi.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** (MIT) — terse-prose output compression skill.
