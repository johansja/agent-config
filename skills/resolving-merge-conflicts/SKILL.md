---
name: resolving-merge-conflicts
description: Resolve an in-progress git merge or rebase conflict hunk by hunk.
---

Work hunk by hunk. Never `--abort`.

1. **See the state** — `git status`, `git log --oneline -20` on both branches, the conflicting files (`git diff --diff-filter=U`).
2. **Find the primary source** for each conflict (the same notion the `code-review` Spec axis uses): commit messages, the PR/MR, the original issue/ticket. Understand the original **intent** behind each side's change — don't resolve on textual similarity.
3. **Resolve each hunk**, preserving both intents where possible. Where intents genuinely conflict, pick the side whose primary source is stronger (a cited spec/issue beats an unexplained commit) and say which intent you dropped and why.

**Moved or deleted blocks.** When your side moved a section to another file (or deleted it) and the other side edited text inside it, the conflict shows only in the old file. Keep your side there, then port the other side's edit into the new location: diff the other side's change (`git diff <merge-base> <their-tip> -- <old-file>`), find the edited lines in the moved copy, and apply them there. Resolving to "ours" alone silently drops their change, because nothing conflicts in the new file.

Mark each conflict resolved with `git add <file>` as you go, then finish the operation (`git merge --continue` / `git rebase --continue` / `git commit`). Run the test suite before finishing if one fits.
