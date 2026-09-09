---
description: "Launch a unit of work in Herdr — worktree + agent kickoff in one step; ticket claim happens in-session after a readiness check. Routes Jira tickets and GitLab MRs."
argument-hint: "<jira ticket (URL or AIC-NNNN) | gitlab MR url> [--kind pi|opencode|claude]"
---

Target: **$ARGUMENTS**

Orchestrates the enclosing Herdr session. Gate: stop unless `HERDR_ENV=1`. Load the `herdr` skill for CLI contracts; learn exact syntax from the installed binary (`herdr worktree`, `herdr workspace`, `herdr agent`) before mutating. Parse IDs from JSON responses. Create everything with `--no-focus`; the user's focus stays in the calling pane.

Base repo: git root of the current directory. Worktrees live at `~/.herdr/worktrees/<repo-name>/`.

## Route

- `AIC-\d+` or a `bitdeer.atlassian.net/browse/<KEY>` URL → **Ticket flow**.
- A GitLab `merge_requests` URL → **MR flow**.
- Neither → stop; report what $ARGUMENTS looked like.
- Optional `--kind <k>` sets the spawned agent kind (default `pi`).

## Ticket flow

1. Resolve the ticket via the atlassian MCP: key, summary, type, assignee, status.
2. Guard — read-only: ticket assigned to someone else and *In Progress* → stop, report, create nothing.
3. Create the herdr worktree, branch `<type>-<key>` lowercase (type mapped from the ticket: feat/fix/chore/docs/…), on an up-to-date default branch. If the branch/worktree already exists, reuse it and say so.
4. Create a herdr **workspace** named `<key>-<short-slug>`; start the agent in its root pane, cwd = the new worktree.
5. Kickoff via `herdr agent prompt` — do not wait for completion. Report the workspace ID. Prompt text:

   ```
   /grill-with-docs work on <ticket-url>

   First assess readiness: is this ticket actionable as written — not blocked,
   not already done, no prerequisite outside it? If ready: claim it (assign to
   me, transition to In Progress; skip steps already satisfied), then run the
   session. If not ready: reply starting with `NOT-READY:` plus what is missing
   or blocking, do not claim, and stop.
   ```

## MR flow

1. `glab mr view <url>`: source branch, repo. The base repo must be the current git repo's origin — otherwise stop and report.
2. Create the herdr worktree tracking the MR's source branch, reusing any existing one.
3. Workspace named `mr-<iid>-<short-slug>`; start the agent in its root pane, cwd = the worktree.
4. Kickoff: `herdr agent prompt <name> "/gitlab-review <mr-url>"` — do not wait. Report the workspace ID.

## Rules

- One work item per invocation; never batch tickets.
- `/work` never mutates ticket state. A ticket transitions to *In Progress* only inside the spawned session, after readiness is established.
- /work only sets the table: worktree, claim, agent. Cleanup of finished workspaces/worktrees is a separate decision, never automatic.
