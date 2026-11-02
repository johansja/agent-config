---
name: jira-ticket-authoring
description: Write or rewrite a Jira ticket for a human who picks it up cold — summary, body, batch pre-flight.
---

A ticket is a sticky note for someone who was not in the session. Agent-written tickets fail by being accurate but unreadable: essay bodies, session leftovers, defaults nobody chose. Project label/field recipes stay in the project's own skill; this is the write-side contract.

## Single ticket

1. **Search first.** Query the summary keywords and the epic's children (`parent = <EPIC>`, open and closed). A near-match means update or link, not create.
2. **Summary:** one clause, ≲80 chars, the observable problem or outcome. No `⇒` chains, no "X — Y" double titles, no implementation detail. Keep the reporter's language.
3. **Body** — bold lead-ins each followed by a blank line (Markdown `##` headings are stripped on conversion to Jira's format, and a lead-in with a single newline merges into the next line as `**Goal**Text`). Target one screen.
   - Bug: `**Problem**` (what the user sees) · `**Expected**` · `**Repro**` (numbered; env and ids) · `**Impact**` · `**Done when**`.
   - Task/Story: `**Goal**` (one sentence) · `**Scope**` · `**Out of scope**` · `**Done when**` (observable) · `**Depends on**`.
4. **Strip session cruft** (run `cruft-hygiene`'s patterns on the draft): agent/Kanban card ids, local paths (`~/projects/…`, `.local/…`), plan-step refs (`Plan ref: X-B1`), unexplained question codes (`Q22`), lines addressed to agents ("agents read this", "an agent must not…"), "created as the replacement for…" provenance. Relationships go in issue links, not prose.
5. **Evidence lives in comments and the MR.** Commit SHAs and `file:line` refs go stale within days; the description holds behaviour and the done-bar. Fix references belong in the closing comment. Measured results that define the ask (which sources fail, at what speed, on which date) do belong in the body as a small table, since they are the request itself.
6. **Done-when checks in prose, not shell.** Write "an HTTPS request to each target returns a status" rather than a `curl https://…` code span: the reader's tool may differ, and a URL inside a code span can make the tracker's API reject the whole body.
7. **Owner and priority are chosen, not defaulted.** If either stays empty or default, say so in the proposal. A blocker ranked above what it blocks (P0 gating P3s) means one of them is mis-ranked.
8. **Read back** the created ticket's description; confirm the section breaks survived and fix in place. After a batch, re-read the links too (`issue in linkedIssues(<umbrella>)`) and fix sibling tickets whose out-of-scope or depends-on lines name "a separate ticket" that now has a key.

Done when: the summary passes step 2, the body has the lead-ins from step 3, a cruft grep returns nothing, and the read-back looks right.

## What goes elsewhere

- **Tickets an agent will execute** need the same body plus four things a human colleague infers: the environment where the fix is verified and what the check needs (credentials, a second tenant); what "done" ends in (merged, deployed to test, verified, or handed to a reporter); the commit or date the premise was last checked against the default branch, because stale premises were the commonest agent-ticket failure; and who owns it and which status it ends in. When the ticket hands off work a session already investigated, add a `**Facts to start from (checked <date>)**` section with what was verified live (how the current system was actually built, versions chosen and why, inventory, names decided) and the branch to work on, so the pickup session neither redoes the probes nor trusts its own recall. Published guidance from Atlassian and GitHub agrees on outcomes, in/out scope, constraints, prior decisions, verifiable acceptance criteria and one responsibility per ticket; it is vendor-written, so treat its claimed gains as unmeasured.
- **One responsibility per ticket, split by owner and by approval path.** Asks to another team split per assignee and, for request forms holding one source/destination/port set (firewall, access), per purpose, so each is approved and closed on its own. Our repo work gets one ticket per planned MR, separate from the umbrella whose done-bar is a running system. List the open questions for the owner (approver, end date, priority) in the drafts rather than guessing form fields. Write a ticket for another team as a direct request to its assignee ("create X", "reply on this ticket with Y"), in the channel that team works in; ask the owner when the channel is unclear.
- **Dependency order is a Blocks link, not prose.** When one ask needs another's output (a DNS record needs the load balancer's IP), link them with Blocks and keep the downstream done-check runnable once the upstream lands. Hand a process-only ask ("ask X whether") over as a channel message until the other team names an owner — a ticket whose only content is "wait for their answer" cannot progress.
- **A grooming sweep over existing tickets** is read-only first: restructure what exists, turn gaps into explicit questions, never fill in plausible but unverified facts, keep the ticket's language (do not translate Chinese tickets), keep the original text in a comment when replacing a description, and suggest instead of editing tickets assigned to others. Score against concrete yes/no items (has acceptance criteria, names the environment), not "is it clear", and batch about eight tickets per card.
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
