---
description: Two-axis parallel review — correctness and security run as parallel subagents, reported unmerged. Covers the axes the code-review skill lacks. Local only.
---

Two-axis review of recent changes along **correctness** and **security**, in parallel, without merging — the two axes the `code-review` skill does not cover. For Standards/Style + Spec, use `/skill:code-review` instead. The axes are deliberately separate — a change can pass one and fail another.

## 1. Resolve the target

If the user named files, commits, or a range in conversation, review that. Otherwise review uncommitted/recent work:

- Default: `git diff HEAD` (staged + unstaged uncommitted changes)
- If that's empty: `git diff HEAD~1` (the last commit)

Capture the diff. If empty, stop — nothing to review.

## 2. Fire two parallel subagents

Use the `subagent` tool with the **`tasks`** parameter (not `chain`) to fire both in parallel in one message. Each uses the `reviewer` agent.

### Correctness axis

Task brief — give the subagent:
- The full diff from step 1
- The list of changed files and their repo paths

Scope: execution paths, edge cases, error handling, concurrency, resource leaks. Run the test suite (`go test`, `pytest`, `node --test`, whatever fits — or skip if none). Ignore style and security unless they cause a correctness bug.

Output (override the reviewer agent's default format): under a single `## Correctness` heading, findings only. For each: severity (**Critical** / **Warning** / **Suggestion**), file + line citation, why it's wrong. No preamble, no restating what the code does. Stop when covered.

### Security axis

Task brief — give the subagent:
- The full diff from step 1

Scope: input trust boundaries, auth/authz surface, secret handling, injection (SQL/shell/path/HTML), fail-open paths. Do not run tests. Ignore correctness and style unless they create a security hole.

Output: under a single `## Security` heading, findings only. Same severity tags, same citation format. No padding.

## 3. Aggregate locally

Present both reports in this session under `## Correctness` and `## Security`. **Do not merge, do not rerank.** End with one summary line per axis: total findings + worst issue (if any). Do not pick a single winner across axes.

## 4. Local only

Do not post anywhere. Reports stay in this session.
