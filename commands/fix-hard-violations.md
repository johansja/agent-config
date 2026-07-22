---
description: Looping apply-layer over triple-review. Enforceable findings (Correctness Critical/Warning, Security Critical/Warning non-HBR, Style hard violations) loop to convergence or cap 3. Advisory findings (smells, Suggestions) defer to human. HBR security surface defers regardless of severity. No commit.
argument-hint: "[files|commits|range]"
---

Apply-layer over `/triple-review`. Fixes run in the main session — the `review` subagent can't edit. Target resolution: reuses `/triple-review`. Smell/hard-violation distinction: see `/triple-review` Style axis.

## Classification

| Axis | Loop | Defer |
|------|------|-------|
| Correctness | Critical, Warning | Suggestion |
| Security | Critical, Warning (non-HBR) | Suggestion; all HBR regardless of severity |
| Style | Hard violations | All smells (judgement calls); tooling-enforced |

## HBR (security carve-out)

Defer all security findings on: `**/auth*`, `**/authz*`, `**/permissions*`, `**/secrets*`, `**/identity*`, `**/*.env*`, `**/config*.{js,ts,json,yaml,yml,toml}`, `**/docker-compose*`, `**/Dockerfile*`, `**/*.tf`, `**/k8s/**`, `**/charts/**`. Also defer if diff touches tokens: `password|secret|token|api_key|apikey|private_key|credential`.

## Loop

**Each round (1–3):** run `/triple-review` → classify → apply enforceable fixes only (main session, one finding → one edit, no adjacent refactors) → run tests once (if correctness fixes applied) → defer everything else.

## Stop

Any one: clean round (zero enforceable), cap=3, oscillation (same finding flagged→fixed→re-flagged), diminishing returns (enforceable count flat across 2 rounds).

## Output

```
## Applied (round-by-round)
## Deferred (advisory, grouped by axis, with reason) — human triage
## Stop reason: clean | cap=3 | oscillation | diminishing-returns
```

## Guardrails

- No scope expansion — fixes outside the original diff defer.
- Tests once per round, only if correctness fixes applied.
- No commit. Working tree dirty.
