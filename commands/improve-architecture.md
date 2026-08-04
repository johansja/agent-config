---
description: Scan a codebase for deepening opportunities (shallow→deep modules) and grill through one. Use when reviewing architecture or paying down design debt.
---

Propose **deepening opportunities** from friction in walking the codebase. Use `codebase-design` vocabulary + `CONTEXT.md` domain language — never "component/service/API/boundary". ADRs in `docs/adr/` are settled, not to re-litigate.

**Explore.** Scope before scanning — YAGNI. If the user named a direction, take it. Otherwise weight hot spots from `git log --oneline` (files that keep coming up); widen if scattered. Read `CONTEXT.md` and nearby ADRs first. Note friction as you walk: one concept bouncing across many small modules; interfaces nearly as complex as implementation; pure extracts tested while real bugs hide in their call sites (no locality); coupling leaking across seams; parts untested or testable only through internals. Run the **deletion test** — deleting a shallow module should concentrate complexity, not move it.

**Report.** Self-contained HTML file in the OS temp dir so nothing lands in the repo — resolve from `$TMPDIR`, fall back to `/tmp`, write `<tmpdir>/architecture-review-<timestamp>.html`. Tailwind via CDN for layout; inline SVG for before/after visualisations per `diagrams`. Open it (`open` macOS, `xdg-open` Linux, `start` Windows) and give the absolute path. Per candidate: files, problem, solution, benefits (locality/leverage/testability), before/after visualisation, strength badge (Strong / Worth exploring / Speculative). End with a top recommendation. Don't propose interfaces yet — ask which to explore.

**Grill.** Hand the picked candidate to `grilling` and run `domain-modeling` inline as decisions crystallize: new term → `CONTEXT.md`; fuzzy term sharpened → update it there; rejected with a load-bearing reason → offer an ADR so it's not re-suggested; alternative interfaces → `codebase-design`.
