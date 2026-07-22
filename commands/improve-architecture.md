---
description: Scan a codebase for deepening opportunities (shallow→deep modules) and grill through one. Use when reviewing architecture or paying down design debt.
---

Propose **deepening opportunities** from friction in walking the codebase. Use `/skill:codebase-design` vocabulary + `CONTEXT.md` domain language — never "component/service/API/boundary". ADRs in `docs/adr/` are settled, not to re-litigate.

**Explore.** Scope before scanning — YAGNI. If the user named a direction, take it. Otherwise weight hot spots from `git log --oneline` (files that keep coming up); widen if scattered. Read `CONTEXT.md` and nearby ADRs first. Note friction as you walk: one concept bouncing across many small modules; interfaces nearly as complex as implementation; pure extracts tested while real bugs hide in their call sites (no locality); coupling leaking across seams; parts untested or testable only through internals. Run the **deletion test** — deleting a shallow module should concentrate complexity, not move it.

**Report.** Stdout markdown, Mermaid for before/after diagrams. Per candidate: files, problem, solution, benefits (locality/leverage/testability), strength (Strong / Worth exploring / Speculative). End with a top recommendation. Don't propose interfaces yet — ask which to explore.

**Grill.** Hand the picked candidate to `/skill:grilling` and run `/skill:domain-modeling` inline as decisions crystallize: new term → `CONTEXT.md`; fuzzy term sharpened → update it there; rejected with a load-bearing reason → offer an ADR so it's not re-suggested; alternative interfaces → `/skill:codebase-design`.
