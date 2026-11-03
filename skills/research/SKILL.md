---
name: research
description: Use when researching or comparing tools against primary sources. Fan out, cite, synthesize.
---

Spin up a `general` subagent to do the research, so you keep working while it reads. Multiple research questions blocking a build — fire one subagent each in parallel on throwaway branches, don't park them for a later session.

Its job:

1. Investigate against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up. Follow every claim back to the source that owns it.
2. Write findings to a single Markdown file, citing each claim's source.
3. Land it by what it is: **durable reference** (API facts, specs worth citing) → the repo's notes (match convention, or pick somewhere sensible and say where). **Exploration behind a decision in flight** → throwaway branch `research/<name>` with a pointer on the issue/ADR; main keeps only the validated decision. **A comparison asked conversationally in chat** → answer in chat, no repo file unless the user asks — this user wants one canonical doc per fact and rejects unrequested docs.

## Comparing tools / vendors / products

When the user asks for a "deeper / thorough comparison" of named candidates, see `references/tool-comparison.md` for the fan-out procedure, the dimension checklist, and the output shape. Always-on rules:

- One subagent per candidate, all dispatched in a single `delegate_task` call with the **same dimension checklist** in each context, so results line up into one table. Tell each to cite a URL per claim and to list unverified items separately.
- Respect scope the user set (e.g. "don't go the DIY route", "we don't use it for provisioning") — evaluate candidates only against the job the user actually uses the incumbent for.
- Lead the answer with a one-line verdict, then a comparison table, then a short per-candidate pros/cons, then a recommendation and an honest caveats line (what couldn't be verified, e.g. unpublished pricing).
- Earlier quick answers from memory must be labelled as unverified; the deep pass replaces them, and it should say plainly when it overturns an earlier claim.
