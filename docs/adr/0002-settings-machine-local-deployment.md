# ADR 0002 — settings.json is copy-deployed, machine-local

## Status
Accepted

## Context
`pi/config/settings.json` was symlinked into `~/.pi/agent/settings.json` like
every other config artifact, so pi's own runtime writes landed directly in the
repo: `lastChangelogVersion` on every upgrade, plus `/theme` and model-toggle
changes. With the repo deployed on several machines, each machine's pi upgrade
produced a phantom "shared config" diff — runtime state masquerading as
configuration, with history that cannot say which machine saw what.

## Decision
`settings.json` is the one artifact deployed by copy, not symlink. The tracked
file holds only shared defaults; the deployed file is machine-local and absorbs
pi's runtime writes (changelog marker, `/theme`, model toggles). Changing
shared defaults means editing the tracked file and re-copying — a full
overwrite that also resets machine-local preferences. Re-deploy deliberately
clobbers; there is no merge tooling.

`models.json` and `mcp.json` remain symlinked — pi never writes them.

## Consequences
- Upgrades no longer dirty the repo; a clean `git status` means clean.
- Local preference changes (theme, model toggles) do not sync anywhere; port
  wanted changes into the tracked file by hand.
- A fresh deploy takes the tracked `lastChangelogVersion` as its initial
  value; machines bump their local copy only.
- README's Installation copies `settings.json` and symlinks `models.json` /
  `mcp.json`; the old "expect a dirty diff after upgrades, commit it" policy
  is gone.

## Reconsider when
- Machine-local preference drift starts hurting (re-toggling after every
  re-deploy), or a second config file starts taking pi's runtime writes.
