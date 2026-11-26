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

Grill toward the essential/accidental split (Brooks): is each requirement solving the actual problem, or baggage layered on top? "Essential" is a hypothesis to pressure-test, not a verdict — a re-frame may reveal it as accidental in disguise. Apply the same test to the proposed solution shape — the deletion pass at plan time: for each component, ask which requirement dies if it's cut, cut orphans before they're written, then trim the survivors to the minimum sufficient.

## Existence grilling

When the subject would produce change — a ticket, a plan, an inline ask — the session opens by grilling the item's right to exist, before anything inside it. Pure design or review subjects that produce no change skip this.

Pre-fetch the evidence before asking:

1. The problem restated in one sentence — what breaks without this?
2. The demand source — incident, asker, PM, measurable debt?
3. The cost of doing nothing for a quarter.
4. The cheaper 80/20, if one exists.
5. The **mootness check**: is the item already done, duplicated, or superseded? Tickets — its resolution, a text-search of the tracker for likely twins, its link graph. Inline asks — does the repo already do it, is someone already on it?

Reported defects ("is this a bug?", "X stopped working"): reproduce live and separate the layers before the verdict — `references/defect-subjects.md` (layer split, artifact decoding, probe controls, skipping same-outcome probes).

**Code absence does not convict a closed ticket.** When the tracker says done and the code says the work never landed, read the item's closure comment and changelog first — items are routinely closed as obsolete, superseded, or wrong-audience. An unimplemented closed ticket is a *question* for the user, not a finding; reopening one whose comment records why it was dropped re-litigates a deliberate decision. Verify the tracker item from the tracker and the code from the code.

Then open round 1 with the existence question, the evidence, and a recommended verdict: **proceed** (restating the why), **descope**, **defer**, or **kill**. A descope or defer that parks work behind blockers comes with the recommended order of those blockers in the same round (each with live status and why it sits there). The verdict is the user's; requirement and solution-shape grilling proceed only on proceed or descope. On kill or defer, propose closing or de-prioritising the item where it lives; on descope, propose trimming its source; execute any write-back only on the user's yes.

## Resuming and steering

- "Continue on <ticket/topic>" → rebuild state from evidence and open with a "what is already true" list: `references/resuming-and-steers.md` (prior-session WIP as a claim, conflicting tracker text, wire-detail mismatches).
- A mid-implementation steer that changes a settled decision re-opens the frontier — do not absorb it into the running work. Same reference, "Steers after the go-ahead".

## Closing the grill

Before routing a fix to a ticket, check which side *generates* the artifact. If the file, response body, or document is produced server-side, the change belongs to the backend ticket and only its presentation to the UI one; split the ask along that line and say which half went where.

When the frontier is empty, restate the settled decisions as one numbered table (decision per row, including answers the user amended) and ask for the go-ahead. The usual next steps are `deepen`, then `simplify`'s deletion pass on the plan, then implement; if an amended answer makes tracker text wrong, list those edits in the plan.

## Running the rounds

- **Look up facts, ask decisions.** "I already answered that" means you asked a fact you should have read, or re-asked a settled item.
- **Open each round with what is settled**, then only the questions the last answers opened. Record only what the user answered; a skipped question stays open.
- **Answer the user's own questions before asking yours.** When an answer comes back as a question, open the next round with the plain explanation, then re-ask any decision that depended on it.
- **Write questions a skimmer can answer:** plain words, no internal codes, one-clause consequence per option. On "eli5" or "what is X for?", lead with an analogy, then the mechanism, and keep the recommendation.
- **Probe hygiene:** chain batched probes with `;`, not `&&` (a search that finds nothing exits non-zero and aborts the rest). Never test a pipeline in a conditional (`if cmd | head -1` tests `head`) — capture or count first. Write multi-line or quote-heavy probes to a scratch file and run the file.
- **A scan proves absence only as of its own timestamp.** Re-run it before concluding "there is no such file / row / route"; timestamp-bearing evidence (mtime, annotation, log line) beats a point-in-time listing.
- **Read the file search's "hidden or gitignored matches" warning** — zero hits plus that warning means the file exists. **Search the tool catalog for a dedicated tool** before reporting that a tool can't read X.
- **Test proposed rules against the real data** and report the counts each would produce.
- **Run the item's own acceptance check before round 1, verbatim with every alternation**, and partition its hits by which scope owns them. A repo-wide criterion often sweeps in files another ticket owns — surface that as a question with counts per class. A compound criterion reported green has often been checked on one branch only; ask whether to amend the criterion or delete the text, since deleting text that documents reachable behavior makes the spec lie.
- **An answer that conflicts with how the mechanism works is not settled.** Explain the mechanism in a sentence, name the consequence, offer the option that keeps the user's intent, and re-ask. Treat "we already do this" and "X can reach Y" as premises to probe: grep the default branch *and* read the live system read-only, reporting per source — another consumer's success is not proof for this one. A *principle* answer ("use upstream unless we changed it") is applied to every item it covers; items where it breaks become the next round's questions.
- **"Follow the team convention" is a probe order.** Survey how peers do it in the live system (per-peer counts, one example each) as a table; each divergence becomes the next round's question, applied to every component of the plan. When peers have no equivalent, lead with "don't add it" and the keep/cut table; if no component survives, the existence verdict flips to kill.
- **Pick a probe credential from the path's last live proof** (the closing comment of the ticket that last exercised it), not from a doc line. Retract a wrong recommendation plainly, in chat and in any tracker text written from it.
- **Every proposed change names where it lands:** the destination file or system and, for agent-instruction changes, which agents load it. A by-hand step the tools cannot make is handed over as exact per-item edits (the item as the UI shows it, the action, a one-clause why), checked against current state first. Before proposing a new rule, sweep docs, agent-rule files and skills for lines that already say otherwise and show them as a `file:line | text | fix` table — deleting a contradiction is often simpler than adding the rule.
- **A stale premise does not make its rule stale.** Test the rule under current conditions before recommending deletion; often only the stated reason needs rewriting. Re-test negative environment facts ("no binary Y here") live.
- **Implementation can shrink a settled item.** When code read during implementation shows a settled component is redundant, cut it and lead the report with the cut and the `file:section` evidence so the user can reverse it — never build an orphan because it was agreed, never drop it silently.
- **A narrowed scope re-derives the evidence.** On "just focus on step X", drop questions outside X, re-probe only that window, and open with the narrowed numbers.
- **"Overkill / simpler?" gets the deletion pass out loud:** keep/cut per component, with the requirement that dies if cut. **When challenged, re-derive on the merits** and reverse if the simpler option wins; "whichever is cleaner" delegates the choice — pick it and mark it settled.
- **Surface conflicts** between an answer and a standing rule as a question. Never attribute a gate or rule to the user that they did not state.
- **Ask only about this session's scope.** Findings about a parallel session's item go back as a one-line note to pass on.
- **A broken precondition is a fix, not a question.** If the setup is wrong (a branch cut from the wrong base, a stale checkout), state the safe repair and do it under the current go-ahead.
- **Subject-specific playbooks:** inventory / research → `references/inventory-research-subjects.md`; meeting boards → `references/meeting-board-usefulness.md`; people plans (onboarding, 30/60/90 ramp) → `references/people-plan-subjects.md`.

The session is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not act until the user confirms shared understanding.
