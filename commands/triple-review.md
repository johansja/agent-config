---
description: Three-axis parallel code review — correctness, security, style run as parallel subagents, reported unmerged. Local only.
---

Three-axis review of recent changes along **correctness**, **security**, and **style**, in parallel, without merging. The three axes are deliberately separate — a change can pass one and fail another.

## 1. Resolve the target

If the user named files, commits, or a range in conversation, review that. Otherwise review uncommitted/recent work:

- Default: `git diff HEAD` (staged + unstaged uncommitted changes)
- If that's empty: `git diff HEAD~1` (the last commit)

Capture the diff. If empty, stop — nothing to review.

## 2. Fire three parallel subagents

Fire all three in parallel in one message. Each dispatches a `review` subagent.

### Correctness axis

Task brief — give the subagent:
- The full diff from step 1
- The list of changed files and their repo paths

Scope: execution paths, edge cases, error handling, concurrency, resource leaks. Run the test suite (`go test`, `pytest`, `node --test`, whatever fits — or skip if none). Ignore style and security unless they cause a correctness bug.

Output (override the review agent's default format): under a single `## Correctness` heading, findings only. For each: severity (**Critical** / **Warning** / **Suggestion**), file + line citation, why it's wrong. No preamble, no restating what the code does. Stop when covered.

### Security axis

Task brief — give the subagent:
- The full diff from step 1

Scope: input trust boundaries, auth/authz surface, secret handling, injection (SQL/shell/path/HTML), fail-open paths. Do not run tests. Ignore correctness and style unless they create a security hole.

Output: under a single `## Security` heading, findings only. Same severity tags, same citation format. No padding.

### Style axis

Task brief — give the subagent:
- The full diff from step 1
- Any repo standards files: read `AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` at the repo root if present, and include their coding-rule sections
- The Fowler smell baseline below, pasted in full

Fowler smell baseline — each is a judgement call, never a hard violation. A documented repo standard always overrides. Skip anything tooling already enforces.
- **Mysterious Name** — function/variable/type whose name doesn't reveal what it does. → rename.
- **Duplicated Code** — same logic shape in multiple places in the diff. → extract.
- **Feature Envy** — method reaching into another object's data more than its own. → move it.
- **Data Clumps** — same few fields/params travelling together. → bundle into a type.
- **Primitive Obsession** — primitive standing in for a domain concept. → give it a type.
- **Repeated Switches** — same switch/if-cascade on the same type across the diff. → polymorphism or shared map.
- **Shotgun Surgery** — one logical change forces scattered edits across many files. → gather into one module.
- **Divergent Change** — one file edited for several unrelated reasons. → split.
- **Speculative Generality** — abstraction/params/hooks for needs the spec doesn't have. → delete.
- **Message Chains** — long `a.b().c().d()` navigation. → hide behind one method.
- **Middle Man** — class/function that mostly delegates onward. → cut it.
- **Refused Bequest** — subclass ignoring most of what it inherits. → drop inheritance, use composition.

Output: under a single `## Style` heading, per-file findings only. For each: cite the violated standard (file + rule) or name the smell, quote the hunk. Distinguish hard violations (documented-standard breach) from judgement calls (smells). Skip what tooling enforces. No padding.

## 3. Aggregate locally

Present all three reports in this session under `## Correctness`, `## Security`, and `## Style`. **Do not merge, do not rerank.** End with one summary line per axis: total findings + worst issue (if any). Do not pick a single winner across axes.

## 4. Local only

Do not post anywhere. Reports stay in this session.
