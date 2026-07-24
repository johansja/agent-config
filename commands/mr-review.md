---
description: Two-axis review of a GitLab MR — Standards and Spec run as parallel subagents, reported unmerged. Local by default; add --post to publish as two separate MR comments.
argument-hint: "<mr> [--post]"
---

Review the given GitLab MR along two axes, in parallel, without merging. The axes are deliberately separate — a change can pass one and fail the other.

## 0. Parse args

From `$ARGUMENTS`: MR id = first token (digits or URL); `POST=true` if `--post` appears anywhere. Use `<MR-ID>` (parsed id) in every `glab` call.

## 1-2. Resolve + diff

`glab mr view <MR-ID>` (title, description, author, source branch, commits) and `glab mr diff <MR-ID>`. If either fails or the diff is empty, stop and report.

## 3. Spec source (priority)

1. MR description.
2. Linked issue (`Closes #N` / `Resolves #N`) via `glab issue view <N>`.
3. If both absent/empty: Spec axis outputs "no spec available" and skips — do not invent one from the diff.

## 4. Fire two `review` subagents in parallel

### Standards axis

Brief: full diff + commit list + repo standards files (`AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` if present) + the Fowler baseline below.

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

Output (override review agent's default): one `## Standards` heading, per-file findings, each citing the violated standard (file+rule) or naming the smell, quoting the hunk. Distinguish hard violations (documented-standard breach) from judgement calls. Skip tooling-enforced. <400 words.

### Spec axis

Brief: full diff + spec source from step 3.

Output (override review agent's default): one `## Spec` heading, three categories — (a) spec requirements missing/partial in the diff, (b) diff behaviour not in the spec (scope creep), (c) requirements implemented wrong. Quote the spec line per finding. <400 words. If no spec, output only "no spec available."

## 5. Aggregate locally

Present both reports under `## Standards` and `## Spec`. **Do not merge or rerank** across axes. End with one summary line per axis: total findings + worst issue (if any).

## 6. Posting — local by default

Default: post nothing; reports stay in session. If `POST=true` (or the user asks after seeing local reports), post **two separate MR comments**, one per axis:
```
glab mr note <MR-ID> -m "<standards-report>"
glab mr note <MR-ID> -m "<spec-report>"
```
Two comments, not one — the don't-merge discipline is the point.
