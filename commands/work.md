---
description: "Launch a unit of work in Herdr — worktree + agent kickoff; ticket claim happens in-session after a readiness check. Routes Jira tickets, GitLab MRs, markdown files, and ad-hoc tasks."
argument-hint: "<jira ticket (URL or AIC-NNNN) | gitlab MR url | markdown file | ad-hoc task> [--kind pi|opencode|claude]"
---

Target: **$ARGUMENTS**

Orchestrates the enclosing Herdr session. Gate: stop unless `HERDR_ENV=1`. Load the `herdr` skill for CLI contracts; learn exact syntax from the installed binary (`herdr worktree`, `herdr workspace`, `herdr agent`) before mutating. Parse IDs from JSON responses. Create everything with `--no-focus`.

Base repo: git root of the current directory. Worktrees live at `~/.herdr/worktrees/<repo-name>/`.

## Route

- A bare `AIC-\d+` key or a `bitdeer.atlassian.net/browse/<KEY>` URL → **Ticket flow**.
- A GitLab `merge_requests` URL → **MR flow**.
- A path ending in `.md` → **Markdown flow**.
- Any other non-empty text → **Ad-hoc flow**.
- Empty → stop; report what $ARGUMENTS looked like.
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
   not moot (the mootness check, `grilling` skill), no prerequisite outside
   it? If ready: claim it (assign to
   me, transition to In Progress; skip steps already satisfied), then run the
   session. If not ready: reply starting with `NOT-READY:` plus what is missing
   or blocking, do not claim, and stop.

   Lifecycle: an existence grilling verdict stops or trims the work before
   implementation — kill/defer: propose a Jira comment + transition via the
   atlassian MCP (list the real transitions; Duplicate resolution when a twin
   exists); descope: propose trimming the ticket's title and description.
   Execute these writes only on the user's yes. When implementation lands —
   run the simplify pass, /fix-hard-violations, then /ship. On review
   comments: /mr-comments. On approval: /merge.
   ```

## MR flow

1. `glab mr view <url>`: source branch, repo. The base repo must be the current git repo's origin — otherwise stop and report.
2. Create the herdr worktree tracking the MR's source branch, reusing any existing one.
3. Workspace named `mr-<iid>-<short-slug>`; start the agent in its root pane, cwd = the worktree.
4. Kickoff via `herdr agent prompt` with `/gitlab-review <mr-url>` — do not wait for completion. Report the workspace ID.

## Markdown flow

The file is a read-only spec — neither `/work` nor the spawned session writes to it. A Jira key inside the file routes claiming through the ticket mechanics.

1. Verify the file exists (resolve against the current directory); missing → stop and report. Slug = basename minus `.md`, lowercase.
2. `git status --porcelain -- <file>`: untracked → the kickoff passes the main-repo absolute path with the caveat `(untracked in the main checkout — read it there; never commit it)`; tracked → pass the path as-is.
3. Create the herdr worktree, branch `md-<slug>` lowercase, on an up-to-date default branch. If the branch/worktree already exists, reuse it and say so.
4. Workspace `md-<short-slug>`; start the agent in its root pane, cwd = the new worktree.
5. Kickoff via `herdr agent prompt` — do not wait for completion. Report the workspace ID. Prompt text:

   ```
   /grill-with-docs work on <markdown file path>

   First assess readiness: is this item actionable as written — not blocked,
   not moot (the mootness check, `grilling` skill), no prerequisite outside
   it? If a Jira ticket is referenced, claim it (assign to me, transition to
   In Progress; skip steps already satisfied), then run the session. If not
   ready: reply starting with `NOT-READY:` plus what is missing or blocking,
   do not claim, and stop.

   Lifecycle: an existence grilling verdict stops or trims the work before
   implementation — report it and stop; if the file references a Jira ticket,
   propose that ticket's verdict writes via the atlassian MCP (comment +
   transition on kill/defer; title/description trim on descope), executed
   only on the user's yes. The markdown file itself is never written — its
   fate stays with the user. When implementation lands — run the simplify
   pass, /fix-hard-violations, then /ship. On review comments: /mr-comments.
   On approval: /merge.
   ```

## Ad-hoc flow

The description is the spec — there is no artifact: nothing is read, written, or claimed. A ticket key inside the description is context, not a claim target.

1. Slug = first few kebab-case words of the description, lowercase.
2. Create the herdr worktree, branch `adhoc-<slug>` lowercase, on an up-to-date default branch. If the branch/worktree already exists, reuse it and say so.
3. Workspace `adhoc-<short-slug>`; start the agent in its root pane, cwd = the new worktree.
4. Kickoff via `herdr agent prompt` — do not wait for completion. Report the workspace ID. Prompt text:

   ```
   /grill-with-docs work on: <description>

   First assess readiness: is this task actionable as written — not blocked,
   not moot (the mootness check, `grilling` skill), no prerequisite outside
   it? If not ready: reply starting with `NOT-READY:` plus what is missing
   or blocking, and stop.

   Lifecycle: an existence grilling verdict stops or trims the work before
   implementation — report it and stop. When implementation lands — run the
   simplify pass, /fix-hard-violations, then /ship. On review comments:
   /mr-comments. On approval: /merge.
   ```

## Rules

- One work item per invocation; never batch.
- `/work` only sets the table: worktree, workspace, agent. Cleanup of finished workspaces/worktrees is a separate decision, never automatic.
