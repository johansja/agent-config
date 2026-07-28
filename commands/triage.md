---
description: Move incoming issues (default: Jira) through a small role state machine
argument-hint: "[<query, issue key, or transition request>]"
---

User input: $ARGUMENTS

Default tracker: Jira via the atlassian MCP (`searchJiraIssuesUsingJql`, `getJiraIssue`, `addCommentToJiraIssue`, `transitionJiraIssue`, `getTransitionsForJiraIssue`, `editJiraIssue` for labels). Fall back to local-markdown (`.scratch/issues/NN-<slug>.md`) only with no Jira access.

## Roles — one category + one state per issue
- Category: `bug` | `enhancement` — usually the Jira issue type; don't relabel.
- State: `needs-triage` | `needs-info` | `ready-for-agent` | `ready-for-human` | `wontfix`.
- Machine: unlabeled → `needs-triage` → (`needs-info` ↔ `needs-triage` on reporter reply) | `ready-for-agent` | `ready-for-human` | `wontfix`. Maintainer overrides at will — flag unusual transitions, ask first.

## Mode
- **Empty** — three buckets oldest-first: unlabeled; `needs-triage`; `needs-info` with reporter activity since last note. Wait.
- **Key/query** — triage one issue or set.
- **"Move X to Y"** — apply transition.

## Per-issue loop
1. **Gather** — full issue (body, comments, labels, reporter, dates). Two codebase checks: (a) *redundancy* — search for an existing impl by domain concept, report where you looked (found → already-implemented `wontfix`); (b) *prior rejection* — read `.out-of-scope/*.md`, surface any match. Use `domain-modeling` glossary; respect ADRs.
2. **Recommend** — category + state with reasoning and a one-line codebase summary. Wait for direction.
3. **Verify before grilling** — bug: reproduce from reporter's steps. Report confirmed (with code path) / failed / insufficient detail (strong `needs-info`). A confirmed repro makes a far stronger brief.
4. **Route** — `needs-info`: post specific questions. `ready-for-agent`: write a durable brief (goal, acceptance criteria, files/ADRs/domain terms, verified repro, out-of-scope — link, don't paste) as a comment. `ready-for-human`: one-line why. `wontfix`: close with reason — already-implemented points to the code (no `.out-of-scope/` entry); rejected logs to `.out-of-scope/<slug>.md`.

Compose with `grilling`/`diagnosing-bugs`. Triage routes — it does not implement.
