# Context — agent-config

This repo is the source-of-truth for pi, opencode, and Claude Code agent
artifacts, deployed by symlinking into each agent's config dir. It is not itself
a pi/opencode/Claude Code project.

## Glossary

### Review seam (code-review skill ↔ review subagent)

- **Resolution** — the code-review skill's phase: parse the review target
  (`<id>`, URL, files, commit range), select the diff tool (`glab` / `gh` /
  `git`), detect an empty diff (→ stop), and pin the source to a commit SHA.
  Judgement; stays at the skill.
- **Fetch** — the subagent's phase: run the resolved diff command and gather its
  own per-axis inputs (standards files, MR description, etc.). Legwork; moves
  down to the `review` subagent.
- **Exploration** — in the `review` subagent's context, the scope where the
  subagent fetches its own diff and per-axis inputs from a resolved handle, and
  may trace code paths beyond the diff to judge a finding. Not open-ended
  roaming into unrelated concerns — bounded by the assigned axis.
- **Spec skip-decision** — the one per-axis input check that stays at the
  code-review skill: confirm a spec source exists (MR/PR desc, commit messages,
  or linked `Closes #N` / `Resolves #N`) *before* spawning the Spec subagent;
  skip the axis if none, so no spawn is spent on an axis that will self-skip.
- **Re-review** — a code-review invocation on a target already reviewed
  before: same session, or cross-session via the recorded reviewed head.
  Reviews the delta (`git diff <reviewed-head>..<current-head>`, tree-to-tree,
  so rebase shifts count) and verifies prior findings; the user's explicit
  "full review" overrides. Full review is the fallback when no reviewed head
  exists or the old head is unfetchable.
- **Reviewed head** — the target head SHA captured at Resolution of a review
  round and recorded as `Reviewed head: <sha>` in the posted note; the state
  anchor that makes re-review work across sessions.

### Deletion pass (simplify skill ↔ grilling ↔ global rules)

- **Deletion pass** — the `simplify` skill's procedure: enumerate candidate
  deletions in the just-written change, trace each to the requirement that
  dies if it's cut, apply `cut` verdicts, list `keep`/`judgment-call` for the
  human. Runs before implementation is declared done (auto-trigger via global
  rules) or on demand.
- **Solution-shape grilling** — the grilling skill's plan-time counterpart of
  the deletion pass: for each component or abstraction in a proposed plan, ask
  which requirement dies if it's cut; cut orphans before they're written.
  Complexity is cheapest to delete at plan time.

### Session naming actors

Three independent actors set a pi session's display name. Independence is
deliberate: no shared state, no provenance tracking, no locking.

- **auto-name** — `auto-session-name.ts`: one-shot, fires on the first
  `agent_settled` of a brand-new session, skips if any name is already set.
  Titles from turn-1 text.
- **`/name`** — pi built-in: user-explicit set. Sets nothing but the name;
  marks nothing; locks nothing.
- **`/rename`** — on-demand regenerate: user-explicit command that re-titles
  from the whole session (via a summarize-then-title pass), replacing
  whatever name exists. Explicit invocation is itself the consent — it may
  replace a `/name`-set name, by design.
- **drift** — session content outgrowing its name (the name titles turn 1,
  the session became something else); an auto-named session that drifts gets
  manually renamed later.

Why no provenance: the only automatic actor (auto-name) is guarded by
name-existence; every other actor is user-explicit, so there is nothing to
protect a manual name *from*. Do not reintroduce origin markers.

### Artifact classes

See `README.md` for the canonical tree. Glossary entries only where a term
earned one this session; do not restate structural facts already in README.
