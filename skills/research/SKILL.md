---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a subagent.
---

Spin up a `general` subagent to do the research, so you keep working while it reads. Multiple research questions blocking a build — fire one subagent each in parallel on throwaway branches, don't park them for a later session.

Its job:

1. Investigate against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up. Follow every claim back to the source that owns it.
2. Write findings to a single Markdown file, citing each claim's source.
3. Land it by what it is: **durable reference** (API facts, specs worth citing) → the repo's notes (match convention, or pick somewhere sensible and say where). **Exploration behind a decision in flight** → throwaway branch `research/<name>` with a pointer on the issue/ADR; main keeps only the validated decision.
