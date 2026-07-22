---
name: doc-cruft-hygiene
description: Audit durable artifacts — docs (plans, ADRs, designs, READMEs) and code comments — for session-cruft before finalize or merge. Use when writing, revising, or reviewing such artifacts — especially after a grill/review round or a design pivot. Cuts process provenance; keeps the durable why.
---

Rule and bright-line test live in `AGENTS.md` ("No session-cruft in artifacts"). This skill is the executable audit — pattern catalog, judgment calls, workflow. The catalog here is canonical; `AGENTS.md` illustrates the principle.

## Pattern catalog (grep, then judge each hit)

Run against the file or diff. These are *review* greps — every hit gets a verdict, nothing auto-fixed.

- Date-stamp provenance in technical prose:
  `rg -n '\b(Resolved|dropped|overridden|verified|locked|retired|amended|landed|pivoted)\b[^.]*20\d{2}-\d{2}-\d{2}' <file>`
- Session/process refs (reviewer tags, skill-round refs, fix-priority tags):
  `rg -n 'Q\d+ correction|Grill-settled|\bG\d+\b|D\d+=|fix-P\d|round-\d' <file>`
- Ticket/ADR-pointer provenance in prose:
  `rg -n '§\d+\s+(amended|superseded|updated)\s+by\s+[A-Z]+-\d+' <file>`
- Code-comment provenance (review/round/MR refs the doc greps miss):
  `rg -n '\b(per review|round \d|pass \d|fixed in !\d+|addressed in (MR-?)?\d+)\b' <file>`

## Judgment calls

- **Legitimate dates stay:** dedicated timeline/status-table fields (`| Promoted | 2026-07-20 … |`), changelog entries, ADR `Status` fields. Signal = *structure* (a field meant to hold a date) vs *prose* (a date stuck inside a technical sentence).
- **Transient sections exempt by design:** Build Notes, Task Log, "AI maintains" sections are explicitly session-scoped — leave them. But their content must not leak into durable sections (Intent, Design, ACs, Constraints). A date-stamped decision in a durable section is cruft even if the same fact legitimately lives in Build Notes.
- **A ticket/ADR ref is cruft only as provenance** ("§2 amended by AIC-3294"). A durable dependency ("Depends on ADR-013") stays.
- **Code:** `// TODO(TICKET-ID): implement X` = tracking → stays. `// per review we dropped X` = provenance → cuts. `//nolint:errcheck // legacy API` = durable reason → stays; `//nolint // round-2 skip` = session → cuts. Author-attribution comments (`// John:`, `// per <name>`) → flag for human; conventions vary by repo, don't auto-cut.

## Workflow

**Pre-write self-check** (before you call an edit done): re-read your diff. For each date, session-ref, pointer phrase, or code-comment attribution, ask "would a reader six months out understand this without the session?" If no → rewrite as the durable why and drop the marker.

**Pre-merge audit** (also exposed as `/cruft-review`): run all four greps → list hits with verdicts (cut / keep / judgment-call) → fix the cuts → re-grep to confirm zero cruft in durable sections (docs: Intent/Design/ACs/Constraints; code: all committed comments).

## Output

Per hit: `line — pattern — verdict — fix`. Group by file. End with one line: cuts applied (count) + re-grep clean (yes/no), or remaining judgment-calls listed for the human.
