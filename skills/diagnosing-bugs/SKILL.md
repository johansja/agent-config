---
name: diagnosing-bugs
description: Diagnose hard bugs and performance regressions. Use when the user reports something broken, throwing, failing, or slow, or says debug/diagnose this.
---

Build a tight, red-capable feedback loop before anything else — one command you've already run that goes red on the user's exact symptom (failing test, curl, replay, throwaway harness, bisect, fuzz). No loop, no hypothesis; theorising before the loop exists is the failure this prevents. Tighten it: seconds not minutes, deterministic (pin time/seed/fs/net), assert the specific symptom not "didn't crash". Non-deterministic bugs: raise the reproduction rate (loop 100×, stress, parallelise) — 50% flake is debuggable, 1% isn't. If you can't build one, stop and ask for env access, a captured artifact, or prod-instrumentation permission.

Reproduce, confirm it's the user's symptom (not a nearby bug), then minimise: cut one element at a time until only load-bearing parts remain. Generate 3–5 ranked falsifiable hypotheses before testing any — "if X is the cause, changing Y makes it disappear / changing Z makes it worse". Show the list to the user; don't block. Probe one variable at a time, prefer debugger/REPL over logs, tag every debug log `[DEBUG-xxxx]` so cleanup is one grep. Perf: measure and bisect, don't log.

Regression test before the fix, only at a correct seam (exercises the real bug pattern at the call site). No correct seam = architectural finding — flag it, don't fake a shallow test. Cleanup: original repro green, regression passes, `[DEBUG-*]` gone, throwaways deleted, winning hypothesis in the commit. Then ask what would have prevented it; architectural answers hand off to `/improve-architecture`.
