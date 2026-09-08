---
description: "Verify this repo's artifacts against the installed agents (pi, opencode, Claude Code); report drift; bump the README sync marker when done."
argument-hint: "[agent to focus on (default: all)]"
---

Sync audit — run when an agent updates, or on request. The repo is the source of truth for pi / opencode / Claude Code artifacts; find it by resolving a deployed symlink, e.g. `readlink ~/.claude/commands/sync-audit.md`. Work from that directory.

1. **Versions** — `pi --version`, `opencode --version`, `claude --version`. Compare against the "Verified working against …" line in README.md. All equal → nothing to do; stop.
2. **Extension tests** — `node --test pi/*.test.mjs`; must stay green.
3. **pi CHANGELOG since the marked version** — `$(npm root -g)/@earendil-works/pi-coding-agent/CHANGELOG.md`. For each new extension event, tool API, or default-behavior change: adopt (like the notify-* adoption of `ui_prompt_start/end`), or confirm not applicable. Upstream-symlinked example paths (questionnaire.ts, subagent/) must still exist at the README's documented locations.
4. **Subagent schemas** — `pi/agents/*.md` vs pi's current example agents; `opencode/agents/review.md` vs opencode's agents docs; `claude/agents/review.md` vs Claude Code's subagent docs. Verify against each agent's own current docs (web), never recall.
5. **Deployment health** — broken symlinks: `find ~/.config/opencode ~/.claude ~/.pi/agent ~/.agents -type l ! -exec test -e {} \; -print`. Also: in-repo-but-not-deployed and deployed-but-not-in-repo files across extensions, agents, skills, commands. Exclusions: vendor-managed files — see README § Extensions (pi) and § Skills (shared).
6. **Reference links** — every URL in README § References returns HTTP 200: `curl -sILo /dev/null -w "%{http_code}\n"`.
7. **Bump the marker** — update the README "Verified working against …" line to the audited versions and today's date.

Report deltas only. Fix what the audit surfaced; leave unrelated drift alone.
