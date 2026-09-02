---
name: writing-for-agents
description: Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md, CLAUDE.md, or other agent-consumed docs.
---

Reference for writing any document an agent consumes — a skill, an `AGENTS.md` / `CLAUDE.md`, a doc reached by a pointer. The packaging differs; the levers don't. **Predictability** — the agent taking the same *process* every run — is the root virtue; every lever below serves it.

## Context pointers

A **context pointer** is a reference held in the agent's context that names out-of-context material and encodes when to reach it — a skill's description, an AGENTS.md line naming a doc. Its *wording*, not its target, decides when the agent reaches the material and how reliably; a must-have target behind a weakly worded pointer is a variance bug. Sharpen the wording first; inline the material only if sharpening fails.

- **Front-load the leading word** — the pointer is where it does its triggering work.
- **One trigger per branch** — synonyms renaming a single branch are duplication; collapse them.
- Cut identity the body already carries.
- Every word of an always-loaded pointer costs on every turn — it earns harder pruning than the body.

## The two loads

**Context load** — always-loaded material (AGENTS.md lines, skill descriptions) spends tokens and attention every turn, whether or not it fires. **Cognitive load** — the human's map of which documents exist and when to reach for each; the human is the index, and that cost is the price of human agency, not something to minimise. Material behind a pointer escapes context load at the pointer's own line-price; material with no pointer rides entirely on cognitive load.

## Information hierarchy

Two content types — **steps** (ordered, each ending on a *checkable, exhaustive* completion criterion) and **reference** (consulted on demand) — sit on a ladder by how immediately the agent needs them: in-file step → in-file reference → disclosed behind a pointer. Inline what every branch needs; push behind a pointer what only some reach. Co-locate definition, rules, caveats per concept.

**Premature completion** is the step-ladder's failure mode: a vague completion criterion invites ending the step before it's done. Defend in order: sharpen the bound first (cheap, local); only if irreducibly fuzzy *and* you observe the rush, split by sequence — hiding later steps works only across a real context boundary (hand-off, subagent dispatch; an inline call leaves them in context).

## Leading words

A **leading word** (e.g. "seam", "axis", "primary source") is a compact concept already in the model's pretraining, repeated as a token, never a sentence. It anchors *execution* (the agent reaches for the same behavior every time the word appears) and *invocation* (the same word across prompts, docs, and code links to the skill and fires reliably). Assume every document carries restatements that leading words retire — go find them.

**Negation** backfires: steering by prohibition drags the forbidden behavior into context and makes it more available. Prompt the **positive**; keep a prohibition only as a hard guardrail you can't phrase positively, paired with what to do instead.

## Pruning

- One meaning, one **single source of truth** — duplication costs maintenance and tokens, and inflates a meaning's prominence past its real rank.
- The **environment** is a source of truth too (`package.json` scripts, config files, directory layout, `--help` output) — a document that restates it is a **cache**: a copy of a lookup, earning its load only when the lookup is expensive. Cache what the agent cannot find by looking (the unwritten convention, the reason behind a choice, the gotcha no config confesses); leave one-file, one-command lookups to the environment, where they cannot go stale.
- **Sediment** — stale layers that settle because adding feels safe, removing feels risky. The default fate of any document without a pruning discipline; check every line for relevance.

## When to split

Split off a **model-invoked** skill only when a distinct leading word should trigger it on its own, or another skill must reach it — you pay context load for the always-loaded description, so the independent reach has to be worth it.

## Command-specific (beyond skills)

- Parse `$ARGUMENTS` up front — positional `$N` is non-portable (pi/opencode 1-based, Claude Code 0-based); advertise shape in `argument-hint`.
- Subagents have no access to your context — **paste baselines in full** into their brief (e.g. the smell list, the spec source). Don't point, paste.
- State the post default (local vs MR comment) explicitly; the don't-merge rule lives at the post step.
