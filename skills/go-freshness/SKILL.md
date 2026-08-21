---
name: go-freshness
description: Go freshness — version and idiom currency. Use when writing or reviewing Go where recent language/stdlib additions matter, checking what a Go release adds, or upgrading a repo's Go toolchain.
---

# Go freshness

The toolchain knows more than your training. Verify, don't recall.

## Ceiling

Read the pin: the `go` directive in go.mod (go.work for workspaces; rules_go toolchain for Bazel repos, where the `go` CLI may be off-limits).

## What's newer

- Latest: https://go.dev/dl/?mode=json · Release notes: `https://go.dev/doc/go1.<N>`
- Report only deltas between pin and latest that matter to the task — not a changelog dump.

## Idiom

- `go fix ./...` — modernize suite, bundled since Go 1.26. Review the diff.
- golangci-lint `modernize` (v2.6.0+) respects the go directive: never suggests above the pin. Recommend enabling where absent.

## Upgrade

1. Confirm latest stable, the relevant deltas, and golangci-lint compatibility (supports only the 2 latest Go minors; must be built with Go >= target).
2. Bump the `go` directive (`go work sync` for workspaces).
3. `go fix ./...`, then the repo's lint + test gates.
4. Flag port/OS requirement changes that hit CI or deployment.
