---
name: file-sweep
description: Run the periodic file sweep — scan strays, propose a filing plan, move only after approval.
---

# File Sweep

Shared procedure for multiple agents (OpenClaw, Pi). One brain, two bodies: each agent maps these steps onto its own platform abilities. This file never names tools, channels, or schedulers — the calling agent decides cadence and how the proposal reaches the human.

## Inputs (declare before scanning)

- `PARA_ROOT`: absolute path of the PARA tree. On macOS, iCloud Desktop & Documents sync has two layouts: classic (`~/Documents` symlinked into `~/Library/Mobile Documents/com~apple~CloudDocs/Documents`) and file-provider (macOS 15+; `~/Documents` is a real iCloud-managed folder whose files can be dataless/evicted until opened — check with `defaults read com.apple.finder FXICloudDriveDocuments`; materialize with `brctl download` before reading or moving). Both are iCloud-backed; declare whichever exists.
- `SWEEP_TARGETS`: additional locations to scan (typical: Downloads, Desktop; plus PARA_ROOT root-level strays)
- `AUTONOMY`: `propose-all` (default — every action needs approval) or `auto-obvious` (auto-file unambiguous items, still ask on anything else)

## Filing rules (edit over time; the procedure below stays stable)

Bucket map (relative to PARA_ROOT):

- `00 Inbox` — staging area; the only place a human dumps files without deciding anything
- `01 Projects` — active, deadline-bound work; one folder per project
- `02 Areas` — ongoing responsibilities: `Bitdeer`, `Career`, `Financial`, `Health`, `Kids/Esther`, `Kids/Ezra`, `PG`
- `03 Resources` — timeless reference: `Books`, `IDs & Certs`, `Interviews`, `Praise & Worship`, `Software Engineering`, `User Manuals`
- `04 Archives` — `Completed Projects`, `Inactive Areas` (dated subfolders only for one-off events)

Classification rules (PARA decision order — actionability, not category):

1. **ACTIVE PROCESS? → `01 Projects/<process folder>`, kept whole.** Any file needed together for an in-flight process (pension transfer application, visa application, insurance claim, loan closing, school enrollment) goes into the project folder REGARDLESS of document type — certs, forms, statements stay with their working set. PARA's test: "when you sit down to work on it, all related material is in one place, ready to go." Do NOT disassemble a working set into type buckets.
2. **Settled reference? → type rules below.** Type-filing applies only to documents with NO active process attached — things filed for occasional lookup, not imminent action.
3. **Project completion → the WHOLE project folder moves to `04 Archives`** intact. Never re-disperse a completed project's files back into type buckets — the assembled set is the historical record.
4. **In doubt between two buckets → the more actionable one.** A file used monthly in an Area outranks its type in Resources.

Type rules (apply only to files ruled out as settled reference by 1–2):

- Certificates, IDs, passports, marriage/birth certs → `03 Resources/IDs & Certs` (settled reference only — rule 1 overrides for in-flight sets)
- Bills, statements, bank, insurance, tax, pension paperwork (incl. Malaysian JPA/KWAP) → `02 Areas/Financial` (settled reference only — in-flight application sets stay whole in Projects per rule 1)
- School letters, portfolios, consent forms, medical reports → `02 Areas/Kids/<child>` (match by name: Esther, Ezra)
- Installers/archives (`.dmg`, `.pkg`, `.zip`, `.iso`) older than 30 days → TRASH candidate
- Screenshots/images older than 90 days → dated archive folder, or ASK
- Candidate resumes/CVs → the hiring repo's `candidates/<date>_<slug>/sources/` (e.g. `~/projects/k8s-interviews`), deduped against existing files first; `03 Resources/Interviews` is for interview-prep reference material only
- Re-downloadable or stale one-offs (public installers, versioned scripts, duplicate downloads, completed-travel and expired one-time-use docs) → propose DROP with reasoning
- Everything unresolved → ASK pile (never guess on ambiguity)

Naming and safety:

- Junk names (`PDF document.pdf`, `Screenshot …`, `image …`) are renamed from content (read the first page) *before* filing; never move a file you have not identified
- Move, never delete: deletion is proposal-only — for the explicit TRASH rules above and any DROP proposal; execute after approval. On an iCloud-synced target a trash **is** a deletion: it propagates to every signed-in device and the item sits in iCloud's 30-day Recently Deleted. Say that in the proposal, not after the fact
- Undo log: one line per action (timestamp, from → to) in `PARA_ROOT/00 Inbox/.sweep-log.md`
- One file, one decision: if classification needs a judgment call, it goes to the ASK pile

## Procedure

1. **Declare inputs.** Confirm `PARA_ROOT` exists; read the Filing rules; state the autonomy level. Done when: PARA_ROOT verified and autonomy stated.
2. **Create `00 Inbox`** if missing (first run only). Done when: the folder exists.
3. **Scan.** Sweep `SWEEP_TARGETS` and PARA_ROOT root-level strays only — do not walk the whole PARA tree. List every file: name, size, modified date. Skip app-private folders and anything modified in the last 48 hours. Done when: the inventory is complete.
4. **Classify.** Apply the Filing rules; split into FILE (obvious), TRASH (candidates), ASK (ambiguous), KEEP (leave alone). Done when: every scanned file is in exactly one pile.
5. **Propose.** Present a compact plan: counts + destinations per pile; ASK items individually with your best guess. Done when: the human can approve with one word.
6. **Execute on approval.** Move files (rename-before-filing applied); append every action to the undo log; trash TRASH items only if approved. Done when: undo log line count matches moves.
7. **Verify.** Re-scan targets: zero unexplained strays; log balanced. Write the report in the shape of `templates/sweep-report.md` — scoped numbers, stated exclusions, verification method and its limits. Done when: every number in the report is scoped and sums to the log.

