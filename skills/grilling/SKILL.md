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

When the subject is a reported defect ("is this a bug?", "X stopped working"), the existence question is about the change the finding would produce, not about the user's symptom. Reproduce against the live system first and separate the layers: is the thing reachable at all, and is the credential/input separately rejected? Decode the artifact itself rather than inferring from config — a bearer token's own `exp`/`iat`, a cert's `notAfter`, a file's embedded timestamp — then confirm the configured value in code is what produced it. A symptom fully explained by designed behavior kills the "it broke" framing, but it does not end the session: the reproduction usually surfaces real adjacent defects (a contract that declares a field it never defines, an artifact that carries no expiry on its face, a shipped surface no open ticket owns), and those are what the existence verdict is actually about. Say plainly which layer is working as designed before proposing anything.

**Code absence does not convict a closed ticket.** When the tracker says done and the code says the work never landed, read the item's own closure comment and changelog before calling the closure wrong — items are routinely closed as obsolete, superseded, or wrong-audience, and the implementation was never meant to exist. An unimplemented closed ticket is a *question* for the user, not a finding; reopening one whose comment already records why it was dropped re-litigates a decision they made deliberately. Verify the tracker item from the tracker, the code from the code, and never infer one from the other.

Skip a live probe whose two possible outcomes produce the same diagnosis — if a revoked credential and an expired one both yield the identical rejection, reaching further into a privileged system only enriches the cleanup narrative, and that is not worth the access. Re-price the skip when a later round raises a *different* question, though: the same privileged read that was worthless for "why was it rejected" is often decisive for "did the retry actually mint anything", because the state it exposes carries per-action timestamps. Shred any credential a probe put on local disk once the question is answered, and say that you did.

Then open round 1 with the existence question, the evidence, and a recommended verdict: **proceed** (restating the why), **descope**, **defer**, or **kill**. A descope or defer that leaves work parked behind blockers comes with the recommended order of those blockers in the same round (each with live status and why it sits where it does), because "park it" without a sequence is the first follow-up question. The verdict is the user's; requirement and solution-shape grilling proceed only on proceed or descope. On kill or defer, propose closing or de-prioritising the item where it lives; on descope, propose trimming its source; execute any write-back only on the user's yes.

## Resuming a subject

When the user says "continue on <ticket/topic>", rebuild state from evidence before round 1: search past sessions for the identifier, re-read the tracker item (comments, link graph, status), and check the worktree (`git status`, branch vs develop, grep the code for the symbols the ticket names). Tracker text goes stale after merges and closed siblings, so open with a short "what is already true" list and only ask what that leaves open.

**Uncommitted WIP from a prior session is a claim, not evidence.** Trace every field it reads back to the type that produces it: an access nothing sets compiles clean behind a cast and silently takes the fallback branch forever. Such a hole is usually a scope question in disguise (the data the acceptance criteria need sits behind a layer declared out of scope), so put it to the user as a round-1 question with options — extend the shared layer additively, drop the requirement, or bypass the layer and lose its guarantees. Also flag comments that contradict their code and parameters the body ignores: both mark intent the prior session never implemented.

**Settle conflicting tracker text from the generated artifact**, not the newest timestamp — a "correction" comment can be the stale one. When a comment and the description disagree on a wire detail, read the spec, generated client, or route table, and say in the "already true" list which text the artifact confirms.

**On a wire-detail mismatch between repo convention and the server's published contract, the server's spec is the starting fact.** If the user owns both sides and chooses to change the server, price it with the blast radius at the read sites (handlers, spec declarations, tests) and a survey of every real caller, including unmerged branches (`git grep <name> origin/<branch>`); the caller survey usually decides it. Cite standards only after that survey. Correct and confirm any typo in a name the user dictates, because a misspelled header matches nothing.

## Closing the grill

Before routing a fix to a ticket, check which side *generates* the artifact. A complaint that surfaces in a UI is not automatically frontend work: if the file, response body, or document is produced server-side, the change belongs to the backend ticket and only its presentation belongs to the console one. Split the ask along that line and say which half went where, rather than appending a server-side change to the frontend ticket that happens to mention the symptom.

When the frontier is empty, restate the settled decisions as one numbered table (decision per row, including answers the user amended) and ask for the go-ahead. The usual next steps are `deepen`, then `simplify`'s deletion pass on the plan, then implement; if an amended answer makes tracker text wrong, list those edits in the plan.

Before proposing to implement, check that each planned change (each MR, each external ask) already has a tracker item. The user may hand the work to a fresh session, which keeps only what the tracker holds. If any item lacks one, say so and offer to file it with the session's verified facts in its body.

## Steers after the go-ahead

A mid-implementation message that changes a settled decision (drops a mechanism, moves a trust boundary, widens scope) re-opens the frontier. Do not absorb it into the running work: read the code that decision touches, say what it removes and what depends on it, ask the new questions with recommendations (how far it goes, which change/MR carries it, what happens meanwhile, what the interim config must keep so nothing locks out), and keep going only on parts the steer does not touch. Write-backs to the tracker wait for the new answers. Once answered, search the tracker for an existing ticket for the new work before creating one, then create it linked to the parent; the in-flight change keeps its scope and records the dependency instead of absorbing it. When the answers land, finish the in-flight change with the interim config unchanged and record the new work as a row in the review notes of the change that triggered it.

