---
description: "Commit, push, and open or update the MR with auto-merge on; keep CI green up to 3 rounds."
argument-hint: "[--draft] [--reviewers a,b,c]"
---

Ship the current branch. Flags: **$ARGUMENTS**

1. Dirty working tree → commit it, following the repo's commit-message convention (Conventional Commits if none). Already clean → continue.
2. Run the mootness check (`grilling` skill) against the ticket key in the branch name (`<type>-aic-NNNN`), via the atlassian MCP. Moot → stop and report; do not push or open an MR.
3. Push the branch. Open MR for this branch → reuse it; none → `glab mr create --fill --auto-merge --assignee <the authenticated glab user>`, or `--draft` instead of `--auto-merge` if asked. Never open a duplicate. When creating, the description opens with the why (the existence grilling verdict's restatement, if the session produced one) and links the uppercase ticket key from the branch name, before the `--fill` body.
4. Reviewers. Read the MR's reviewers right after it opens: GitLab may already have assigned code owners. None assigned → `--reviewers a,b,c` if given, otherwise ask the user whom to request. The names are display names: resolve each against project members via `glab api`, show the name → account mapping, and assign only on the user's yes.
5. Poll the MR's pipeline. On failure: read the failing job logs, fix, commit, push. Every push cancels auto-merge, so set it again after each one with `glab api -X PUT projects/:id/merge_requests/<iid>/merge -F auto_merge=true` (`glab mr merge` refuses while it still sees the previous pipeline). Cap at 3 CI rounds, then stop and name the failing jobs. Green → stop; GitLab merges once approvals and threads allow.
