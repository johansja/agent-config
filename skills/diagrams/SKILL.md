---
name: diagrams
description: Draw diagrams. Use when the user asks for a diagram, flowchart, sequence diagram, architecture diagram, ER or state diagram, or visualization, or says draw / visualize / render this.
---

Pick the first rung that holds. Stop climbing.

1. Prose, not a diagram, if only the model will read it. Diagrams in the system prompt are paid for every turn.
2. Mermaid fenced block for graph-shaped relationships: `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram`. Renders natively on GitHub; no tooling. Workhorse.
3. Hand-built `<div>` + inline SVG only when Mermaid's auto-layout fights the message: mass diagrams, cross-sections, layered before/after.

Hard rules:

- If the diagram needs a paragraph to be understood, redraw the diagram.
- No Graphviz/DOT, PlantUML, or D2. GitHub doesn't render DOT.
- Emit standard ```` ```mermaid ```` blocks; don't assume any rendering package is installed.

Vocabulary: module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality.

See `references/patterns.md` for worked examples.
