---
name: code-review
description: Review changes along axes — Standards, Spec, Correctness, Security. Use when the user wants to review a branch, MR/PR, work-in-progress diff, or asks to "review since X".
---

Review a diff along one or more **axes**, each as a parallel `review` subagent so none pollutes the other's context. **Never merge or rerank across axes** — a change can pass one and fail another; side-by-side reporting is the point.

## 1. Acquire the diff

- **MR/PR** (user names an id/URL): `glab mr view <id>` (title, desc, source branch, commits) + `glab mr diff <id>` — or `gh pr` for GitHub. Parse `<id>` from the first token.
- **Local** (files, commits, or range named; or nothing): `git diff <range>`; default `git diff HEAD`, fall back to `git diff HEAD~1` if empty.
- Empty diff → stop, report.

## 2. Pick axes

Confirm axes with the user if unclear. Default: MR/PR → Standards + Spec; local → Correctness + Security + Standards.

## 3. Per-axis inputs

- **Standards**: repo standards files (`AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` if present) + the Fowler baseline below. Judgement calls, never hard violations; a documented standard overrides; skip anything tooling enforces.
  - **Mysterious Name** → rename
  - **Duplicated Code** → extract
  - **Feature Envy** → move
  - **Data Clumps** → bundle into a type
  - **Primitive Obsession** → give it a type
  - **Repeated Switches** → polymorphism/shared map
  - **Shotgun Surgery** → gather
  - **Divergent Change** → split
  - **Speculative Generality** → delete
  - **Message Chains** → hide behind one method
  - **Middle Man** → cut
  - **Refused Bequest** → composition over inheritance
- **Spec**: source priority — (1) MR/PR description, (2) linked issue (`Closes #N` / `Resolves #N`), (3) if both absent: output "no spec available" and skip the axis. Do not invent a spec from the diff.
- **Correctness**: changed file paths; run the suite if one fits (`go test`/`pytest`/`node --test`), skip if none.
- **Security**: diff only; no tests.


## 4. Spawn one `review` subagent per axis, in parallel

One message, N subagent calls. Each `review` subagent is a thin legwork reviewer. Brief each with: full diff + commit list + its per-axis inputs. **Paste the Fowler baseline in full** into the Standards subagent — it has no other access.

**Output contract** (override the subagent default): one `## <Axis>` heading per axis, per-file findings only, <400 words, no preamble. Standards: cite the violated standard (file+rule) or name the smell, distinguish hard violations from judgement calls, skip tooling-enforced. Spec: (a) missing/partial, (b) scope creep, (c) wrong — quote the spec line per finding. Correctness/Security: severity (**Critical**/**Warning**/**Suggestion**), file+line, why.

## 5. Aggregate

Lead with `## Changes` — one or two lines: files touched + net behaviour. Then each axis under its `## <Axis>` heading. End each axis with one line: total findings + worst issue (if any). Final `## Verdict` — single line: `PASS` or `FAIL`; FAIL if any Standards hard violation or any Spec finding, else PASS; one short clause of reason. **Do not merge or rerank across axes.**

## 6. Posting

Local by default; post nothing. If reviewing an MR/PR **and** the user asks to post, post **one comment per axis** (e.g. `glab mr note <id> -m "<axis-report>"`), never one merged comment. The verdict stays local, never posted.
