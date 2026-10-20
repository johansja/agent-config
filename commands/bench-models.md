---
description: "Benchmark BitDeer AI models on coding-agent traffic — ~150k-token context, cold vs cached TTFT, decode tok/s, tool-call pass rate. Use when comparing models on api-inference.bitdeer.ai."
argument-hint: "[--models a,b] [--iter N] [--src DIR] [--target-chars N] [--max-tokens N] [--timeout-ms N] [--list]"
---

Run `node ~/.pi/agent/bin/bench-models.mjs $ARGUMENTS` (requires `BITDEERAI_API_KEY` in env). Report the table verbatim, then a short read: winner per metric, spread vs. run-to-run noise, any failed runs. If the binary is missing, install is one line — see agent-config README (`scripts/` → `~/.pi/agent/bin/`).
