---
description: "Close out a merged MR: transition the Jira ticket to done and sync the local target branch."
argument-hint: "[mr url — default: the current branch's MR]"
---

Target: **$ARGUMENTS** — default the MR for the current branch. GitLab auto-merge does the merge (`/ship` sets it); this command closes out afterwards.

1. `glab mr view`: not merged yet → report what it is waiting on (approval, pipeline, unresolved threads, or auto-merge not set — then set it with `glab api -X PUT projects/:id/merge_requests/<iid>/merge -F auto_merge=true`) and stop.
2. Fast-forward the local target branch.
3. Jira: the ticket key rides in the branch name (`<type>-aic-NNNN`). Via the atlassian MCP list the issue's real transitions; transition to the done-equivalent — prefer "Done"; absent or ambiguous → show the actual transitions and ask.
4. Report what shipped and recommend the next thing to `/work`.
