---
description: "Looping apply-layer over the `code-review` skill (axes: Correctness, Security, Standards). Enforceable findings loop to convergence or cap 3. Advisory and HBR-security findings defer. No commit."
argument-hint: "[files|commits|range]"
---

Apply-layer over the `code-review` skill — run it with `code-review`'s local-default axes {Correctness, Security, Standards} on `$ARGUMENTS` (Spec omitted — no MR/PR spec source for local diffs; see `code-review` Spec-source rule). The `review` subagent can't edit, so fixes happen here, in the main session. Smell/hard-violation distinction: see `code-review` Standards axis.

## Classify

| Axis | Loop | Defer |
|------|------|-------|
| Correctness | Critical, Warning | Suggestion |
| Security | Critical, Warning (non-HBR) | Suggestion; all HBR regardless of severity |
| Standards | Hard violations | All smells; tooling-enforced |

**HBR carve-out (defer regardless of severity):** `**/auth*`, `**/authz*`, `**/permissions*`, `**/secrets*`, `**/identity*`, `**/*.env*`, `**/config*.{js,ts,json,yaml,yml,toml}`, `**/docker-compose*`, `**/Dockerfile*`, `**/*.tf`, `**/k8s/**`, `**/charts/**`. Also defer diffs touching tokens: `password|secret|token|api_key|apikey|private_key|credential`.

## Loop (max 3 rounds)

`code-review` (axes: Correctness, Security, Standards) → classify → apply enforceable fixes only (one finding → one edit, no adjacent refactors) → run tests once if correctness fixes applied → defer everything else.

## Stop

Any one: clean round (zero enforceable), cap=3, oscillation (same finding flagged→fixed→re-flagged), or diminishing returns (enforceable count flat across 2 rounds).

## Output

```
## Applied (round-by-round)
## Deferred (advisory grouped by axis, with reason) — human triage
## Stop reason: clean | cap=3 | oscillation | diminishing-returns
```

## Guardrails

- No scope expansion — fixes outside the original diff defer.
- No commit. Working tree dirty.
