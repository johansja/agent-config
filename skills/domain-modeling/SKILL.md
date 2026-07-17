---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when pinning down domain terminology or a ubiquitous language, recording an architectural decision, or when another skill needs to maintain the domain model inline.
---

Active discipline — challenging terms, inventing edge-case scenarios, and writing glossary and decisions down the moment they crystallise. Merely reading `CONTEXT.md` for vocabulary is not this skill; this is for when you're changing the model.

Most repos: single `CONTEXT.md` at root, `docs/adr/` for decisions. If a `CONTEXT-MAP.md` exists at root, the repo has multiple contexts — the map points to each (e.g. `src/ordering/CONTEXT.md` + `src/ordering/docs/adr/`). Create both lazily — first term resolved creates `CONTEXT.md`, first ADR creates `docs/adr/`.

During the session: challenge glossary conflicts immediately ("you define X as A but seem to mean B — which?"), sharpen fuzzy terms to a canonical proposal ("'account' — Customer or User? those are different"), stress-test relationships with edge-case scenarios, cross-reference code against stated behavior and surface contradictions. Update `CONTEXT.md` inline as terms resolve — don't batch; it's a glossary only, no implementation/spec/scratch. Offer an ADR only when all three: hard to reverse, surprising without context, result of a real trade-off. Any missing, skip.
