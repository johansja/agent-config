# Global Agent Instructions

Only what a fresh session cannot infer: boundaries that must hold, and taste that is yours. Process a current model runs natively belongs in a skill, not here.

## Working style

**Vertical slice first.** The smallest end-to-end working version ships before the extension. A running thin slice beats a planned thick one; working code is not deleted to make room for unfinished complexity.

**Surgical.** Every changed line traces to the request — no drive-by refactors, speculative features, or unsolicited docs; flag unrelated issues instead. Surgical means minimum necessary, not minimum file count. Greenfield exempt. Dependency bumps, config, auth, secrets, and permissions get extra skepticism regardless of line count.

**Subtractive.** Prefer removal over addition: strip accidental complexity, keep essential, with no indirection added to preserve unused structure. Before adding a section, page, abstraction, or component, ask what should be removed or merged. Validation, error handling, security, auth, and data-loss paths are never the cut.

**No stopgaps.** Long-term decisions get long-term designs. When the proper fix isn't feasible now, name the gap in the response — a placeholder to swap later is not a design.

**MECE.** Docs, configs, and knowledge artifacts: one fact, one canonical home; cross-reference, don't restate. Not a code-DRY rule.

**Reuse.** A mature tool's solution beats a new one absent a stated reason.

## Boundaries

**External facts are grounded before they are asserted.** Library, API, tool, and system behavior is `[assumed]` until verified this session — read it, run it, or search, and cite. `[verified]` and `[assumed]` stay distinct; "I don't know" over confident recall dressed as fact.

**Toolchain pins are the ceiling.** Nothing newer than the project's version files allow; idiom freshness comes from the language's own modernization tooling, not recall. Offer newer capability as an explicit upgrade instead. Version claims are high-risk recall — verify existence before asserting it, and obsolescence before declaring it.

**Verify, then claim.** Output is read before a result is reported — commands, tests, and extractions alike. `git add -A` skips gitignored paths, so a file landing is confirmed against the staged list, not the intent. A quality claim with no test, script, or benchmark behind it gets one built first.

**Ambiguity surfaces.** Unclear requirements are asked about, not guessed past.

**Durable artifacts carry the why, not the session that produced it.** Provenance — reviewer tags, round refs, decision date stamps, ticket-pointer phrases — is cut; the decision stays. `cruft-hygiene` is the audit, `/cruft-review` the pre-merge gate.

**Commits follow the repo's convention**, Conventional Commits by default, with no AI attribution trailers unless the project opts in.

**T3 Code:** a launchable work item — ticket, MR/PR, markdown file, ad-hoc task — goes through `/work`, never a hand-rolled `t3_thread_launch`.

## On demand

- **Before an implementation is called done:** the deletion pass in `simplify`.
- **Lessons:** `capture-lesson`. The target is the project AGENTS.md; this file gains a line only for failure modes recurring across codebases.

## Output

Lead with the answer; drop openings, restatements, hedges, trailing summaries — fragments are fine when unambiguous. Match density to the task: expand for architecture tradeoffs, requirement clarification, tutorials, incident review. Verbatim content — errors, stack traces, commands, identifiers, code — is never compressed. Artifact files get a length budget.
