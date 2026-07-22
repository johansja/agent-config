# Agent Instructions — agent-config

## Project Overview

This repo is the source-of-truth for pi and opencode agent artifacts. Files here are deployed by symlinking into `~/.pi/agent/` (pi) and `~/.config/opencode/` (opencode) — the repo is NOT itself a pi or opencode project. Edits land immediately in both agents via the deployed symlinks.

## Repository Structure

- **`pi/`** — pi-specific artifacts. Single-file TypeScript extensions at this dir's root (e.g., `pi/ai-permission-gate.ts`); test files alongside (e.g., `pi/ai-permission-gate.test.mjs`); subdirectories for `shared/` and `agents/`. All symlinked into `~/.pi/agent/` locations per `README.md` installation.
- **`opencode/`** — opencode-specific artifacts. Currently `opencode/agents/review.md` (cross-model review subagent), symlinked into `~/.config/opencode/agents/`.
- **`skills/`** — shared model-invoked skills (Agent Skills standard). Each lives under `skills/<name>/SKILL.md` and is symlinked into BOTH `~/.pi/agent/skills/` (pi) and `~/.agents/skills/` (opencode).
- **`commands/`** — shared slash-command templates (markdown with YAML frontmatter). Compatible with both pi (`prompts/`) and opencode (`commands/`). Symlinked into BOTH `~/.pi/agent/prompts/` and `~/.config/opencode/commands/`.
- **`global/`** — canonical global rules. `global/AGENTS.md` is symlinked by BOTH `~/.pi/agent/AGENTS.md` and `~/.config/opencode/AGENTS.md` — same rules in both agents. Editing this file is the only step to change agent behavior across both.
- **`.pi/workflow/`** — pi's live session state (gitignored). Not deployed.

The `pi/shared/` directory must be symlinked alongside the extensions — jiti resolves `./shared/...` imports against the symlink's path in `~/.pi/agent/extensions/`, not its realpath, so a missing `shared` symlink breaks those imports.

## Development Guidelines (pi extensions)

- **Language:** TypeScript, targeting Node.js (pi uses tsx for runtime compilation).
- **Imports:** Use `@earendil-works/pi-coding-agent` for the ExtensionAPI type and helpers. Use `@earendil-works/pi-ai` and `typebox` where needed (as ai-permission-gate and questionnaire do).
- **No build step:** pi loads `.ts` files directly via tsx. Do not add a build/compile step.
- **No npm/pnpm:** This is not a Node.js package. Dependencies are pi's own dependencies (available at runtime).
- **Symlink deployment:** Deployed via `ln -sf` into `~/.pi/agent/extensions/` (extensions + the `shared/` symlink), `~/.pi/agent/agents/`, `~/.pi/agent/skills/`, `~/.pi/agent/AGENTS.md` (canonical global rules), and both `~/.pi/agent/prompts/` + `~/.config/opencode/commands/` (shared commands). See `README.md` for full command list.

## Conventions (pi extensions)

- Each extension exports a default function: `export default function(pi: ExtensionAPI) { ... }`.
- Use `pi.on("tool_call", ...)` for tool call hooks, `pi.registerTool(...)` for custom tools, `pi.registerCommand(...)` for slash commands.
- Prefer environment variables for configuration (prefixed with `PI_`).
- Keep extensions self-contained — do not cross-import between extensions. **Exception:** helpers under `pi/shared/` may be imported by multiple extensions. Prefer this over copy-pasting when the same logic (e.g. notification, herdr state emission) is needed in two or more extensions — duplicated helpers drift silently.
- Write tests as `.mjs` files using Node.js built-in `node:test` and `node:assert/strict`. Run from repo root: `node --test pi/<name>.test.mjs`.

## References

Before improving, adding, or modifying any extension, prompt, agent, skill, or the canonical global rules file, consult the references in [README.md](README.md#references) and pi's and opencode's own documentation.
