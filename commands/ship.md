---
description: "Commit, push, and open or update the MR; keep CI green up to 3 rounds; assign reviewers when green."
argument-hint: "[--draft] [--reviewers a,b,c]"
---

Ship the current branch. Flags: **$ARGUMENTS**

1. Dirty working tree → commit it, following the repo's commit-message convention (Conventional Commits if none). Already clean → continue.
2. Push the branch. Open MR for this branch → reuse it; none → `glab mr create --fill` (append `--draft` if asked). Never open a duplicate. When creating, the description opens with the why (the existence grilling verdict's restatement, if the session produced one) and links the uppercase ticket key from the branch name, before the `--fill` body.
3. Poll the MR's pipeline. On failure: read the failing job logs, fix, commit, push. Cap at 3 CI rounds, then stop and name the failing jobs.
4. Pipeline green → assign. Assignee: the authenticated `glab` user. Reviewers, first found wins:
   - `--reviewers a,b,c` argument;
   - the GitLab project path (`<group>/<project>`) looked up in `~/.pi/agent/ship-reviewers.json`;
   - neither → skip assignment, and say how to arm it (the arg, or one line in that file).

   Names in the map and the arg are display names. Resolve each against project members via `glab api`, show the name → account mapping, and assign only on the user's yes.
