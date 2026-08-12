---
description: "Kick off a code-review of a GitLab MR via the code-review skill."
argument-hint: "<mr id|url>"
---

Run `code-review` on the GitLab MR at **$ARGUMENTS**. Summarise the changes. Pass/fail.

## Before posting

Run `code-review`, show the per-axis report + `## Verdict` inline, then stop and ask for the user's comment and which axes to post. Wait for their reply before posting.

## Posting (glab)

Reached only after the user agrees. Read at posting time.

- MR-level note per axis: `glab mr note create <id> --resolvable=false --unique -m "<axis-report>"`.
- Use `note create`, not the `note` alias — `--resolvable`/`--unique`/`--file`/`--line`/`--old-line`/`--reply` exist only on `create`.
- `--resolvable=false` posts a non-blocking note (the default is a merge-blocking discussion).
- `--unique` makes re-runs idempotent.
- Never per-line diff comments (`--file`/`--line`): GitLab `400`s per-line diff comments on any line absent from the latest diff version. Keep `file:line` inline in the MR-level note instead.
