---
description: Two-axis review of a GitLab MR — Standards and Spec run as parallel subagents, reported unmerged. Local by default; add --post to publish as two separate MR comments.
argument-hint: "<mr> [--post]"
---

Review GitLab merge request **$1** along two axes, in parallel, without merging. The two axes are deliberately separate — a change can pass one and fail the other.

## 1. Resolve the MR

Run `glab mr view $1` to fetch title, description, author, source branch, and commit list. If this fails (bad MR id, no auth, not a GitLab repo), stop and report the error — do not proceed to review.

## 2. Capture the diff

Run `glab mr diff $1`. If the diff is empty, stop — nothing to review.

## 3. Identify the spec source

The **spec** for an MR is, in priority order:
1. The MR description (what the author said they'd change).
2. A linked issue in the description (`Closes #N`, `Resolves #N`) — fetch via `glab issue view <N>`.
3. If both are absent or empty, the **Spec axis** reports "no spec available" and skips. Do not invent a spec from the diff.

## 4. Fire two parallel subagents

Fire both in parallel in one message. Each dispatches a `review` subagent.

### Standards axis

Task brief — give the subagent:
- The full diff from step 2
- The commit list from step 1
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

Output (override the review agent's default format): under a single `## Standards` heading, list per-file findings. For each: cite the violated standard (file + rule) or name the smell, quote the hunk. Distinguish hard violations (documented-standard breach) from judgement calls (smells). Skip what tooling enforces. Under 400 words.

### Spec axis

Task brief — give the subagent:
- The full diff from step 2
- The spec source from step 3 (MR description or linked issue body)

Output (override the review agent's default format): under a single `## Spec` heading, three categories:
- (a) Requirements from the spec that are missing or partial in the diff
- (b) Behaviour in the diff not asked for in the spec (scope creep)
- (c) Requirements that look implemented but wrong

Quote the spec line for each finding. Under 400 words. If no spec, output only "no spec available" and stop.

## 5. Aggregate locally

Present both reports in this session under `## Standards` and `## Spec`. **Do not merge, do not rerank.** End with one summary line per axis: total findings + worst issue (if any). Do not pick a single winner across axes.

## 6. Posting — local by default

By default, **do not post anything to the MR.** Reports stay in this session.

If the user passed `--post` (check `${@:2}`) or asks to post after seeing the local reports, post **two separate comments** to the MR — one per axis — via:
```
glab mr note $1 -m "<standards-report>"
glab mr note $1 -m "<spec-report>"
```
Two comments, not one. The don't-merge discipline is the point.
