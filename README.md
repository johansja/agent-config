# agent-config

Source-of-truth for pi, opencode, and Claude Code agent configuration, deployed by symlinking into `~/.pi/agent/` (pi), `~/.config/opencode/` (opencode), and `~/.claude/` (Claude Code). This repo is NOT itself a pi, opencode, or Claude Code project — files here are source-only; symlinks ensure edits land immediately in every agent without copying.

Shared artifact classes (skills, commands, global rules) deploy to all three agents. Agent-specific artifacts differ: pi has TypeScript extensions; each agent's subagent templates use a different frontmatter schema, so they live in per-agent directories (`pi/agents/`, `opencode/agents/`, `claude/agents/`) sharing an identical body. Claude Code's built-in `general-purpose`, `Plan`, and `Explore` subagents cover pi's `general`/`plan`/`scout`, so only `review` (no built-in equivalent) is mirrored under `claude/agents/`.

## Structure

```
agent-config/
├── AGENTS.md                  # project-level instructions (this repo's own guidance)
├── README.md
├── config/
│   └── magic-context.jsonc    # shared CortexKit config — pi + opencode
├── global/
│   └── AGENTS.md              # canonical global rules — symlinked by ALL agents
├── skills/                    # shared model-invoked skills — symlinked by ALL agents
│   └── <name>/SKILL.md        # each skill lives in its own subdir
├── commands/                  # shared slash-command templates — symlinked by ALL agents
├── scripts/                   # helper harnesses — bench-models.mjs (coding-realistic model bench), probe-cache.mjs; symlinked into ~/.pi/agent/bin/
├── pi/                        # pi-specific artifacts
│   ├── *.ts                   # single-file extensions (root of pi/)
│   ├── *.mjs                  # tests alongside their extension
│   ├── config/                # pi config: models.json + mcp.json symlinked; settings.json copy-deployed (ADR 0002)
│   └── agents/                # subagent templates
├── opencode/                  # opencode-specific artifacts
│   └── agents/
│       └── review.md          # review subagent (body shared across agents; frontmatter differs per schema)
└── claude/                    # Claude Code-specific artifacts
    └── agents/
        └── review.md          # review subagent (body shared across agents; Claude frontmatter — PascalCase tools, model: opus)
```

