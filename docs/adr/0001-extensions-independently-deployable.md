# ADR 0001 — Each pi extension is independently deployable

## Status
Accepted

## Context
pi extensions are symlinked into `~/.pi/agent/extensions/` individually. A user
may deploy one extension without any other. Sharing type declarations, helper
modules, or imports across extensions would couple extensions that must ship
alone.

## Decision
Each pi extension file is self-contained. Duplication across extensions is
intentional — the cost paid for independent deployability. Consolidation
*within* a single extension remains in scope; consolidation *across* extensions
does not.

The `// mirrors …` comments between extensions (e.g. `resolveModel` in
`ai-permission-gate.ts` ↔ `auto-session-name.ts`) are the accepted drift signal,
not a smell to remove.

## Consequences
- Proposals to share types, helpers, or modules across pi extensions are
  rejected at review time.
- A new extension that wants an existing capability copies it in, not imports
  from a sibling.
- `AGENTS.md` cross-references this ADR at the "self-contained" rule.

## Reconsider when
- Extensions stop being symlinked individually (e.g. shipped as a published
  package with real cross-extension dependencies).
