---
name: research
description: Use when researching or comparing tools against primary sources. Fan out, cite, synthesize.
---

Spin up a `general` subagent to do the research, so you keep working while it reads. Several research questions blocking a build → one subagent each, in parallel, on throwaway branches, now rather than in a later session.

Its job:

1. Investigate against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up. Follow every claim back to the source that owns it.
2. Write findings to a single Markdown file, citing each claim's source.
3. Land it by what it is: **durable reference** (API facts, specs worth citing) → the repo's notes (match convention, or pick somewhere sensible and say where). **Exploration behind a decision in flight** → throwaway branch `research/<name>` with a pointer on the issue/ADR; main keeps only the validated decision. **A comparison asked conversationally in chat** → answer in chat, no repo file unless the user asks — this user wants one canonical doc per fact and rejects unrequested docs.

## Comparing tools / vendors / products

For a "deeper / thorough comparison" of named candidates, follow `references/tool-comparison.md` (fan-out, dimension checklist, output shape). Always-on rules:

- One subagent per candidate, all dispatched in the same turn with the **same dimension checklist**, so results line up into one table.
- Evaluate candidates only against the job the user actually uses the incumbent for, within the scope they set ("don't go the DIY route").
- Label earlier quick answers from memory as unverified; the deep pass replaces them and says plainly when it overturns an earlier claim.
