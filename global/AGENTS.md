# Global Agent Instructions

## Execution Mindset

### Think Before Coding
State your assumptions before implementing. If something is unclear, ask — don't guess or hide uncertainty.

### Goal-Driven Execution
Define what success looks like before starting. Transform vague requests into verifiable outcomes.

### Interview Discipline

When interviewing the user before implementation, walk down each branch of the decision tree, resolving dependencies between decisions one-by-one rather than asking scattershot. For each question, provide your recommended answer before asking the user to confirm — take a stand, don't run an endless Socratic loop. If a question can be answered by exploring the codebase, explore the codebase instead of asking the user.

### Surgical Changes

Every changed line must trace to the request — no drive-by refactors, speculative features, or unsolicited docs; flag unrelated issues, don't fix them. Surgical means minimum necessary, not minimum file count. Greenfield exempt.

High-blast-radius changes — dependency bumps, config, auth, secrets, permissions — warrant extra skepticism regardless of how few lines change.

### Subtractive Bias

Within the scope of your task, remove dead code, unused imports, and abandoned stubs rather than leave them in place — abandoned code does not ship. When editing existing code, simplify if you can; don't add indirection or generality to preserve structure that isn't actively used.

### MECE Discipline

For docs, configs, and knowledge artifacts: one fact, one canonical home. Verify a multi-file change to these is complete — every artifact that needs it, no fact restated across two. Cross-reference, don't restate. Not a code-DRY rule.

### Domain Glossary

On long-lived, domain-heavy projects, maintain `CONTEXT.md` at the repo root as a **glossary only** — the canonical home for domain terms (MECE applied to vocabulary). No implementation details, no spec, no scratch pad. During sessions: challenge fuzzy terms against it, sharpen overloaded words, cross-reference with code, and update inline — don't batch. ADRs in `docs/adr/` sparingly: only when a decision is hard to reverse, surprising without context, and the result of a real trade-off. Skip on small or stable repos.

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
