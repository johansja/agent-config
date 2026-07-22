---
name: capture-lesson
description: Use when a correction, wrong assumption, or non-obvious gotcha surfaces during work, or the user says remember/note/record this.
---

Surface every lesson as a diff; wait for "yes" before writing. First occurrence is enough — no count-to-N (the agent has no cross-session tally). Capture what the user asked on "remember/note/record this". One-off fixes and preferences are not lessons.

Before proposing, grep the target file and refine an existing heading over adding a new one. Write reusable rules, not in-flight task state.

Scope by failure mode, not topic: project AGENTS.md is the default (repo conventions, tooling, env, domain); `agent-config/global/AGENTS.md` is for agent-behavior failure modes recurring across codebases (e.g. "agent claims tests pass without running them").

Show the target file, the diff, and any related lines grep found. One or two concrete lines — commands, env, gotchas — no platitudes. More than 15 under one heading → propose consolidation. Contradiction → retire the stale line. Rejected proposals may re-surface; no rejection log.
