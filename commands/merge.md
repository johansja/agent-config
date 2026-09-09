---
description: "Merge the approved MR, transition the Jira ticket to done, and sync the local default branch."
argument-hint: "[mr url — default: the current branch's MR]"
---

Target: **$ARGUMENTS** — default the open MR for the current branch.

1. `glab mr view`: verify approval and a green pipeline. Either missing → stop, report what's blocking.
2. Branch behind the repo's default branch → merge the default branch in, push, wait for green. No rebases, no force-pushes.
3. `glab mr merge`. Fast-forward the local default branch.
4. Jira: the ticket key rides in the branch name (`<type>-aic-NNNN`). Via the atlassian MCP list the issue's real transitions; transition to the done-equivalent — prefer "Done"; absent or ambiguous → show the actual transitions and ask.
5. Report what shipped and recommend the next thing to `/work`.
