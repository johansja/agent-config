---
description: Plan a huge chunk of work (>1 agent session) as a shared map of decision tickets on the repo's issue tracker; chart the map, then work one ticket per session.
argument-hint: "[<map-ref-or-loose-idea>]"
---

User input: $ARGUMENTS

If empty, ask whether to chart a new map from a loose idea, or work an existing map by ref. A map ref (URL/number) → **Work**; prose → **Chart**. Never resolve more than one ticket per session (except `research`).

Too big for one session. Wayfinding charts a shared map on the issue tracker, then works decision tickets one at a time until the route is clear. A ticket resolves a *decision*, not a slice of a build. **Plan, don't do** — the pull to just do the work signals you've reached the edge of the map; override only if the map's Notes say so. Refer to every map/ticket by title, not bare id; the id rides inside a link.

Default to local-markdown if no tracker given: `.scratch/<effort>/map.md` + `issues/NN-<slug>.md`.

## Map (single issue labelled `wayfinder:map`)

An index, not a store — one line per closed ticket; the decision lives only in its ticket.

- **Destination** — what reaching the end looks like.
- **Notes** — domain, skills every session should consult, standing preferences.
- **Decisions so far** — `<gist> — [closed ticket title](link)`, one per closed ticket.
- **Not yet specified** — fog you can't ticket yet; graduates as the frontier advances.
- **Out of scope** — beyond the destination; never graduates. A live ticket past the destination is closed and logged here, not resolved.

## Tickets (child issues; body = `## Question`)

Label `wayfinder:<type>`:
- **research** (AFK) — surface an external fact a decision waits on (`web_search`/`web_fetch`/files or `subagent`).
- **prototype** (HITL) — cheap rough artifact to react to; links the asset.
- **grilling** (HITL) — one question at a time via `grilling`+`domain-modeling`. Default.
- **task** (HITL/AFK) — manual work that unblocks a decision; resolved when done, answer records what was done + dependent facts.

**Claim** by assigning first (unassigned = unclaimed). Blocking uses the tracker's native dependency, fall back to `Blocked by:` body line. **Frontier** = open, unblocked, unclaimed. Record the answer on resolution, not in the body; link assets, don't paste.

**Fog:** the map is deliberately incomplete past the live tickets. Graduate fog to a ticket when the question becomes sharp now (blocked is fine). Dim fog stays in Not-yet-specified; don't pre-slice it.

## Chart (loose idea)

1. Name the destination via `grilling`+`domain-modeling` — fixes scope.
2. Map the frontier via `grilling`, breadth-first. No fog? Way is clear; stop and ask how to proceed.
3. Create the map: Destination + Notes filled, Decisions empty, fog sketched into Not-yet-specified.
4. Create specifiable tickets; wire blockers in a second pass (ids needed first).
5. Fire `research` subagents in parallel, each on a throwaway `research/<name>` branch with a context pointer from the ticket.
6. Stop — charting is one session, resolves nothing.

## Work (map ref)

1. Load the map (low-res — don't fetch every ticket body).
2. Pick first frontier ticket (or user-named). **Claim** before any work.
3. Resolve — zoom as needed; invoke skills from Notes (default `grilling`+`domain-modeling`).
4. Record: resolution comment → close issue → append one-line context pointer to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate fog the answer made specifiable; rule out-of-scope if past destination; update/delete invalidated tickets.

User may run unblocked tickets in parallel; expect concurrent tracker edits.