A steer of the form "make X consistent with Y" is not one decision. Decompose it into the layers that would have to match — the rule or credential, the reachability of the capability, the deploy wiring — price each, and ask which ones are in scope; a rule-only change can leave the capability uniform on paper and still unreachable in practice. Verify reachability from the code that generates or registers the surface, not from the symmetry of the two call sites.

When the user says "deepen and simplify before implementation", read the code the plan touches first (the real constructors, wiring sites, generated files, gates) and let it overturn the plan's shape: the deepened task names the outside judge (tests, gates, the live check) and the simplify table lists each cut with the requirement that dies. Show both before writing code.

## Running the rounds

- **Look up facts, ask decisions.** If the user says "I already answered that", you asked a fact you should have read, or re-asked a settled item.
- **Chain batched probe commands with `;`, never `&&`.** A search that legitimately finds nothing exits non-zero and silently aborts every probe queued behind it, so half the fact-gathering round vanishes and you re-run it.
- **Never put a pipeline inside a probe's conditional.** `if cmd | head -1` tests `head`'s exit status, not the search's, so every branch of a loop reports a match and you present a fabricated hit list. Capture to a variable or count first, then test the count.
- **Write any multi-line or quote-heavy probe to a file and run the file.** Nested quoting inside `-c` flags breaks silently or mangles the payload, and the second attempt usually breaks differently; a scratch script is readable, re-runnable, and diffable when the output surprises you.
- **A scan proves absence only as of its own timestamp.** Before concluding "there is no such file / row / route", re-run the scan — if the user acted between your probe and your conclusion, you will otherwise build a theory on state that no longer exists and have to retract it. Timestamp-bearing evidence (an mtime, an annotation, a log line) beats a point-in-time listing.
- **Answer the user's own questions before asking yours.** When an answer comes back as a question ("what is X for? I thought we do Y"), open the next round with the plain explanation, then re-ask any decision that depended on it. Asking the decision again before explaining gets "answer what I asked first".
- **Open each round with what is settled**, then only the questions the last answers opened. Record only what the user answered; a skipped question stays open.
- **Test proposed rules against the real data** and report the counts each would produce, before the user discovers the noise.
- **Run the item's own acceptance check before round 1, verbatim with every alternation**, and partition its hits by which scope owns them. A repo-wide criterion often sweeps in files another ticket owns, making it unmeetable as written — surface that as a question with counts per class. A compound criterion reported green has often been checked on one branch only, and the other branch's survivors may be deliberate; ask whether to amend the criterion or delete the text, since deleting text that documents reachable behavior makes the spec lie.
- **An answer that conflicts with how the mechanism works is not settled.** Explain the mechanism in a sentence, name the consequence, offer the option that keeps the user's intent, and re-ask. Treat "we already do this" and "X can reach Y" as premises to probe: grep the default branch *and* read the live system read-only (another team's setup often exists only there), and report per-source results — another consumer's success is not proof for this one. When the answer is a *principle* ("use upstream unless we changed it"), apply it to every item it covers, probe each, and bring the items where it breaks as the next round's questions.
- **Pick a probe credential from the path's last live proof** — the closing comment of the ticket that last exercised it — rather than from a doc line, which may describe a different step of the path. Retract a wrong recommendation plainly, in chat and in any tracker text written from it.
- **Write questions a skimmer can answer:** plain words, no internal codes, one-clause consequence per option. On "eli5" or "what is X for?", lead with an analogy, then the mechanism, and keep the recommendation.
- **"Follow the team convention" is a probe order.** Survey how peers already do it in the live system (per-peer counts, one example each), show it as a table, and turn each divergence into the next round's question. Apply the principle to every component of the plan in the same round. When peers have no equivalent, the matching option is "don't add it" — lead with it, with the keep/cut table; if no component survives, the existence verdict flips to kill.
- **Every proposed change names where it lands:** the destination file or system (doc section, Makefile target, skill, config key) and, for agent-instruction changes, which agents load it. Before proposing a new rule, sweep docs, agent-rule files and skills for lines that already say otherwise and show them as a `file:line | text | fix` table — deleting a contradiction is often simpler than adding the rule.
- **A narrowed scope re-derives the evidence.** On "just focus on step X", drop questions outside X, re-probe only that window, and open the next round with the narrowed numbers.
- **"Overkill / simpler?" gets the deletion pass out loud:** keep/cut per component, with the requirement that dies if cut.
- **When challenged, re-derive on the merits** and reverse if the simpler option wins. "Whichever is cleaner" delegates the choice: pick it and mark it settled.
- **Surface conflicts** between an answer and a standing rule as a question. Never attribute a gate or rule to the user that they did not state.
- **Ask only about this session's scope.** When the user runs parallel sessions, report findings about a sibling's item as a one-line note to pass on, and ask only what this session will act on.
- **A broken precondition is a fix, not a question.** If the setup is wrong (a branch cut from the wrong base, a stale checkout), state the safe repair and do it under the current go-ahead.
- **Search the tool catalog for a dedicated tool** (for example "tracker comment") before reporting that a tool can't read X — a generic search returning nothing for a field does not mean the integration lacks it.
- **Read the file search's "hidden or gitignored matches" warning.** Private artifacts are often gitignored, so zero hits plus that warning means the file exists — open the listed paths.
- **Inventory / research subjects:** `references/inventory-research-subjects.md`. **Meeting-board subjects:** `references/meeting-board-usefulness.md`. **People-plan subjects (onboarding, 30/60/90 ramp):** `references/people-plan-subjects.md`.

The session is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not act until the user confirms shared understanding.
