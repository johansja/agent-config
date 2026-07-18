# Diagram Patterns

## Mermaid graph — the workhorse

Use `flowchart` or `graph` for "X calls Y calls Z." Style with `classDef` to color leakage edges red.

    ```mermaid
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
    ```

`sequenceDiagram` for "before: 6 round-trips; after: 1."

## Hand-built SVG — when Mermaid's layout fights you

- Boxes-and-arrows: `<div>`s with borders, arrows as inline SVG `<line>`/`<path>` positioned absolutely. For "after = one thick-bordered deep module, internals greyed."
- Cross-section: horizontal bands (`h-12 border-l-4`) for layered shallowness. Before: 6 thin layers. After: 1 thick band.
- Mass diagram: two rectangles per module (interface vs implementation). Shallow = equal heights. Deep = short interface, tall implementation.
- Call-graph collapse: before = nested box tree. After = one box, internal calls faded.

## Style

One accent (emerald or indigo) + red for leakage + amber for warnings. Diagrams ~320px tall. `text-xs uppercase tracking-wider` for module labels. Lean editorial, not corporate-dashboard.
