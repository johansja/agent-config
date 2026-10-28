---
name: deepen
description: Rewrite a settled task at expert depth, after a grill returns proceed and before implementing.
---

The task as worded is the asker's best guess at how to reach the outcome. Rewrite it deeper, not bigger: raise the level of execution, never the scope of the deliverable.

Rewrite along four questions:

1. **Expert gap** — what would a top professional in this field do here that the task doesn't ask for?
2. **Raw material** — the rawest input they would start from, not what has already been digested for the task.
3. **Instruments** — the specific methods and tools they would use. Models switch vocabulary, not methods: where the task reaches for a markdown table, reach for the database, the statistical model, the profiler.
4. **Outside judge** — what, other than the agent or the user, shows the result is right: a test, script, benchmark, or fixture the result must pass. If none exists, building it is part of the task.

Range-check the rewrite: state the goal as a verb, not a noun (not "a CSV export" but "analysts move this data into their tools"), and borrow the methods of adjacent fields where they beat the surface framing. Do what the expert does; never role-play the expert.

Read the code paths the change touches (composition root, constructors, config loaders, generated-file gates, deploy wiring) before rewriting — the best findings live there: a shared instance that must be split, a startup path that fails on a missing optional input, generated files that must be regenerated. Present: goal as a verb, numbered build steps, the outside judges (tests, generators, verify scripts, live check), and a keep/cut table for the simplify pass with the requirement that dies per cut. Flag anything the user must do by hand (secrets, manual tracker edits).

Show the rewritten task to the user before implementing; they can veto. A rewrite that changes what is built — not how well it is built — is a grilling-level scope change: take it back to the user as a question instead of absorbing it.
