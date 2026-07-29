---
name: resolving-merge-conflicts
description: Resolve an in-progress git merge or rebase conflict hunk by hunk. Use when a merge/rebase is paused on conflicts and the user needs help resolving.
---

Work hunk by hunk. Never `--abort`.

1. **See the state** — `git status`, `git log --oneline -20` on both branches, the conflicting files (`git diff --diff-filter=U`).
2. **Find the primary source** for each conflict (the same notion the `code-review` Spec axis uses): commit messages, the PR/MR, the original issue/ticket. Understand the original **intent** behind each side's change — don't resolve on textual similarity.
3. **Resolve each hunk**, preserving both intents where possible. Where intents genuinely conflict, pick the side whose primary source is stronger (a cited spec/issue beats an unexplained commit) and say which intent you dropped and why.

Mark each conflict resolved with `git add <file>` as you go, then finish the operation (`git merge --continue` / `git rebase --continue` / `git commit`). Run the test suite before finishing if one fits.
