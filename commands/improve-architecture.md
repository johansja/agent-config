---
description: Scan a codebase for deepening opportunities (shallow→deep modules) and grill through one. Use when reviewing architecture or paying down design debt.
---

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones, for testability and AI-navigability. Use the `/skill:codebase-design` vocabulary exactly (module, interface, depth, seam, adapter, leverage, locality) and the domain language in `CONTEXT.md` — don't drift into "component/service/API/boundary". ADRs in `docs/adr/` record decisions not to re-litigate.

**Explore.** Scope before scanning — YAGNI. If the user named a direction, take it. Otherwise walk `git log --oneline` to find hot spots (files that keep coming up) and weight those; widen if scattered. Read `CONTEXT.md` and nearby ADRs first. Walk the codebase organically, noting friction: one concept bouncing across many small modules; shallow modules (interface nearly as complex as implementation); pure functions extracted for testability while real bugs hide in how they're called (no locality); coupling leaking across seams; parts untested or hard to test through their interface. Apply the **deletion test** — deleting a shallow module should concentrate complexity, not just move it.

**Report.** Write a self-contained HTML file to `$TMPDIR` (fallback `/tmp`) as `architecture-review-<timestamp>.html` and `open` it. Per candidate: files, problem, solution, benefits (in terms of locality/leverage/testability), before/after diagram, strength badge (Strong / Worth exploring / Speculative). End with a top recommendation. Don't propose interfaces yet — ask which to explore.

**Grill.** Hand the picked candidate to `/skill:grilling`. Run `/skill:domain-modeling` inline as decisions crystallize: new deepened-module term → add to `CONTEXT.md`; fuzzy term sharpened → update it there; user rejects with a load-bearing reason → offer an ADR so future reviews don't re-suggest; alternative interfaces → use `/skill:codebase-design`.
