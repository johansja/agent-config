---
description: "Merge the approved MR, transition the Jira ticket to done, and sync the local default branch."
argument-hint: "[mr url — default: the current branch's MR]"
---

Target: **$ARGUMENTS** — default the open MR for the current branch.

1. `glab mr view`: verify approval and a green pipeline. Either missing → stop, report what's blocking.
2. `glab mr merge`. GitLab blocks it (conflict, or the project's merge method demands an up-to-date branch) → merge the default branch in — never rebase, never force-push — push, wait for the pipeline, and go back to step 1 (a push may reset approvals).
3. Fast-forward the local default branch.
4. Jira: the ticket key rides in the branch name (`<type>-aic-NNNN`). Via the atlassian MCP list the issue's real transitions; transition to the done-equivalent — prefer "Done"; absent or ambiguous → show the actual transitions and ask.
5. Report what shipped and recommend the next thing to `/work`.
