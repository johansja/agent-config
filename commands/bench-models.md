---
description: "Benchmark API performance (TTFT, tok/s, latency) across the BitDeer AI model set. Use when comparing models on api-inference.bitdeer.ai."
argument-hint: "[--models a,b,c] [--iter N] [--list]"
---

Run `node ~/.pi/agent/bin/bench-models.mjs $ARGUMENTS` (requires `BITDEERAI_API_KEY` in env). Report the table verbatim, then a short read: winner per metric, spread vs. run-to-run noise, any failed runs. If the binary is missing, install is one line — see agent-config README (`scripts/` → `~/.pi/agent/bin/`).
