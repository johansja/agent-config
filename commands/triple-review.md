---
description: Three-axis parallel code review — correctness, security, style run as parallel subagents, reported unmerged. Local only.
---

Three-axis review of recent changes along **correctness**, **security**, and **style**, in parallel, without merging. The axes are deliberately separate — a change can pass one and fail another.

## 1. Resolve the target

If the user named files, commits, or a range in conversation, review that. Otherwise: `git diff HEAD` (staged + unstaged), or `git diff HEAD~1` (last commit) if that's empty. Capture the diff. If empty, stop — nothing to review.

## 2. Fire three `review` subagents in parallel

### Correctness axis

Brief: full diff + changed file paths. Scope: execution paths, edge cases, error handling, concurrency, resource leaks. Run the test suite if one fits (`go test`/`pytest`/`node --test`); skip if none. Ignore style/security unless they cause a correctness bug.

Output (override review agent's default): one `## Correctness` heading, findings only — severity (**Critical**/**Warning**/**Suggestion**), file+line, why wrong. No preamble, no restating the code.

### Security axis

Brief: full diff. Scope: input trust boundaries, auth/authz surface, secret handling, injection (SQL/shell/path/HTML), fail-open paths. Do not run tests. Ignore correctness/style unless they create a security hole.

Output: one `## Security` heading, same severity tags and citation format. No padding.

### Style axis

Brief: full diff + repo standards files (`AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` if present) + the Fowler baseline below.

Fowler smells — judgement calls, never hard violations; a documented standard overrides; skip anything tooling enforces:
- **Mysterious Name** → rename.
- **Duplicated Code** (same shape across the diff) → extract.
- **Feature Envy** (method reaches into another's data more than its own) → move.
- **Data Clumps** (same fields/params travelling together) → bundle into a type.
- **Primitive Obsession** → give it a type.
- **Repeated Switches** (same switch/if-cascade across the diff) → polymorphism or shared map.
- **Shotgun Surgery** (one change, scattered edits) → gather.
- **Divergent Change** (one file, several unrelated reasons) → split.
- **Speculative Generality** → delete.
- **Message Chains** (`a.b().c().d()`) → hide behind one method.
- **Middle Man** (mostly delegates) → cut.
- **Refused Bequest** → drop inheritance, use composition.

Output: one `## Style` heading, per-file findings — cite the violated standard (file+rule) or name the smell, quote the hunk. Distinguish hard violations (documented-standard breach) from judgement calls. Skip tooling-enforced. No padding.

## 3. Aggregate locally

Present all three under `## Correctness`, `## Security`, `## Style`. **Do not merge or rerank** across axes. End with one summary line per axis: total findings + worst issue (if any).

## 4. Local only

Post nothing. Reports stay in this session.
