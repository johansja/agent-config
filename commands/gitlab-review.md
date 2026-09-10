---
description: "Review a GitLab MR via the code-review skill. Post a required-to-pass note on FAIL; offer approval on PASS."
argument-hint: "<mr id|url>"
---

Run `code-review` on the GitLab MR at **$ARGUMENTS**; show the full report inline.

## Context

Before invoking:

1. Resolve the Jira ticket: key from the MR's source branch (`<type>-aic-NNNN`), fallback the MR description; fetch it via the atlassian MCP. The ticket is the Spec axis's spec source — it satisfies the skip-decision, its text goes in the Spec subagent's brief (no MCP access), and `## Motivation` quotes it, not the `--fill` description.
2. Run the mootness check (`grilling` skill). Append its findings to the report as a `## Mootness` section; they never affect the verdict.

## Posting (glab)

- **Verdict FAIL** → draft one MR-level note and show it inline in full, stop and ask;
  on the user's go, post it verbatim per the syntax below.
  Content: a `## Required to pass` list — exactly the FAIL-causing findings
  (Standards hard violations, Spec findings, Criticals), grouped by axis,
  severity-ordered within, each line `file:line — finding — required change`.
  End the note with the report's `Reviewed head: <sha>` line verbatim.
- **Verdict PASS** → post nothing; offer to run `glab mr approve <id>` and do so only on the user's yes.

### Syntax — read only when posting

- `glab mr note create <id> --resolvable=false --unique -m "<required-to-pass>"`
- Use `note create`, not the `note` alias — `--resolvable`/`--unique` exist only on `create`.
- `--resolvable=false` posts a non-blocking note (the default is a merge-blocking discussion).
- `--unique` makes re-runs idempotent.
- Never per-line diff comments (`--file`/`--line`): GitLab `400`s per-line diff comments on any line absent from the latest diff version. Keep `file:line` inline in the note text instead.
