---
description: "Break a plan, spec, or conversation into tracer-bullet tickets with blocking edges, published to Jira or local files"
argument-hint: "[<spec path, issue key/URL, or plan>]"
---

User input: $ARGUMENTS

Break work into **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it. Vertical, not horizontal: narrow but complete path through every layer (schema, API, UI, tests), demoable alone, fits one context window. Prefactor first ("make the change easy, then make the easy change"). Use `domain-modeling` glossary; respect ADRs.

**Wide refactors are the exception** — one mechanical change (rename a column, retype a shared symbol) whose blast radius breaks no vertical slice green. Sequence as **expand–contract**: add new form beside old → migrate call sites in blast-radius batches (each its own ticket, blocked by the expand) → delete old form once no caller remains (blocked by every migrate batch). When even batches can't stay green alone, share an integration branch that all block a final integrate-and-verify ticket.

## Process
1. **Gather** — from conversation, or fetch $ARGUMENTS (spec path / issue key+URL) full body and comments.
2. **Quiz** — numbered breakdown per ticket: **Title**, **Blocked by** (gating tickets, or none), **What it delivers** (end-to-end behaviour, not layer-by-layer). Ask: granularity? edges genuine gates? merge/split? Iterate (`grilling`).
3. **Publish** — dependency order, blockers first.

## Tracker
Tracker config per `triage`.
- **Jira** — `atlassian_createJiraIssue` per ticket. Wire edges with `atlassian_createIssueLink` type `Blocks`: `inwardIssue`=blocker, `outwardIssue`=blocked ("A blocked by B" → inward B, outward A); `atlassian_getIssueLinkTypes` if unknown. Apply `ready-for-agent` label at creation via `additional_fields` (see `to-spec`) — a `triage` state, agent-grabbable by construction.
- **Local** — one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered `01` in dependency order. Never a combined file. Use the template.

Work the **frontier** — any ticket whose blockers are all done. Don't close/modify parent issues.

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** end-to-end behaviour this ticket makes work, user's perspective — not layer-by-layer implementation.

**Blocked by:** numbers/titles of gating tickets, or "None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

Avoid file paths/code snippets — they go stale. Exception: a prototype snippet encoding a decision (state machine, reducer, schema, type shape) — inline, note prototype origin, trim to decision-rich parts.

Compose with `to-spec` (spec first), `triage` (route after), `tdd` (tracer-bullet vocabulary), `domain-modeling` (glossary/ADRs), `grilling` (quiz).
