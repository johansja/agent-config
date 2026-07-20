---
name: codebase-navigation
description: Navigate, explore, and understand an unfamiliar codebase. Use when the user asks "how does this work", "walk me through", "explain the architecture", or wants to understand, map, or explore code.
---

1. **Recon:** dispatch `scout` (subagent if available, else direct tools). Thoroughness inferred:
   - Quick — targeted lookup
   - Medium — follow imports, critical sections
   - Thorough — trace deps, check tests/types

2. **Analyze** based on intent:
   - Pure understanding → present, stop
   - Architecture critique → `/skill:codebase-design`
   - Visualize → `/skill:diagrams`
   - Domain confusion → `/skill:domain-modeling`
   - Plan changes → dispatch `planner` with findings + requirements

3. **Deepen** if gaps remain: grep cross-refs, trace data flow, check tests.

**Output:**
```
## Overview          — 2-3 sentences
## Key Modules       — path + responsibility
## Data Flow         — prose or Mermaid
## Terminology       — domain terms if applicable
## Start Here        — which file and why
## Next Steps        — recommended skill/agent
```

**Rules:**
- Reuse scout's file list; don't re-read.
- Hand off to `planner`; don't duplicate.
- `codebase-design` vocabulary only when asked or relevant.
