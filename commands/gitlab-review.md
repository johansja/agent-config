---
description: "Review a GitLab MR via the code-review skill. Post a required-to-pass note on FAIL, a review-comments note on PASS WITH COMMENTS; offer approval on either PASS."
argument-hint: "<mr id|url>"
---

Run `code-review` on the GitLab MR at **$ARGUMENTS**; show the full report inline.

## Context

Before invoking:

1. Resolve the Jira ticket: key from the MR's source branch (`<type>-aic-NNNN`), fallback the MR description; fetch it via the atlassian MCP. The ticket is the Spec axis's spec source — it satisfies the skip-decision, its text goes in the Spec subagent's brief (no MCP access), and `## Motivation` quotes it, not the `--fill` description.
2. Run the mootness check (`grilling` skill). Append its findings to the report as a `## Mootness` section; they never affect the verdict.

## Posting (glab)

Every note: draft it, show it inline in full, stop and ask; on the user's go, post it verbatim per the syntax below. Finding lines are `file:line — finding — <change>`, grouped by axis, severity-ordered within. Suggestions are never posted. End every note with the report's `Reviewed head: <sha>` line verbatim.

- **Verdict FAIL** → one MR-level note: `## Required to pass` — exactly the Criticals, each with its `required change`; then `## Also noted (non-blocking)` — the Warnings, each with a `suggested change` (omit the section when there are none).
- **Verdict PASS WITH COMMENTS** → one MR-level note: `## Review comments`, opening "Approving with comments: please address these in a follow-up or before merge, at your discretion.", then the Warnings under `### <Axis>` headings (the Spec heading carries the quoted spec line), each with a `Suggested change`. After posting, offer `glab mr approve <id>`; run it only on the user's yes.
- **Verdict PASS** → post nothing; offer to run `glab mr approve <id>` and do so only on the user's yes.

### Syntax — read only when posting

- `glab mr note create <id> --resolvable=false --unique -m "<note>"`
- Use `note create`, not the `note` alias — `--resolvable`/`--unique` exist only on `create`.
- `--resolvable=false` posts a non-blocking note (the default is a merge-blocking discussion).
- `--unique` makes re-runs idempotent.
- Never per-line diff comments (`--file`/`--line`): GitLab `400`s per-line diff comments on any line absent from the latest diff version. Keep `file:line` inline in the note text instead.
