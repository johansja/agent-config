---
description: GitLab MR adapter for the code-review skill — fetches MR diff + spec via glab, runs Standards+Spec review, optionally posts as MR comments.
argument-hint: "<mr> [--post]"
---

Review GitLab merge request **$1** using the `code-review` skill's Standards + Spec axes. This prompt handles the GitLab-specific parts (fetching the MR, posting comments); the review itself follows the code-review skill.

## 1. Resolve the MR

Run `glab mr view $1` to fetch title, description, author, source branch, and commit list. If this fails (bad MR id, no auth, not a GitLab repo), stop and report the error — do not proceed to review.

## 2. Capture the diff

Run `glab mr diff $1`. If the diff is empty, stop — nothing to review.

## 3. Identify the spec source

The **spec** for an MR is, in priority order:
1. The MR description (what the author said they'd change).
2. A linked issue in the description (`Closes #N`, `Resolves #N`) — fetch via `glab issue view <N>`.
3. If both are absent or empty, note "no spec available" — the Spec axis skips. Do not invent a spec from the diff.

## 4. Run the code-review skill

Read `~/.agents/skills/code-review/SKILL.md` and run its Standards + Spec review against the MR diff from step 2, using the spec source from step 3 as the Spec axis input. Skip the skill's "pin the fixed point" step — the diff is already captured. Follow the skill's axis briefs, smell baseline, and sub-agent dispatch exactly.

## 5. Aggregate locally

Present both reports in this session under `## Standards` and `## Spec`, per the code-review skill's aggregation rules. **Do not merge, do not rerank.**

## 6. Posting — local by default

By default, **do not post anything to the MR.** Reports stay in this session.

If the user passed `--post` (check `${@:2}`) or asks to post after seeing the local reports, post **two separate comments** to the MR — one per axis — via:
```
glab mr note $1 -m "<standards-report>"
glab mr note $1 -m "<spec-report>"
```
Two comments, not one. The don't-merge discipline is the point.
