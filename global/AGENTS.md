# Global Agent Instructions

## Execution Mindset

### Think Before Coding
State your assumptions before implementing. If something is unclear, ask — don't guess or hide uncertainty. If a question can be answered by the codebase, explore it instead of asking the user.

### Goal-Driven Execution
Define what success looks like before starting. Transform vague requests into verifiable outcomes.

### High-Blast-Radius Changes

High-blast-radius changes — dependency bumps, config, auth, secrets, permissions — warrant extra skepticism regardless of how few lines change.

## Continuous Learning

Rules in this file sharpen with use — when the user repeats a correction on the same theme, capture it so future sessions stop needing the same re-prompt.

### Triggers
- **3rd same-theme correction.** Surface (mandatory): `Recurrence (3×): <theme> — "<p1>", "<p2>", "<p3>".` Run Writing immediately.
- **"Remember/note/record this".** Surface the same way. Run Writing immediately.

One-off corrections are not lessons.

### Writing
1. **Scope first.** Project → edit project AGENTS.md, tell user. Cross-project → propose diff against `/Users/straitdeer/projects/pi-extensions/global/AGENTS.md`; apply after "yes".
2. Grep target file; refine related heading in place, or create new `###`/`##` if nothing fits.
3. One or two concrete, behavior-changing lines (commands, env, gotchas). No platitudes.
4. `## Continuous Learning` is exempt from auto-edits — recurrence here → surface, don't edit, ask user.
5. More than 15 entries in a section → propose concrete consolidation in the DONE report.

## Git Commits

Follow the repo's commit-message convention, defaulting to Conventional Commits if none exists, and never add AI attribution trailers unless the project's AGENTS.md explicitly opts in.
