---
name: diagrams
description: Draw diagrams. Use when the user asks for a diagram, flowchart, sequence diagram, architecture diagram, ER or state diagram, or visualization, or says draw / visualize / render this.
---

Pick the first rung that holds. Stop climbing.

1. Prose, not a diagram, if only the model will read it. Diagrams in the system prompt are paid for every turn.
2. Mermaid fenced block for graph-shaped relationships (`flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram`). Renders natively on GitHub; assume no other rendering package. No Graphviz/DOT/PlantUML/D2.
3. Hand-built `<div>` + inline SVG only when Mermaid's auto-layout fights the message: mass diagrams, cross-sections, layered before/after.

Hard rule: if the diagram needs a paragraph to be understood, redraw it.

Vocabulary from `/skill:codebase-design`. See `references/patterns.md` for worked examples.
