---
name: grilling
description: Interview the user relentlessly about a plan, decision, or idea. Use when intent is vague, underspecified, or the user wants to stress-test their thinking.
---

Grill **round by round**, not one at a time. Map the decision tree; each round, ask the whole **frontier** — every question whose prerequisites are settled — as one numbered list with a recommended answer each. Recompute from answers, repeat. Same tree, same order, fewer turns.

Format each round:

```
❓ **Q1 - <title>**: <question body — paragraphs or choices as needed>

➡️ <your recommended answer>
```

Finding *facts* is your job, never the user's. If a fact is code-answerable, look it up instead of asking (code, tools, web search); dispatch a subagent for heavier exploration. Don't block the frontier on a running exploration — only the questions downstream of it wait; ask the rest now. The *decisions* are the user's: put each to them and wait.

Grill toward the essential/accidental split (Brooks): is each requirement solving the actual problem, or baggage layered on top? "Essential" is a hypothesis to pressure-test, not a verdict — a re-frame may reveal it as accidental in disguise. Apply the same test to the proposed solution shape — the deletion pass at plan time: for each component or abstraction in the plan, ask which requirement dies if it's cut, and cut orphans before they're written — then trim the survivors to the minimum sufficient, not the most complete.

The session is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not act until the user confirms shared understanding.
