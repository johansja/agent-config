---
name: codebase-navigation
description: Explain how a codebase works — architecture walkthrough, code mapping, codebase exploration.
---

1. **Recon** via `scout` (subagent or direct tools). Thoroughness: quick = targeted lookup, medium = follow imports and critical sections, thorough = trace deps + check tests/types.

2. **Route on intent:** architecture critique → `codebase-design`; visualize → `diagrams`; domain confusion → `domain-modeling`; plan changes → dispatch `plan`; pure understanding → present and stop.

3. **Deepen** if gaps: grep cross-refs, trace data flow, check tests. Reuse scout's file list — don't re-read. Hand off to `plan`; don't duplicate.

**Output (pure understanding):** Overview (2-3 sentences) · Key Modules (path + responsibility) · Data Flow (prose or Mermaid) · Terminology (domain terms if applicable) · Start Here (which file, why) · Next Steps (recommended skill/agent).
