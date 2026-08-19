---
description: Reference for writing and editing skills and slash commands well — the vocabulary and principles that make them predictable.
---

**Predictability** — the agent taking the same *process* every run, not producing the same output — is the root virtue; every lever below serves it.

## Leading words

A skill or command hangs on a **leading word** (e.g. "seam", "axis", "primary source"). It anchors *execution* (the agent reaches for the same behavior every time the word appears) and *invocation* (when the same word lives in prompts, docs, and code, the agent links it to the skill and fires reliably). Assume every skill carries restatements that leading words retire — go find them.

## Information hierarchy

Two content types — **steps** (ordered, each ending on a *checkable, exhaustive* completion criterion) and **reference** (consulted on demand) — sit on a ladder by how immediately the agent needs them: in-skill step → in-skill reference → behind a pointer. Co-locate definition, rules, caveats per concept.

## Branching

Distinct uses of a skill are **branches**. Inline what every branch needs; push behind a pointer what only some reach. The cleanest disclosure test there is.

## Description (frontmatter)

- Front-load the leading word.
- **One trigger per branch** — synonyms renaming a single branch are duplication; collapse them.
- Cut identity already in the body.
- Every word costs context load; a description earns harder pruning than the body.

## Command-specific (beyond skills)

- Parse `$ARGUMENTS` up front — positional `$N` is non-portable (pi/opencode 1-based, Claude Code 0-based); advertise shape in `argument-hint`.
- Subagents have no access to your context — **paste baselines in full** into their brief (e.g. the Fowler smell list, the spec source). Don't point, paste.
- State the post default (local vs MR comment) explicitly; the don't-merge rule lives at the post step.

## When to split

Split off a **model-invoked** skill only when a distinct leading word should trigger it on its own, or another skill must reach it. You pay context load for the new always-loaded description — that independent reach has to be worth it.

## Failure modes

- **Premature completion** — sharpen the completion criterion first (cheap, local); only if irreducibly fuzzy *and* you observe the rush, split (sequence cut).
- **Duplication** — same meaning in two places; costs maintenance and tokens, inflates prominence.
- **Sediment** — stale layers that settle because adding feels safe, removing feels risky. The default fate of any skill without a pruning discipline.
- **Sprawl** — too long even if every line is unique. Cure: disclose reference behind pointers, split by branch or sequence.
- **Negation** — steering by prohibition backfires; prompt the **positive**, keep a prohibition only as a hard guardrail you can't phrase positively, paired with what to do instead.
