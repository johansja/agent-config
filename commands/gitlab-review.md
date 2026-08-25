---
description: "Review a GitLab MR via the code-review skill. Post a required-to-pass note on FAIL; offer approval on PASS."
argument-hint: "<mr id|url>"
---

Run `code-review` on the GitLab MR at **$ARGUMENTS**; show the full report inline.

## Posting (glab)

Reached only after the inline report. Read at posting time.

- **Verdict FAIL** → stop and ask; on the user's go, post one MR-level note:
  `glab mr note create <id> --resolvable=false --unique -m "<required-to-pass>"`.
  Content: a `## Required to pass` list — exactly the FAIL-causing findings,
  grouped by axis,
  severity-ordered within, each line `file:line — finding — required change`.
- **Verdict PASS** → post nothing; offer to run `glab mr approve <id>` and do so only on the user's yes.
- Use `note create`, not the `note` alias — `--resolvable`/`--unique` exist only on `create`.
- `--resolvable=false` posts a non-blocking note (the default is a merge-blocking discussion).
- `--unique` makes re-runs idempotent.
- Never per-line diff comments (`--file`/`--line`): GitLab `400`s per-line diff comments on any line absent from the latest diff version. Keep `file:line` inline in the note text instead.