`.pi/workflow/` (pi's live session state) rides with the repo but is gitignored and not deployed.

## Extensions (pi)

### ai-permission-gate

→ Moved to its own repo: [johansja/pi-permission-gate](https://github.com/johansja/pi-permission-gate). Install via `pi install npm:@johansja/pi-permission-gate` — pi writes the declaration to `packages` in `~/.pi/agent/settings.json` (no extension file is symlinked).

### auto-session-name

Automatically generates a short, human-readable name for each new session after the first user/assistant exchange completes — opencode-style auto-naming for pi. The name appears in `/resume` and `pi -r` instead of the first-message preview.

**Behavior:**

- Fires once per session on the first `agent_settled` (after the initial exchange — including tool calls, retries, and auto-compaction — fully completes). A run aborted before settling (pi ≥ 1.1 flags it) doesn't count: naming defers to the next completed exchange.
- Only names brand-new sessions (branch has 0 prior user messages at `session_start`). Resumed (`pi -c`, `/resume`) and forked sessions are left alone.
- Skips if a name is already set (`/name`, `--name`, or another extension).
- Skips ephemeral sessions (`--no-session`).
- Silently skips on any error; set `PI_AUTO_SESSION_NAME_DEBUG=1` for diagnostics.

The extension also registers `/rename`: re-titles the session from the whole conversation on demand, for when it drifts from its turn-1 name.

- Summarizes the current branch with pi's own compaction summarizer (`generateSummary`), then titles from that summary. Branch is read whole — pre-fork history and compaction summaries included.
- Replaces any existing name, auto-set or `/name`-set — explicit invocation is the consent. Reports `old → new` in the TUI.
- Works on ephemeral sessions (rename holds for the live session, won't persist); failures warn instead of silently skipping.
- A footer status (`renaming session…`) shows while it runs; overlapping invocations are refused.

**Configuration (precedence: env var > settings.json > default):**

Set the naming model in `~/.pi/agent/settings.json` (same file as `permissionGate`):

```json
{
  "autoSessionName": {
    "model": "bitdeerai/zai-org/GLM-5.3-Flash"
  }
}
```

The naming call pins reasoning effort to `low` (mapped through the model's
`thinkingLevelMap`) — fast titles; reasoning models like GLM-5.3-Flash otherwise
default to max effort server-side.

Environment variables override settings.json:

| Variable | Default | Description |
|---|---|---|
| `PI_AUTO_SESSION_NAME_MODEL` | session model | Model for naming, `provider/modelId` or bare id |
| `PI_AUTO_SESSION_NAME_DISABLED` | unset | `1`/`true`/`yes` disables auto-naming (`/rename` unaffected) |
| `PI_AUTO_SESSION_NAME_DEBUG` | unset | `1`/`true`/`yes` logs diagnostics to stderr and TUI |
| `PI_AUTO_SESSION_NAME_MAX_CHARS` | `80` | Truncate generated name to N chars |

**Install:** Symlink `pi/auto-session-name.ts` into `~/.pi/agent/extensions/`.

**Test:** `node --test pi/auto-session-name.test.mjs`

### notify-cmux / notify-herdr / notify-orca / notify-osc

Blocked-state consumers, one file per transport: each subscribes pi's
`ui_prompt_start`/`ui_prompt_end` and translates blocking prompts into its
host's waiting-for-user signal. No-op outside its host.

**Test:** `node --test pi/notify-orca.test.mjs`

### read-pdf-tool

Registers a `read_pdf` tool — pi's built-in `read` does not support PDF.
Extracts text via the first available of pdftotext, Ghostscript, or a
throwaway pypdf venv, with 1-based page-range args, a 48k-char cap, and
scanned/encrypted reporting surfaced to the user (no silent OCR). Implements
the `read-pdf` skill's chain; on pi the skill defers to this tool.

**Test:** `node --test pi/read-pdf-tool.test.mjs`

### Vendor-managed extensions (not in this repo)

`~/.pi/agent/extensions/` also holds files installed and upgraded in place by
their tools — `cmux-session.ts` (cmux), `herdr-agent-state.ts` (herdr),
`orca-{agent-status,prefill,titlebar-spinner}.ts` (Orca), `emdash-hook.ts`
(emdash). Their tools overwrite them on upgrade — never edit or absorb them.
They cover session lifecycle; the blocked-state seam belongs to `notify-*`.

`@cortexkit/pi-magic-context` is a package-installed extension (declared in
`settings.json` `packages[]`, not a file here); see [Magic Context](#magic-context-shared).

## Commands (shared)

Slash-command templates (markdown with YAML frontmatter). Compatible with pi (`prompts/`), opencode (`commands/`), and Claude Code (`commands/`). Each lives in `commands/<name>.md` and is symlinked into `~/.pi/agent/prompts/`, `~/.config/opencode/commands/`, and `~/.claude/commands/`.

Commands are how this repo encodes a **workflow**: a recurring cross-session intent-sequence (e.g. work-on-ticket, review-MR) distilled into one invocable template that composes skills and subagents. Encode rails, not synthesis: actions, mutations, and never-rules are spelled out; reasoning is left open.

## Global rules (shared)

`global/AGENTS.md` is the single canonical rules file. `~/.pi/agent/AGENTS.md`, `~/.config/opencode/AGENTS.md`, and `~/.claude/CLAUDE.md` all symlink to it — same rules in every session. (Claude Code's memory file is `CLAUDE.md`; the content is agent-agnostic markdown.) Editing it is the only way to change agent behavior across all agents in one step.

## Skills (shared)

Skills in `skills/` are repo-owned; `codebase-design` is a modified fork of
[mattpocock/skills](https://github.com/mattpocock/skills). `~/.agents/skills/`
additionally holds vendored third-party skill directories not versioned here.
Claude Code reads only `~/.claude/skills/` (no native `~/.agents/skills/`
support — [anthropics/claude-code#66352](https://github.com/anthropics/claude-code/issues/66352)),
so every skill — repo-owned and vendored — also needs a symlink there.
Reinstall sources:

| Skill | Source |
|---|---|
| gpu-operator, kai, nvsentinel | NVIDIA |
| show-me | [humanlayer/skills](https://github.com/humanlayer/skills) (`skills-lock.json`) |
| orca-cli | Orca toolchain |
| herdr | Herdr toolchain |
| search-company-knowledge | Atlassian MCP |
| powerpoint | custom (possibly skills.sh) |
| infra | `~/projects/infra-skill` (Bitdeer AI Cloud reference) |

## Magic Context (shared)

Magic Context owns context management and cross-session memory for pi and
opencode. One config and one SQLite store are shared by both; only the
hidden-agent model ids differ per harness.

- **Config:** `config/magic-context.jsonc` → `~/.config/cortexkit/magic-context.jsonc`.
  Keep it under `config/`, not the repo root: Magic Context treats a root-level
  `magic-context.jsonc` as a legacy project config and moves it. The historian
  and dreamer run on the cheap main model at low effort. Embeddings stay local.
- **pi:** `npm:@cortexkit/pi-magic-context` is declared in `settings.json`
  `packages[]`; install with `pi install npm:@cortexkit/pi-magic-context`. Native
  pi compaction stays enabled as the fallback; Magic Context cancels it at runtime.
- **opencode:** registered with `opencode plugin add
  @cortexkit/opencode-magic-context@latest` (vendor-managed; `opencode.jsonc` is
  machine-local and not versioned here). `compaction.auto` and `compaction.prune`
  are disabled so native compaction cannot double-compress.
- **Dreamer:** enabled on the default schedules with the same model;
  `review-user-memories` is disabled because an inferred cross-project profile
  would compete with the hand-written global rules. `retrospective` stays on as
  the automatic counterpart to `capture-lesson`: project lessons from
  corrections, not user observations. `dreamer.tasks.<task>.schedule: ""`
  disables any other task; `maintain-docs` is already off by default.
- **Visible behavior:** primary sessions get `<session-history>` /
  `<project-memory>` blocks in the system prompt; Magic Context's guidance asks
  the model to prefix replies with `§N§` tags so `ctx_reduce` / `ctx_expand` can
  reference turns.
- **Subagents:** the agent templates carry `<!-- magic-context: skip -->`, the
  default skip signature, so short-lived subagent prompts get no tagging guidance
  or memory block.
- **Store:** `~/.local/share/cortexkit/magic-context/context.db` (SQLite) and
  `~/.local/share/cortexkit/magic-context/models/` (local embedding model, ~90 MB
  on first use). Losing the store loses memory and history.
- **Doctor:** `npx @cortexkit/magic-context@latest doctor --harness pi` /
  `--harness opencode`.

Deploying is restart-shaped: pi loads the package and opencode caches agent
prompts at startup, so restart both once after the install steps.

## Config (pi)

`pi/config/models.json` and `pi/config/mcp.json` are symlinked into `~/.pi/agent/` (mcp.json via `~/.config/mcp/mcp.json`) — both are hand-edited only. `pi/config/settings.json` is **copy-deployed**, never symlinked: pi writes runtime state into it (`lastChangelogVersion` on every upgrade, `/theme` and model-toggle changes), and with the repo on several machines that state would masquerade as shared config — see [ADR 0002](docs/adr/0002-settings-machine-local-deployment.md). Editing shared defaults = edit the tracked file, re-copy, `/reload`.

`mcp.json` is secret-free: the `notify-service` bearer token is interpolated as `${BITDEER_NOTIFY_MCP_TOKEN}` (pi supports env expansion in `headers`); the value lives in `~/.config/fish/config.fish`.

Deliberately not versioned: `pi-permissions.jsonc`, `ship-reviewers.json`, and `trust.json` (pi-local; machine/team-specific or auto-regenerated), and `auth.json` / `mcp-auth.json` (credentials — never commit). The `go-deps-update` skill is also pi-local.

## Scripts (helpers)

`scripts/` holds versioned harnesses, symlinked into `~/.pi/agent/bin/`. **`bench-models.mjs` is the bench for model decisions.** It samples coding-shaped traffic: ~150k-token real-code context, first-call vs cached TTFT, decode tok/s, and tool-call pass rate across read/grep/write tasks, with models interleaved per iteration to damp pool weather. Short-prompt measurements were retired because they cannot see long-context prefill or cache-miss latency, which dominate real agent turns. `probe-cache.mjs` diagnoses prompt-cache behavior — per-replica caches mean concurrent bursts pay cold prefill on unwarmed replicas — run it when latency looks anomalous or after gateway changes.

## Installation

Clone, then symlink each artifact class to its deployment target:

```bash
git clone <repo-url> ~/projects/agent-config
cd ~/projects/agent-config

# Pi extensions → ~/.pi/agent/extensions/
ln -sf "$PWD/pi/<ext>.ts" ~/.pi/agent/extensions/<ext>.ts

# Pi subagent extension + questionnaire — symlinked straight to pi's upstream examples
# (no local copy; tracks the installed pi package automatically)
# Managed installs embed the version in the release dir — re-run after each pi update.
PI_INSTALL="$HOME/.pi/agent/install/releases/$(cat ~/.pi/agent/install/current-version)/node_modules/@earendil-works/pi-coding-agent"
PI_EXAMPLES="$PI_INSTALL/examples/extensions/subagent"
mkdir -p ~/.pi/agent/extensions/subagent
ln -sf "$PI_EXAMPLES/agents.ts" ~/.pi/agent/extensions/subagent/agents.ts
ln -sf "$PI_EXAMPLES/index.ts" ~/.pi/agent/extensions/subagent/index.ts
ln -sf "$PI_INSTALL/examples/extensions/questionnaire.ts" ~/.pi/agent/extensions/questionnaire.ts

# Pi subagent templates → ~/.pi/agent/agents/
ln -sf "$PWD/pi/agents/<name>.md" ~/.pi/agent/agents/<name>.md

# OpenCode subagent templates → ~/.config/opencode/agents/
ln -sf "$PWD/opencode/agents/<name>.md" ~/.config/opencode/agents/<name>.md

# OpenCode Magic Context (vendor-managed; writes the machine-local opencode.jsonc)
opencode plugin add @cortexkit/opencode-magic-context@latest
# then set "compaction": { "auto": false, "prune": false } in that file

# Claude Code subagent templates → ~/.claude/agents/
# (only agents with no Claude built-in equivalent — e.g. review;
#  general/plan/scout are covered by built-in general-purpose/Plan/Explore)
ln -sf "$PWD/claude/agents/<name>.md" ~/.claude/agents/<name>.md

# Skills → ~/.agents/skills/ (pi + opencode) and ~/.claude/skills/ (Claude Code)
ln -sf "$PWD/skills/<name>" ~/.agents/skills/<name>
ln -sf "$PWD/skills/<name>" ~/.claude/skills/<name>

# Vendored skills (installed into ~/.agents/skills/ by their toolchains — see
# table above) also need a ~/.claude/skills/ symlink or Claude Code can't see them:
ln -sf "../../.agents/skills/<name>" ~/.claude/skills/<name>

# Commands → ~/.pi/agent/prompts/, ~/.config/opencode/commands/, ~/.claude/commands/
ln -sf "$PWD/commands/<name>.md" ~/.pi/agent/prompts/<name>.md
ln -sf "$PWD/commands/<name>.md" ~/.config/opencode/commands/<name>.md
ln -sf "$PWD/commands/<name>.md" ~/.claude/commands/<name>.md

# Scripts → ~/.pi/agent/bin/
mkdir -p ~/.pi/agent/bin
ln -sf "$PWD/scripts/bench-models.mjs" ~/.pi/agent/bin/bench-models.mjs   # coding-realistic model bench
ln -sf "$PWD/scripts/probe-cache.mjs" ~/.pi/agent/bin/probe-cache.mjs   # prompt-cache probe

# Pi config → ~/.pi/agent/
# settings.json is copy-deployed, machine-local (ADR 0002) — never symlink it.
# pi writes runtime state into the deployed copy; re-copy on shared-default changes.
cp "$PWD/pi/config/settings.json" ~/.pi/agent/settings.json
ln -sf "$PWD/pi/config/models.json" ~/.pi/agent/models.json

# Pi package-declared extensions → ~/.pi/agent/npm/ (settings.json packages[])
pi install npm:@cortexkit/pi-magic-context

# Magic Context shared config → ~/.config/cortexkit/ (pi + opencode)
mkdir -p ~/.config/cortexkit
ln -sf "$PWD/config/magic-context.jsonc" ~/.config/cortexkit/magic-context.jsonc

# MCP config → ~/.config/mcp/ (pi's ~/.pi/agent/mcp.json symlinks here)
ln -sf "$PWD/pi/config/mcp.json" ~/.config/mcp/mcp.json
# notify-service's bearer token is interpolated from the environment
# (BITDEER_NOTIFY_MCP_TOKEN in ~/.config/fish/config.fish) — set it before
# enabling that server.

# Global rules → ~/.pi/agent/AGENTS.md, ~/.config/opencode/AGENTS.md, ~/.claude/CLAUDE.md
ln -sf "$PWD/global/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$PWD/global/AGENTS.md" ~/.config/opencode/AGENTS.md
ln -sf "$PWD/global/AGENTS.md" ~/.claude/CLAUDE.md
```

Symlinks ensure edits land immediately in all deployed agents without copying.

Verified working against pi 1.4.0 · opencode 2.1.2 · Claude Code 2.1.306 (2026-10-22) — bump on each sync audit.

## References

Derivation sources — consult when improving the corresponding artifacts.

- **[Agent Skills standard](https://agentskills.io)** — the skills format this repo follows (`SKILL.md` with YAML frontmatter).
- **[pi](https://github.com/earendil-works/pi)** — pi, the coding agent the extensions and prompts target.
- **[opencode](https://opencode.ai)** — opencode, the coding agent whose subagent and global rules live here.
- **[mattpocock/skills](https://github.com/mattpocock/skills)** (MIT) — production-ready Claude skills.
- **[obra/superpowers](https://github.com/obra/superpowers)** (MIT) — agentic skills framework and methodology.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** (MIT) — lazy-senior-dev persona for pi.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** (MIT) — terse-prose output compression skill.
- **[How to be more ambitious — Felix Rieseberg](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/)** — the deepen pass skill.
