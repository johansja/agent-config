---
description: Pre-merge session-cruft audit. Runs cruft-hygiene over a file or MR diff; apply cuts, defer judgment-calls. Use before merging docs that touch plans, ADRs, designs, or READMEs.
argument-hint: "<file|mr>"
---

Load `cruft-hygiene` and run its pre-merge audit on **$1**. Apply `cut` verdicts; list `keep`/`judgment-call` for the human. Do not commit — leave the working tree dirty.
