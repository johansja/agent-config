---
name: grilling
description: Interview the user relentlessly to stress-test a plan, decision, or vague intent.
---

Grill **round by round**, not one at a time. Map the decision tree; each round, ask the whole **frontier** — every question whose prerequisites are settled — as one numbered list with a recommended answer each. Recompute from answers, repeat. Same tree, same order, fewer turns.

Format each round:

```
❓ **Q1 - <title>**: <question body — paragraphs or choices as needed>

➡️ <your recommended answer>
```

Finding *facts* is your job, never the user's. If a fact is code-answerable, look it up instead of asking (code, tools, web search); dispatch a subagent for heavier exploration. Don't block the frontier on a running exploration — only the questions downstream of it wait; ask the rest now. The *decisions* are the user's: put each to them and wait.

Grill toward the essential/accidental split (Brooks): is each requirement solving the actual problem, or baggage layered on top? "Essential" is a hypothesis to pressure-test, not a verdict — a re-frame may reveal it as accidental in disguise. Apply the same test to the proposed solution shape — the deletion pass at plan time: for each component or abstraction in the plan, ask which requirement dies if it's cut, and cut orphans before they're written — then trim the survivors to the minimum sufficient, not the most complete.

## Existence grilling

When the subject would produce change — a ticket, a plan, an inline ask — the session opens by grilling the item's right to exist, before anything inside it. Pure design or review subjects that produce no change skip this.

Pre-fetch the evidence before asking:

1. The problem restated in one sentence — what breaks without this?
2. The demand source — incident, asker, PM, measurable debt?
3. The cost of doing nothing for a quarter.
4. The cheaper 80/20, if one exists.
5. The **mootness check**: is the item already done, duplicated, or superseded? Tickets — its resolution, a text-search of the tracker for likely twins, its link graph. Inline asks — does the repo already do it, is someone already on it?

Then open round 1 with the existence question, the evidence, and a recommended verdict: **proceed** (restating the why), **descope**, **defer**, or **kill**. The verdict is the user's; requirement and solution-shape grilling proceed only on proceed or descope. On kill or defer, propose closing or de-prioritising the item where it lives; on descope, propose trimming its source; execute any write-back only on the user's yes.

## Resuming a subject

When the user says "continue on <ticket/topic>", rebuild state from evidence before round 1: search past sessions for the identifier, re-read the tracker item (comments, link graph, status), and check the worktree (`git status`, branch vs develop, grep the code for the symbols the ticket names). Tracker text goes stale after merges and closed siblings, so open with a short "what is already true" list and only ask what that leaves open.

## Closing the grill

When the frontier is empty, restate the settled decisions as one numbered table (decision per row, including answers the user amended) and ask for the go-ahead. The usual next steps are `deepen`, then `simplify`'s deletion pass on the plan, then implement; if an amended answer makes tracker text wrong, list those edits in the plan.

## Steers after the go-ahead

A mid-implementation message that changes a settled decision (drops a mechanism, moves a trust boundary, widens scope) re-opens the frontier. Do not absorb it into the running work: read the code that decision touches, say what it removes and what depends on it, ask the new questions with recommendations (how far it goes, which change/MR carries it, what happens meanwhile), and keep going only on parts the steer does not touch. Write-backs to the tracker wait for the new answers.

## Running the rounds

- **Look up facts, ask decisions.** If the user says "I already answered that", you asked a fact you should have read, or re-asked a settled item.
- **Open each round with what is settled**, then only the questions the last answers opened. Record only what the user answered; a skipped question stays open.
- **Test proposed rules against the real data** and report the counts each would produce, before the user discovers the noise.
- **Write questions a skimmer can answer:** plain words, no internal codes, one-clause consequence per option. On "eli5", re-explain with an analogy and keep the recommendation.
- **"Overkill / simpler?" gets the deletion pass out loud:** keep/cut per component, with the requirement that dies if cut.
- **When challenged, re-derive on the merits** and reverse if the simpler option wins. "Whichever is cleaner" delegates the choice: pick it and mark it settled.
- **Surface conflicts** between an answer and a standing rule as a question. Never attribute a gate or rule to the user that they did not state.
- **Inventory / research subjects:** `references/inventory-research-subjects.md`. **Meeting-board subjects:** `references/meeting-board-usefulness.md`.

The session is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not act until the user confirms shared understanding.