## Reporting a sweep (the only part the human reads)

The report is a record, not a victory lap: an engineer must be able to reconcile every figure against `.sweep-log.md` and re-run the verification without asking you anything. Labelled lines, not prose paragraphs — this is read on a phone.

- **Every number carries a unit and a scope.** `44 moved`, `46 log lines`, `21 TRASH actions`, `16 files now` are four different quantities; name which. Scope is `this batch (HH:MM–HH:MM)`, `today`, or `cumulative since <date>` — a bare count borrows the nearest scope and gets read as the wrong one.
- **State the set, not just the successes:** `attempted N = moved N + failed N + excluded N`, with the exclusions named and the rule that produced them. "0 failures" over an unstated denominator is unfalsifiable.
- **Never fold test moves into the production ratio.** Report them on their own line; a failed probe must be able to lower the probe count without moving the batch count.
- **Verification names its method and its limits.** "Finder confirms" is a GUI observation, not evidence. Write `46 renames returned success; 2 of 46 spot-checked because ~/.Trash is TCC-blocked` — a population claim backed by a sample must say it is a sample.
- **Balance the report against the log before sending.** Sum the bullets and compare with `grep -c '^<date>' .sweep-log.md`. A difference is a category you forgot to name (staging moves, double-logged pending clears, the run-summary line) — name it, never round it away.
- **"Untouched" is a delta, not a number.** Write `16 → 16 files since 13:04` and scope it to the batch; a folder you filed 11 and trashed 4 from an hour earlier cannot be called untouched.
- **Carry-forward needs re-verification.** "Earlier filing stands" asserts a check nobody performed — either re-read the log and say what you saw, or write `not re-verified`.
- **No Put Back.** A raw `os.rename` into `~/.Trash` creates no Finder *Put Back* entry, so the undo log is the only recovery path — state that wherever you claim the trash is reversible.

## Case study — Pencen (the mistake that wrote these rules, Oct 2026)

The first sweep classified by document type: marriage cert + bank account → `IDs & Certs`, JPA forms → `Financial`, and proposed retiring `01 Projects/Pencen`. **Wrong.** Johan corrected it: all files belong together in `01 Projects/Pencen` — he is actively processing his late father's pension transfer application and needs the working set intact every time he sits down to it.

What this case teaches:
- "Marriage cert" is not inherently a Resource — a cert **inside an in-flight application** is Project material
- The test is not "what kind of file is this?" but "when Johan next works on this, does he need it together with the others?"
- `01 Projects/Pencen` stays whole until the application completes; then the folder archives to `04 Archives` intact
- Family cert vault (`03 Resources/IDs & Certs`) holds settled reference: `Sunny Sim Jian Ho - MyKad.pdf` stays there unless Johan says it's part of the application set

## Notes for agents

- On file-provider Macs, directory listings can show entries that fail `open`/`mv` with phantom ENOENT (encoding mismatch or dataless limbo). Retry file operations with globs (`mv ~/Downloads/Screenshot*09-01*.png …`) and materialize first (`brctl download <path>`); do not conclude a file is missing from one failed literal-path call

- **Dataless placeholders are the default state of the PARA tree on this Mac.** Expect `Resource deadlock avoided` (EDEADLK) on open/`cp`/`shasum`/`mv` and an empty-file hash from `shasum`. Fix: `brctl download "<path>"` then **poll until the dataless flag clears** (`ls -lO "$f" | grep dataless`) — usually 3–6 s, not instant. `cp` before the flag clears silently writes a 0-byte file, which then hashes as the empty-file digest and fabricates false "duplicate" conclusions. Always confirm `ls -l` size > 0 *and* the flag is gone before trusting a hash.

- **A wedged namespace is a different failure from a dataless file.** First suspicion must be **filename bytes, not filesystem damage**: macOS screenshot/recording names contain U+202F (narrow no-break space) between time and AM/PM, so a path typed by hand fails with ENOENT, `mv` reports EDEADLK, `rm -f` exits 0 while the entry survives, and `brctl download` says "doesn't exist" or "permission to view it" — all while `ls` and `find` happily list the file. Check with `python3 -c "import os;print([repr(n) for n in os.listdir(PATH)][:3])"` before concluding anything is corrupt. Build every path from `os.listdir()`/`readdir` output — never from what you see on screen or from shell expansion of a typed name.

- To act on evicted items, per file and in this order: `brctl download <exact path>`, then poll `os.lstat(p).st_flags & 0x40000000` until it clears (usually <3 s after the request, not before), then rename. Renaming a dataless file across directories returns EDEADLK; renaming it to ~/.Trash after materialization succeeds. Same-directory renames work even while dataless — useful as a non-destructive probe.

- `~/.Trash` is TCC-protected: listings and `du` return EPERM even for the user's own session. Verify a trash action by the source disappearing plus a successful `os.rename` return, not by reading `~/.Trash`.

- Clearing `00 Inbox/.trash-pending` double-logs: items already moved there earlier in the same run appear once for the move into pending and again for the clear to `~/.Trash`. Count distinct source paths, not log lines, when balancing.

- Bulk-trashing ~46 Desktop files is one approved decision, but move each into `~/.Trash` individually — `mv ~/Desktop/* ~/.Trash/` aborts the whole batch on the first EDEADLK and leaves the rest in place with no per-file record.

- This skill is repo-synced (`github.com/johansja/agent-config`); keep edits in the repo's normal review flow
- Nothing here schedules itself: the calling agent owns cadence, triggers, and the approval channel
- On corporate machines, keep personal data out of examples and confirm local IT policy allows an agent to move files before first run
