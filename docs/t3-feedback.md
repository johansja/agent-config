# T3 Code product feedback (from pi)

Product asks for T3 Code itself, arising from running pi as a T3 Code
runtime. The repo-owned side of the seam is defined in `CONTEXT.md`
("T3 integration seam"); these are the items that cannot be fixed from this
repo.

## 1. Orchestration instructions are always-on

The bridge appends ~7KB of orchestration instructions to every session's
system prompt (`before_agent_start`), including sessions that never touch a
T3 tool. Ask: deliver lazily — a short pointer plus load-on-first-T3-use, or
move the guidance into a skill.

## 2. Direct/deferred tool split is hardcoded

Only `orchestrator_capabilities`, `delegate_task`, and `task_status` register
direct; every other tool needs a `tool_search` round-trip before first use.
Ask: make the direct set configurable, or widen it for the tools that
review/watch flows need.

## 3. No user-override point for the bridge

The bridge lives in T3's extension cache (`~/.t3/caches/`), overwritten on
T3 updates. Its workarounds (OpenRouter max_tokens cap, openai-completions
eager tool loading) ship inside it and cannot be patched or disabled
durably from the pi side. Ask: a user-configurable override layer or
upstream hooks.

---

Session-name divergence between pi and T3's sidebar is tracked in
`CONTEXT.md` ("T3 Code titles vs pi session names") — not restated here.
