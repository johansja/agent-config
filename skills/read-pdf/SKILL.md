---
name: read-pdf
description: Extract text from PDF files. Use when the user asks to read, extract, quote, search, or summarize a PDF, when the read tool refuses a .pdf, or when a PDF source needs to become text for analysis. Covers native CLI, Python venv fallback, page ranges, encrypted PDFs, and scanned/image-only detection.
---

The `read` tool accepts text and images, not PDF. Extract text first, then read or paste the result. Try the fastest available extractor; fall through to a universal Python fallback. Every step is host-portable — no `brew` required.

## Chain (try in order)

1. **`pdftotext` (poppler) if on PATH** — best quality for tables/columns:
   `pdftotext -layout -enc UTF-8 -f FIRST -l LAST file.pdf -`
   (`-layout` preserves columns/tables; drop it for reading-order prose.)
2. **`gs` (Ghostscript) if on PATH** — fast, offline, decent for prose:
   `gs -sDEVICE=txtwrite -dNOPAUSE -dBATCH -dQUIET -dFirstPage=FIRST -dLastPage=LAST -sOutputFile=- file.pdf`
3. **Throwaway venv (universal Python 3 fallback)** — pypdf is pure-Python, no compiler, sidesteps PEP 668:
   ```
   python3 -m venv /tmp/pe
   /tmp/pe/bin/pip install -q pypdf
   /tmp/pe/bin/python3 -c "import pypdf,sys; r=pypdf.PdfReader(sys.argv[1]); print('\n\n'.join(p.extract_text() or '' for p in r.pages))" file.pdf
   ```
   For a page range, slice `r.pages[FIRST-1:LAST]`.

Reuse `/tmp/pe` across calls in a session; recreate if removed.

## Page ranges

Long PDFs blow context. Pass `-f/-l` (pdftotext), `-dFirstPage/-dLastPage` (gs), or slice `r.pages` (pypdf) — never dump the whole file. Default to the pages the question needs; expand only if asked.

## Scanned / image-only — surface, don't OCR silently

After extraction, check yield. If the result is empty or under ~100 chars per page extracted, **stop and report**:

> Text extraction returned ~N chars from P pages — this PDF looks scanned or image-only. Options: (a) render pages to PNG and read via the vision-capable read tool, (b) OCR with `tesseract` if installed, (c) try a different page range. Which?

Execute the user's pick; do not auto-fallback.

Render for option (a): `gs -sDEVICE=png16m -r150 -dFirstPage=N -dLastPage=M -sOutputFile=page-%d.png file.pdf`, then read the PNGs.

## Encrypted PDFs

If extraction errors with encryption/permissions, retry with pypdf and a user-supplied password: `r.decrypt(PW)`. If the user doesn't know the password, report it — don't brute-force.

## Optional quality upgrade

`brew install poppler` unlocks step 1 (`pdftotext -layout`) — meaningfully better for multi-column and tabular PDFs. Not required for portability; pypdf and gs cover text-primary extraction.
