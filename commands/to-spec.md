---
description: "Synthesize the current conversation into a spec, published to Jira or local file — no interview, just synthesis"
argument-hint: "[<plan path or issue key/URL>]"
---

User input: $ARGUMENTS

Synthesize conversation context + codebase understanding into a spec (PRD). Do NOT interview — synthesize what's already resolved (interviewing is `grilling`'s job). Use `domain-modeling` glossary; respect ADRs.

## Process
1. **Explore** — repo current state, if not already known.
2. **Seams** — sketch test seams: prefer existing over new, highest possible; ideal count is one. New seams proposed at the highest point. Check with user before writing (`tdd` for seam vocabulary).
3. **Write + publish** — spec from the template below.

## Tracker
Tracker config per `triage`.
- **Jira** — `atlassian_createJiraIssue`. Labels go in `additional_fields: {"labels": ["ready-for-agent"]}` (not a top-level param) at creation — no further triage (see `triage`'s machine). This is the parent issue `to-tickets`'s tickets block under.
- **Local** — `.scratch/<feature-slug>/spec.md`. Use the template below.

<spec-template>

## Problem Statement
The problem, from the user's perspective.

## Solution
The solution, from the user's perspective.

## Implementation Decisions
- Modules built/modified + their interfaces
- Schema changes, API contracts, architectural decisions
- Specific interactions

No file paths or code snippets — they go stale. Exception: a prototype snippet encoding a decision (state machine, reducer, schema, type shape) — inline, note prototype origin, trim to decision-rich parts (same carve-out as `to-tickets`).

## Out of Scope
What's out of scope for this spec.

</spec-template>

Compose with `grilling` (interview first), `domain-modeling` (glossary/ADRs), `tdd` (seams), `to-tickets` (split into tickets), `triage` (labeling).
