---
name: simplify
description: Run a deletion pass over a code change. Use before declaring an implementation complete, or when the user asks whether code can be simplified.
---

The bias lives in the global rules (`AGENTS.md`, Subtractive Bias — its never-cut list overrides every catalog hit below). This skill is the executable pass. The catalog here is canonical.

## Resolve scope

- The user named a scope (files, module, diff range) → use it.
- Otherwise → the change this session just made: the working-tree diff, plus any commits made for the task.

Completion: a concrete file/hunk list. Empty diff → say so, stop.

## Enumerate candidates

Apply every catalog pattern to every hunk and write the candidate list down. The enumerated list is the deliverable — a summary verdict pronounced over the change as a whole is theater.

### Pattern catalog

- **Speculative generality** — single-implementation interfaces, parameters nothing passes, config knobs nothing sets, hooks kept "for later".
- **Pass-through layers** — wrappers and adapters adding no behavior between caller and callee.
- **Single-use abstractions** — helpers, classes, or modules with one call site.
- **Can't-happen handling** — defensive branches for states the code cannot reach. Reachability genuinely unclear → judgment-call, not cut.
- **Excess concepts** — names, types, or modules a reader must learn that map to no requirement.
- **Dead code** — unused imports, unreachable functions, abandoned stubs, commented-out blocks.

## Trace and verdict

Per candidate, name the requirement that dies if it's cut. No requirement → orphan → cut.

- `cut` — apply directly; working tree dirty, no commit.
- `keep` — one-line reason tied to a live requirement.
- `judgment-call` — leave in, list for the human with the trade-off.

Completion: zero unresolved candidates.

## Verify

Run the project's tests/build after applying cuts. A cut that breaks the build or a test is reverted. Completion: as green as before the pass.

## Output

Per candidate: `location — pattern — requirement-that-dies — verdict`. Group by file. End with one line: cuts applied (count) + tests green (yes/no), or the judgment-calls still open.
