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

Primitives used by the flows — the Backend section is the only place their API takes shape:

- **Worktree(branch, base)** — `<branch>` off an up-to-date `<base>` (default: the repo's default branch). An existing worktree or branch is reused, never recreated, and the reuse is reported. T3: the `existing_worktree` strategy from `t3_worktree_list` when one is already there.
- **Session(name)** — a named session rooted in the worktree. In T3 the launched thread *is* the session: `<name>` becomes its title.
- **Kickoff(prompt)** — fire-and-forget: never wait, never poll. Herdr's `agent prompt` waits by default, so pass no wait flag; in T3 the worktree, session, and kickoff are one launch call.
- **Report** — Herdr: the workspace ID. T3: `[<name>](t3-thread://v1/<threadId>)`.
- **`--kind <k>`** — parsed from $ARGUMENTS, default `pi`. Herdr: agent kind. T3: provider — `pi`→`pi`, `claude`→`claudeAgent`, `opencode`→`opencode`; set via `modelSelection` only if that provider lists no constraints in `orchestrator_capabilities`, else omit and say so.

## Route

- A bare `AIC-\d+` key or a `bitdeer.atlassian.net/browse/<KEY>` URL → **Ticket flow**.
- A GitLab `merge_requests` URL → **MR flow**.
- A path ending in `.md` → **Markdown flow**.
- Any other non-empty text → **Ad-hoc flow**.
- Empty → stop; report what $ARGUMENTS looked like.

## Kickoff prompt

Send verbatim, filling `<target>` and copying the flow's CLAIM/VERDICT from the parts below:

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

CLAIM/VERDICT parts:

- **CLAIM, ticket** — `Claim it (assign to me, transition to In Progress; skip steps already satisfied), then run the session.`
- **CLAIM, markdown** — `Claim the referenced Jira ticket, if any (assign to me, transition to In Progress; skip steps already satisfied), then run the session.`
- **VERDICT** — `An existence grilling verdict stops or trims the work before implementation — kill/defer: propose a Jira comment + transition via the atlassian MCP (list the real transitions; Duplicate resolution when a twin exists); descope: propose trimming the title and description. Execute these writes only on the user's yes.`
- **MARKDOWN ADDENDUM**, after VERDICT — `Report the verdict and stop; the markdown file is never written — its fate stays with the user.`
- **AD-HOC, no claim** — `A ticket key in the description is context, not a claim target.`

## Ticket flow

1. Resolve the ticket via the atlassian MCP: key, summary, type, assignee, status.
2. Guard — read-only: ticket assigned to someone else and *In Progress* → stop, report, create nothing.
3. Worktree `<type>-<key>` lowercase (type mapped from the ticket: feat/fix/chore/docs/…), base = default branch.
4. Session `<key>-<short-slug>`.
5. Kickoff, target = ticket URL, CLAIM/VERDICT = CLAIM ticket + VERDICT.

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
5. Kickoff, target = the markdown file path, CLAIM/VERDICT = CLAIM markdown + VERDICT + MARKDOWN ADDENDUM.

   Report the session.

## Ad-hoc flow

1. Slug = first few kebab-case words of the description, lowercase.
2. Worktree `adhoc-<slug>` lowercase, base = default branch.
3. Session `adhoc-<short-slug>`.
4. Kickoff, target = the description, CLAIM/VERDICT = AD-HOC.

   Report the session.

## Rules

- One work item per invocation; never batch.
- `/work` only sets the table: worktree, session, kickoff. Cleanup of finished worktrees/sessions is a separate decision, never automatic.
