---
name: file-sweep
description: Run a periodic file cleanup sweep — scan Inbox/Downloads/Desktop strays, classify against a PARA tree, propose a filing plan, and move files only after approval. Use when the user mentions file organization, cleanup, filing, tidying files, or the weekly sweep.
---

# File Sweep

Shared procedure for multiple agents (OpenClaw, Pi). One brain, two bodies: each agent maps these steps onto its own platform abilities. This file never names tools, channels, or schedulers — the calling agent decides cadence and how the proposal reaches the human.

## Inputs (declare before scanning)

- `PARA_ROOT`: absolute path of the PARA tree (macOS default: `~/Library/Mobile Documents/com~apple~CloudDocs/Documents`)
- `SWEEP_TARGETS`: additional locations to scan (typical: Downloads, Desktop; plus PARA_ROOT root-level strays)
- `AUTONOMY`: `propose-all` (default — every action needs approval) or `auto-obvious` (auto-file unambiguous items, still ask on anything else)

## Filing rules (edit over time; the procedure below stays stable)

Bucket map (relative to PARA_ROOT):

- `00 Inbox` — staging area; the only place a human dumps files without deciding anything
- `01 Projects` — active, deadline-bound work; one folder per project
- `02 Areas` — ongoing responsibilities: `Bitdeer`, `Career`, `Financial`, `Health`, `Kids/Esther`, `Kids/Ezra`, `PG`
- `03 Resources` — timeless reference: `Books`, `IDs & Certs`, `Interviews`, `Praise & Worship`, `Software Engineering`, `User Manuals`
- `04 Archives` — `Completed Projects`, `Inactive Areas` (dated subfolders only for one-off events)

Classification rules:

- Certificates, IDs, passports, marriage/birth certs → `03 Resources/IDs & Certs`
- Bills, statements, bank, insurance, tax, pension paperwork (incl. Malaysian JPA/KWAP) → `02 Areas/Financial`
- School letters, portfolios, consent forms, medical reports → `02 Areas/Kids/<child>` (match by name: Esther, Ezra)
- Installers/archives (`.dmg`, `.pkg`, `.zip`, `.iso`) older than 30 days → TRASH candidate
- Screenshots/images older than 90 days → dated archive folder, or ASK
- Everything unresolved → ASK pile (never guess on ambiguity)

Naming and safety:

- Junk names (`PDF document.pdf`, `Screenshot …`, `image …`) are renamed from content (read the first page) *before* filing; never move a file you have not identified
- Move, never delete: deletion is proposal-only, and only for the explicit TRASH rules above; execute after approval
- Undo log: one line per action (timestamp, from → to) in `PARA_ROOT/00 Inbox/.sweep-log.md`
- One file, one decision: if classification needs a judgment call, it goes to the ASK pile

## Procedure

1. **Declare inputs.** Confirm `PARA_ROOT` exists; read the Filing rules; state the autonomy level. Done when: PARA_ROOT verified and autonomy stated.
2. **Create `00 Inbox`** if missing (first run only). Done when: the folder exists.
3. **Scan.** Sweep `SWEEP_TARGETS` and PARA_ROOT root-level strays only — do not walk the whole PARA tree. List every file: name, size, modified date. Skip app-private folders and anything modified in the last 48 hours. Done when: the inventory is complete.
4. **Classify.** Apply the Filing rules; split into FILE (obvious), TRASH (candidates), ASK (ambiguous), KEEP (leave alone). Done when: every scanned file is in exactly one pile.
5. **Propose.** Present a compact plan: counts + destinations per pile; ASK items individually with your best guess. Done when: the human can approve with one word.
6. **Execute on approval.** Move files (rename-before-filing applied); append every action to the undo log; trash TRASH items only if approved. Done when: undo log line count matches moves.
7. **Verify.** Re-scan targets: zero unexplained strays; log balanced. Report: N filed, M trashed, K asked. Done when: report delivered and log saved.

## First-run backlog (example: PARA_ROOT = iCloud Documents, Mini)

One-time decisions to propose on the first sweep:

- `01 Projects/Pencen` holds static reference docs, not project work — propose: certs → `03 Resources/IDs & Certs`, bank/pension docs → `02 Areas/Financial`, then retire the folder (or keep as `02 Areas/Financial/Pencen`)
- Root app folders (`Cline`, `MuseScore4`, `Zoom`) → propose a home (e.g. `03 Resources/Software Engineering/Tools/`) or whitelist them from future sweeps
- `PDF.js viewer.pdf` at the iCloud root → identify, file or trash
- `02 Areas/Kids`: rename the two `PDF document.pdf` files by content, then file into `Kids/Esther` or `Kids/Ezra`

## Notes for agents

- This skill is repo-synced (`github.com/johansja/agent-config`); keep edits in the repo's normal review flow
- Nothing here schedules itself: the calling agent owns cadence, triggers, and the approval channel
- On corporate machines, keep personal data out of examples and confirm local IT policy allows an agent to move files before first run
