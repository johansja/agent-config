---
name: t3-pr-watch
description: Watch T3 Code pull requests/MRs for reviews, comments, and check results, and write maintainer PR review guides. Use when the user says "watch this PR/MR", "tell me when my PR is reviewed", "keep an eye on the MR", "write a PR guide", or "prep this PR for review" — only when the t3-code MCP tools are present (pi running under T3 Code).
---

# T3 Code pull-request tools

`watch_pull_request`, `link_pull_request`, `unwatch_pull_request`,
`write_pull_request_guides`, and `read_pull_request_guide` are deferred
t3-code tools: invisible until `tool_search` loads them, and unadvertised by
the injected T3 Code orchestration instructions. This skill is the
advertisement — on a trigger, load the named tools with `tool_search` and
call them; each tool's description carries its operational rules.

## Watching

Trigger: the user wants PR/MR activity — reviews, comments, check results,
merge conflicts — pushed into this thread instead of manual polling.

- Hosts: GitHub, GitLab, Bitbucket. This user's PRs are mostly GitLab MRs —
  verify one live GitLab MR end-to-end before relying on the loop.
- A subagent cannot watch; the parent thread owns the PR.

## Review guides

Trigger: preparing a PR for maintainer review. `write_pull_request_guides`
writes to the PR's Guide tab; `read_pull_request_guide` reads one back.
