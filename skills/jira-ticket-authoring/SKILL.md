---
name: jira-ticket-authoring
description: Write or rewrite a Jira ticket for a human who picks it up cold — summary, body, batch pre-flight.
---

A ticket is a sticky note for someone who was not in the session. Agent-written tickets fail by being accurate but unreadable: essay bodies, session leftovers, defaults nobody chose. Project label/field recipes stay in the project's own skill; this is the write-side contract.

## Single ticket

1. **Search first.** Query the summary keywords and the epic's children (`parent = <EPIC>`, open and closed). A near-match means update or link, not create.
2. **Summary:** one clause, ≲80 chars, the observable problem or outcome. No `⇒` chains, no "X — Y" double titles, no implementation detail. Keep the reporter's language.
3. **Body** — bold lead-ins on their own lines (Markdown `##` headings are stripped on conversion to Jira's format and sections run together). Target one screen.
   - Bug: `**Problem**` (what the user sees) · `**Expected**` · `**Repro**` (numbered; env and ids) · `**Impact**` · `**Done when**`.
   - Task/Story: `**Goal**` (one sentence) · `**Scope**` · `**Out of scope**` · `**Done when**` (observable) · `**Depends on**`.
4. **Strip session cruft** (run `cruft-hygiene`'s patterns on the draft): agent/Kanban card ids, local paths (`~/projects/…`, `.local/…`), plan-step refs (`Plan ref: X-B1`), unexplained question codes (`Q22`), lines addressed to agents ("agents read this", "an agent must not…"), "created as the replacement for…" provenance. Relationships go in issue links, not prose.
5. **Evidence lives in comments and the MR.** Commit SHAs and `file:line` refs go stale within days; the description holds behaviour and the done-bar. Fix references belong in the closing comment.
6. **Owner and priority are chosen, not defaulted.** If either stays empty or default, say so in the proposal. A blocker ranked above what it blocks (P0 gating P3s) means one of them is mis-ranked.
7. **Read back** the created ticket's description; confirm the section breaks survived and fix in place.

Done when: the summary passes step 2, the body has the lead-ins from step 3, a cruft grep returns nothing, and the read-back looks right.

## What goes elsewhere

- **Research or an option survey** (prior art, options A–E, many links) → an ADR or research doc in the repo. The ticket keeps the question, the link and the close criterion ("decision recorded in ADR-NNN").
- **A list of independent questions** → one ticket per question, or a checklist ticked item by item. A bundle cannot close until its last answer lands.

## Batch pre-flight (more than ~5 tickets)

Grill the plan before filing — per-ticket grilling at pickup cannot see batch defects. Show one table (summary, type, owner, priority, labels, blocks) and get the owner's yes before any create:

- **Duplicates** within the batch and against existing tickets.
- **Granularity:** fewer tickets with clear outcomes. A batch that is closed and re-filed the next day was decomposed too early.
- **Owner and priority** per row, chosen.
- **Labels:** no new label whose name already means something else in the project (a console `M1` beside an MVP `M1`).
- **Dependencies** as Blocks links, consistent with priority.

## Auditing existing tickets

Pull the label set (summary, status, type, created, reporter, assignee, labels, priority; 100 rows), then descriptions for 6–8. Signals: creates bursting within minutes under one epic, mostly unassigned with uniform default priority, near-duplicate summaries, close-and-refile churn within a day, and the step-4 cruft. Report signals with ticket keys, then at most three recommendations.
