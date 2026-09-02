---
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "[what will the next session be used for?]"
---

User input: $ARGUMENTS

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to the OS temporary directory — not the current workspace.

Include a **suggested skills** section naming which of this repo's skills the next agent should load.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs) — reference them by path or URL instead.

Redact sensitive information (API keys, passwords, PII).

If $ARGUMENTS is non-empty, treat it as what the next session will focus on and tailor the document accordingly.
