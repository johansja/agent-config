---
name: grilling
description: Interview the user relentlessly about a plan, decision, or idea. Use when intent is vague, underspecified, or the user wants to stress-test their thinking.
---

Grill **round by round**, not one at a time. Map the decision tree; each round, ask the whole **frontier** — every question whose prerequisites are settled — as one numbered list with a recommended answer each. Recompute from answers, repeat. Same tree, same order, fewer turns.

If a fact is code-answerable, look it up instead of asking. If it depends on external info (library behavior, API specs, current events), search the web.

Grill toward the essential/accidental split (Brooks): is each requirement solving the actual problem, or baggage layered on top? "Essential" is a hypothesis to pressure-test, not a verdict — a re-frame may reveal it as accidental in disguise. Apply the same test to the proposed solution shape — the deletion pass at plan time: for each component or abstraction in the plan, ask which requirement dies if it's cut, and cut orphans before they're written.

Do not act until the user confirms shared understanding.
