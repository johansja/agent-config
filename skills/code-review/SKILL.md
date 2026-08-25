---
name: code-review
description: Review changes along axes — Standards, Spec, Correctness, Security. Use when the user wants to review a branch, MR/PR, work-in-progress diff, or asks to "review since X".
---

Review a diff along one or more **axes**, each as a parallel `review` subagent so none pollutes the other's context. **Never merge or rerank across axes** — a change can pass one and fail another; side-by-side reporting is the point.

## 1. Resolve the source (before spawning subagents)

Resolve to a **pinned fetch instruction** that the subagents will run themselves. Run the diff once to detect emptiness but do **not** paste the content to subagents — they re-run the pinned instruction themselves.

- **MR/PR** (user names an id/URL): parse `<id>` from the first token; if a URL, extract from `/-/merge_requests/<id>` (or `!<id>`) — GitLab → `glab mr diff <id>`, GitHub → `gh pr diff <id>`. Run `glab mr view <id>` / `gh pr view <id>` to capture title, desc, source branch, and the MR/PR head SHA for pinning.
- **Local** (files, commits, or range named; or nothing): resolve to `git diff <range>`; default `git diff HEAD`, fall back to `git diff HEAD~1` if empty. Pin to `HEAD`.
- Empty diff → stop, report. (Detected by the resolution run; the content is not pasted onward.)

Emit the pinned instruction, e.g. `glab mr diff 4123` or `git diff <sha>~1 <sha>`, and pass it to each subagent in §4.

## 2. Pick axes

Confirm axes with the user if unclear. Default: Standards + Spec + Correctness + Security.

## 3. Per-axis inputs — split between pre-spawn and subagent

- **Pre-spawn (skip-decision only)** — Spec axis only: confirm a spec source exists (MR/PR description or commit messages, else a linked issue via `Closes #N` / `Resolves #N`); if none, skip the axis and do not spawn. This is the one per-axis input that stays pre-spawn — skipping before spawning saves a spawn that would self-skip mid-run.
- **Subagent (fetches its own inputs)** — every other per-axis input moves down. Each subagent is told its axis + the pinned fetch instruction from §1, and gathers:
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
  - **Spec**: source priority — (1) MR/PR description or commit messages, (2) linked issue (`Closes #N` / `Resolves #N`). Do not invent a spec from the diff. (If the Spec subagent is running, a spec source was found at the pre-spawn check; otherwise the axis was skipped.)
  - **Correctness**: changed file paths (from the fetched diff); run the suite if one fits (`go test`/`pytest`/`node --test`), skip if none.
  - **Security**: diff only; no tests.


## 4. Spawn the `review` subagents — one per axis, plus Impact — in parallel

One message, N+1 subagent calls. Each `review` subagent is a thin legwork reviewer. Brief each axis subagent with: its **axis**, the **pinned fetch instruction** from §1 (the subagent runs it itself — do not paste the diff), and the output contract below. **Paste the Fowler baseline in full** into the Standards subagent — it has no other access.

**Output contract** (override the subagent default): one `## <Axis>` heading per axis, per-file findings only, <400 words, no preamble. Standards: cite the violated standard (file+rule) or name the smell, distinguish hard violations from judgement calls, skip tooling-enforced. Spec: (a) missing/partial, (b) scope creep, (c) wrong — quote the spec line per finding; end with a `Spec quote:` line carrying the source excerpt verbatim (## Motivation lifts it — do not re-fetch). Correctness/Security: severity (**Critical**/**Warning**/**Suggestion**), file+line, why.

**Impact subagent** — the pinned fetch instruction only. Report `## Impact`, per-file, <400 words: (1) behavior deltas the diff introduces — API/contract, data shape, config/flags, defaults, user-visible; (2) bounded blast radius — direct callers of changed exported symbols, one hop only, flagging which need updates. Non-pass/fail: Impact never affects the verdict.

## 5. Aggregate

Lead with `## Changes` — one or two lines: files touched + net behaviour. Then `## Motivation` — why the change exists, quoted from the spec source (MR/PR desc captured in §1, else the Spec subagent's `Spec quote:`); `undetermined` when no spec source exists — never infer intent from the diff. Then `## Impact` as reported by its subagent. Then each axis under its `## <Axis>` heading. End each axis with one line: total findings + worst issue (if any). Final `## Verdict` — single line: `PASS` or `FAIL`; FAIL if any Standards hard violation, any Spec finding, or any Critical, else PASS; one short clause of reason. **Do not merge or rerank across axes.**
