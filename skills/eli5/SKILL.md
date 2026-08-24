---
name: eli5
description: Explain any topic to a beginner who has no prior context — a concept, a tradeoff, an incident, or how a piece of code works — and answer as one self-contained visual HTML artifact (large visuals, minimal copy). Use when the user says "explain like I'm five" or wants a fast visual on-ramp before diving into a topic, tradeoff, incident, or unfamiliar module.
---

# eli5

Explain the topic to an intelligent beginner who knows nothing about it. Preserve the real mechanism — never swap it for a cute metaphor or baby talk. Define only the minimum prerequisites the reader needs; assume intelligence, not background.

## When to use

- "explain like I'm five" / ELI5 / "explain X simply"
- Before touching unfamiliar code: "how does this module work"
- Before re-litigating a decision: "why did we make this tradeoff"
- Before reading a postmortem: "what caused this incident"
- Anything where they want the on-ramp picture, not the full technical answer

## Output

One self-contained HTML artifact — large visuals, minimal copy. Prefer diagrams and illustrations over paragraphs. Write it to the current directory as `eli5-{topic-slug}.html`, then open it:

```
Bash(open eli5-{topic-slug}.html)
```

Structure the artifact around four beats:
1. The problem the idea solves (why it exists)
2. The mechanism — what actually happens, step by step
3. The prerequisite concepts, defined inline — and nothing else
4. One thing the reader should now be able to predict or do

## Rules

- Keep the mechanism, define the prerequisites. A weak simplification replaces the mechanism with a metaphor; a useful one keeps the mechanism and defines only what's missing.
- Topic is about the current codebase? Read the actual code and docs first; explain what really happens, not what the names suggest.
- It's a pre-step, not the answer: aim for the whiteboard sketch before the diff, not the postmortem in prose.
- One artifact per request. Don't produce a second "for another view".