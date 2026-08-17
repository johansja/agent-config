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

### Artifact classes

See `README.md` for the canonical tree. Glossary entries only where a term
earned one this session; do not restate structural facts already in README.
