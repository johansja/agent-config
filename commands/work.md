---
description: "Launch a unit of work in the active backend (T3 Code or Herdr) — worktree + agent kickoff; ticket claim happens in-session after a readiness check. Routes Jira tickets, GitLab MRs, markdown files, and ad-hoc tasks."
argument-hint: "<jira ticket (URL or AIC-NNNN) | gitlab MR url | markdown file | ad-hoc task> [--kind pi|opencode|claude]"
---

Target: **$ARGUMENTS**

Base repo: git root of the current directory.

## Backend

Exactly one backend executes the flow; detect it, don't ask:

- `HERDR_ENV=1` → **Herdr**. Load the `herdr` skill and follow its CLI contracts; background creation uses `--no-focus`.
- No `HERDR_ENV` and the t3-code MCP tools respond → **T3 Code**. Confirm with one `orchestrator_capabilities` call before the first launch; keep its provider list for `--kind`.
- Neither → stop; report that no orchestration backend is available.

Primitives used by the flows:

- **Worktree(branch, base)** — branch `<branch>` on an up-to-date `<base>` (default: the repo's default branch). If the worktree/branch already exists, reuse it and say so; never recreate.
  - Herdr: `herdr worktree`.
  - T3: part of the Launch — `workspaceStrategy {type:"worktree", baseRef:"<base>", branch:"<branch>", startFromOrigin:true}` (startFromOrigin = fetched). Existing worktree → `{type:"existing_worktree", worktreePath, branch}` from `t3_worktree_list`.
- **Session(name)** — a named session rooted at the worktree.
  - Herdr: `herdr workspace <name>`; agent in its root pane, cwd = the worktree.
  - T3: the launched thread is the session — `title` = `<name>`; the launch binds it to the worktree.
- **Kickoff(prompt)** — fire-and-forget: never wait, never poll.
  - Herdr: `herdr agent prompt`.
  - T3: the `message` of the same single `t3_thread_launch` call — worktree, session, kickoff are one call; no `t3_thread_wait`.
- **Report** — Herdr: the workspace ID. T3: `[<name>](t3-thread://v1/<threadId>)`.
- **`--kind <k>`** — parsed from $ARGUMENTS, default `pi`. Herdr: agent kind. T3: provider — `pi`→`pi`, `claude`→`claudeAgent`, `opencode`→`opencode`; set via `modelSelection` only if that provider lists no constraints in `orchestrator_capabilities`, else omit and say so.

## Route

- A bare `AIC-\d+` key or a `bitdeer.atlassian.net/browse/<KEY>` URL → **Ticket flow**.
- A GitLab `merge_requests` URL → **MR flow**.
- A path ending in `.md` → **Markdown flow**.
- Any other non-empty text → **Ad-hoc flow**.
- Empty → stop; report what $ARGUMENTS looked like.

## Kickoff prompt

Assemble per flow — fill `<target>` and the flow's CLAIM/VERDICT — and send verbatim:

```
/grill-with-docs work on <target>

First assess readiness: is this actionable as written — not blocked, not moot
(the mootness check, `grilling` skill), no prerequisite outside it? If not:
reply starting `NOT-READY:` with what is missing or blocking, do not claim,
and stop.

<CLAIM/VERDICT>

On proceed: run the deepen pass (`deepen` skill) on the settled task before
implementing. When implementation lands — run the simplify pass,
/fix-hard-violations, then /ship. On review comments: /mr-comments. On
approval: /merge.
```

## Ticket flow

1. Resolve the ticket via the atlassian MCP: key, summary, type, assignee, status.
2. Guard — read-only: ticket assigned to someone else and *In Progress* → stop, report, create nothing.
3. Worktree `<type>-<key>` lowercase (type mapped from the ticket: feat/fix/chore/docs/…), base = default branch.
4. Session `<key>-<short-slug>`.
5. Kickoff with target = ticket URL and CLAIM/VERDICT:

   > If ready: claim it (assign to me, transition to In Progress; skip steps already satisfied), then run the session. An existence grilling verdict stops or trims the work before implementation — kill/defer: propose a Jira comment + transition via the atlassian MCP (list the real transitions; Duplicate resolution when a twin exists); descope: propose trimming the title and description. Execute these writes only on the user's yes.

   Report the session.

## MR flow

1. `glab mr view <url>`: source branch, repo. The base repo must be the current git repo's origin — otherwise stop and report.
2. Worktree = the MR's source branch. T3: base = the MR's *target* branch, and prepend to the kickoff — verify the worktree is on `<source branch>`; if not, `git fetch origin && git checkout <source branch>` before reviewing.
3. Session `mr-<iid>-<short-slug>`.
4. Kickoff `/gitlab-review <mr-url>`. Report the session.

## Markdown flow

1. Verify the file exists (resolve against the current directory); missing → stop and report. Slug = basename minus `.md`, lowercase.
2. `git status --porcelain -- <file>`: untracked → the kickoff passes the main-repo absolute path with the caveat `(untracked in the main checkout — read it there; never commit it)`; tracked → pass the path as-is.
3. Worktree `md-<slug>` lowercase, base = default branch.
4. Session `md-<short-slug>`.
5. Kickoff with target = the markdown file path and CLAIM/VERDICT:

   > If a Jira ticket is referenced, claim it (assign to me, transition to In Progress; skip steps already satisfied), then run the session. An existence grilling verdict — report it and stop; propose the ticket's verdict writes via the atlassian MCP (comment + transition on kill/defer; title/description trim on descope), executed only on the user's yes. The markdown file is never written — its fate stays with the user.

   Report the session.

## Ad-hoc flow

1. Slug = first few kebab-case words of the description, lowercase.
2. Worktree `adhoc-<slug>` lowercase, base = default branch.
3. Session `adhoc-<short-slug>`.
4. Kickoff with target = the description and CLAIM/VERDICT:

   > A ticket key in the description is context, not a claim target.

   Report the session.

## Rules

- One work item per invocation; never batch.
- `/work` only sets the table: worktree, session, kickoff. Cleanup of finished worktrees/sessions is a separate decision, never automatic.
