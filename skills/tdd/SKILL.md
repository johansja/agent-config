---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions red-green-refactor, or wants integration tests.
---

This skill is the reference that makes the red → green loop produce tests worth keeping. Consult every section before and during each cycle, not after.

Read the project's domain model first (`CONTEXT.md` / `domain-modeling` skill); match test names to the ubiquitous language; respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification.

## Seams — where tests go

A **seam** is the public boundary you test at. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user — no test at an unconfirmed seam. You can't test everything; agreeing seams up front lands effort on critical paths and complex logic, not every edge case. Ask: "What's the public interface, and which seams should we test?"

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through a side channel. Tell: breaks on refactor with unchanged behavior.
- **Tautological** — the assertion recomputes the expected value the way the code does, so it passes by construction. Expected values come from an independent source of truth: a known-good literal, a worked example, or the spec.
- **Horizontal slicing** — all tests first, then all implementation; bulk tests verify imagined behavior. Work in **vertical slices** — one test → one implementation → repeat, each test a **tracer bullet** responding to what the last cycle taught.

## Rules of the loop

- **Red before green.** Failing test first, then only enough code to pass. No anticipated tests or speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop** — it belongs to the review stage (`code-review` skill).
