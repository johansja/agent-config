---
description: Plan a huge chunk of work (>1 agent session) as a shared map of decision tickets on the repo's issue tracker; chart the map, then resolve one ticket per session until the route is clear.
argument-hint: "[<map-url-or-number>]"
---

<!-- Derived from mattpocock/skills wayfinder (MIT); tightened to operational core. -->

A loose idea too big for one session, wrapped in fog: the way to the **destination** isn't visible yet. Wayfinding finds that way — it doesn't charge at the destination. Chart a **shared map** on the repo's issue tracker, then work its **decision tickets** one at a time until the route is clear. A ticket resolves a *decision*, not a slice of a build.

**Plan, don't do.** Each ticket resolves a decision; the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is the signal you've reached the edge of the map. An effort can override this in its **Notes**; absent that, produce decisions, not deliverables.

**Refer by name.** Every map and ticket has a title. In everything the human reads — narration, Decisions-so-far — use the title, never a bare id/number/slug. The id rides *inside* the name as a link; it never stands in for it.

## The Map

Single issue labelled `wayfinder:map` — the canonical artifact. Tickets are child issues. The map is an **index**, not a store: one line per closed ticket, gist + link; a decision lives in exactly one place — its ticket — so the map never restates it.

**Where the map, child tickets, blocking, and frontier queries live is tracker-specific.** If no tracker has been provided, default to local-markdown (`.scratch/<effort>/map.md` + `issues/NN-<slug>.md`). For other trackers, consult its "Wayfinding operations" doc.

### Map body

Low-res view, loaded once per session. Open tickets are **not** listed — they're open child issues, found by query.

```markdown
## Destination
<what reaching the end of this map looks like — spec, decision, or change; one or two lines; every session orients to it before choosing a ticket>

## Notes
<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far
<!-- one line per closed ticket: enough to judge relevance, then zoom the link -->
- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified
<!-- in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope
<!-- work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Child issue of the map; the tracker's issue id is its identity. Body sized to one ~100K-token session:

```markdown
## Question
<the decision or investigation this ticket resolves>
```

Label `wayfinder:<type>` — `research` / `prototype` / `grilling` / `task` (see Ticket Types).

**Claim** a ticket by assigning it to the dev driving the map, **first**, before any work; the assignee _is_ the claim — an open unassigned ticket is unclaimed. Blocking uses the tracker's **native** dependency relationship (renders the frontier visually in the tracker UI; fall back to a `Blocked by:` body line only if the tracker lacks it). A ticket is **unblocked** when every blocker is closed; the **frontier** is the open, unblocked, unclaimed children — the edge of the known. The answer is recorded on resolution, not in the body. Assets are linked, not pasted in.

## Ticket Types

HITL = worked *with* a human who speaks for themselves (never stand in for the human's side). AFK = agent alone.

- **Research** (AFK) — surface a fact a decision waits on, from docs/APIs/local resources outside the CWD. Resolved by the agent directly (`web_search`, `web_fetch`, file reads) or a `subagent` with a research brief.
- **Prototype** (HITL) — make a cheap, rough, concrete artifact to react to (outline, stub, UI/logic code). Links the prototype as an asset. For "how should it look/behave" questions.
- **Grilling** (HITL) — one question at a time via the `grilling` and `domain-modeling` skills. The default case.
- **Task** (HITL or AFK) — manual work that must happen before a *decision* can be made (sign up for a service, provision access, move data). The one type that *does* rather than decides; earns its place by unblocking a decision. Resolved when done; the answer records what was done + any resulting facts later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete. Beyond the live tickets lies fog — decisions/investigations you can tell are coming but can't pin down because they hang on open questions. Resolving a ticket clears the fog ahead, graduating what's now specifiable into fresh tickets, one at a time. The **Not yet specified** section holds this dim view.

**Fog or ticket?** Whether you can state the question precisely *now* — not whether you can answer it now. Ticket when sharp (even if blocked); Not-yet-specified when you can't yet phrase it sharply. Don't pre-slice fog into ticket-sized pieces — one patch may graduate into several tickets, or none.

## Out of scope

Fog only gathers _toward_ the destination. Work beyond it is **out of scope** — not fog, not in Not-yet-specified. Its own section. Never graduates; returns only if the destination is redrawn, as a fresh effort. When a live ticket turns out to sit past the destination, **close it** and leave one line here: gist + why, linking the closed ticket. Stays out of **Decisions so far** — that records the route walked, and a scope boundary isn't a step on it.

## Invocation

Two modes. **Never resolve more than one ticket per session** — except research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Use the `grilling` and `domain-modeling` skills to pin down what this map is finding its way to. Destination fixes scope; settled first.
2. **Map the frontier.** Grill again, **breadth-first**: fan out across the whole space, surfacing open decisions and first takeable steps. **If no fog surfaces** — the way is already clear, small enough for one session — you don't need a map; stop and ask the user how to proceed.
3. **Create the map** (label `wayfinder:map`): Destination + Notes filled in, Decisions-so-far empty, fog sketched into Not-yet-specified.
4. **Create the tickets you can specify now** as child issues, then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Everything you can't yet specify stays in Not-yet-specified.
5. **Fire research subagents.** For each `research` ticket, spin up a `subagent` with a research brief in parallel, capturing findings on a throwaway `research/<name>` branch with a context pointer from the ticket.
6. Stop — charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (URL or number). Ticket optional — without one, you pick the next decision, not the user.

1. Load the **map** — low-res view, not every ticket body.
2. Choose the ticket (user-named, or first frontier ticket in order). **Claim it**: assign to yourself before any work.
3. Resolve it — **zoom as needed**: fetch the full body of related/closed tickets on demand; invoke the skills the `## Notes` block names. If in doubt, use `grilling` + `domain-modeling`.
4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from Not-yet-specified. If the answer reveals a ticket sits beyond the destination, **rule it out of scope** rather than resolving it. If the decision invalidates other tickets, update or delete them.

The user may run unblocked tickets in parallel; expect concurrent tracker edits.
