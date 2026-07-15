# Agent Instructions — Pi Extensions

## Project Overview

This repository contains custom extensions for the pi coding agent. Extensions are TypeScript files that use pi's ExtensionAPI to hook into the agent lifecycle (tool calls, session events, commands, etc.).

## Repository Structure

- Single-file extensions live at the repo root (e.g., `ai-permission-gate.ts`).
- Multi-file extensions live in their own directory (e.g., `team/index.ts`, `team/agents.ts`).
- Shared helpers live under `shared/` (e.g., `shared/notify.ts`). It has no `index.ts`/`package.json`, so pi's loader does not treat it as an extension.
- Test files sit alongside their extension (e.g., `ai-permission-gate.test.mjs`).
- Reusable prompt templates (slash commands) live under `prompts/` (e.g., `prompts/mr-review.md`), symlinked into `~/.pi/agent/prompts/`. Not extensions — a different artifact type, but maintained here for shared version control and symlink deployment.
- Subagent templates (markdown) live under `agents/` (e.g., `agents/reviewer.md`), symlinked into `~/.pi/agent/agents/`. Same version-control + symlink pattern as `prompts/`.

## Development Guidelines

- **Language:** TypeScript, targeting Node.js (pi uses tsx for runtime compilation).
- **Imports:** Use `@earendil-works/pi-coding-agent` for the ExtensionAPI type and helpers. Use `@earendil-works/pi-ai` and `typebox` where needed (as the team extension does).
- **No build step:** pi loads `.ts` files directly via tsx. Do not add a build/compile step.
- **No npm/pnpm:** This is not a Node.js package. Dependencies are pi's own dependencies (available at runtime).
- **Symlink deployment:** Extensions are deployed by symlinking into `~/.pi/agent/extensions/` with `ln -sf`. The `shared/` directory must be symlinked too — jiti resolves `./shared/...` imports against the symlink's path in the extensions dir, not its realpath, so missing the symlink breaks those imports.

## Conventions

- Each extension exports a default function: `export default function(pi: ExtensionAPI) { ... }`.
- Use `pi.on("tool_call", ...)` for tool call hooks, `pi.registerTool(...)` for custom tools, `pi.registerCommand(...)` for slash commands.
- Prefer environment variables for configuration (prefixed with `PI_`).
- Keep extensions self-contained — do not cross-import between extensions. **Exception:** helpers under `shared/` may be imported by multiple extensions. Prefer this over copy-pasting when the same logic (e.g. notification, herdr state emission) is needed in two or more extensions — duplicated helpers drift silently.
- Write tests as `.mjs` files using Node.js built-in `node:test` and `node:assert/strict`.
