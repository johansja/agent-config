/**
 * read_pdf tool — pi's built-in read accepts text and images, not PDF.
 * Implements the skills/read-pdf extraction chain deterministically:
 * pdftotext → Ghostscript → throwaway pypdf venv, with page ranges, a char
 * cap for context safety, and scanned/encrypted reporting surfaced to the
 * user — never silent OCR, never silent decryption failure.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

const VENV_DIR = "/tmp/pe";
const MAX_CHARS = 48_000;
const MIN_CHARS_PER_PAGE = 100;

interface PageRange {
	first?: number;
	last?: number;
}

/** CLI args per extractor. first/last are 1-based, inclusive. */
export function extractorArgs(extractor: "pdftotext" | "gs", file: string, { first, last }: PageRange): string[] {
	if (extractor === "pdftotext") {
		const range: string[] = [];
		if (first) range.push("-f", String(first));
		if (last) range.push("-l", String(last));
		return ["-layout", "-enc", "UTF-8", ...range, file, "-"];
	}
	const range: string[] = [];
	if (first) range.push(`-dFirstPage=${first}`);
	if (last) range.push(`-dLastPage=${last}`);
	return ["-sDEVICE=txtwrite", "-dNOPAUSE", "-dBATCH", "-dQUIET", ...range, "-sOutputFile=-", file];
}

/** pdftotext separates pages with form feeds. */
export function pageCountFromFormFeeds(text: string): number {
	return (text.match(/\f/g) ?? []).length + 1;
}

export function isLikelyScanned(text: string, pages: number): boolean {
	return text.trim().length < MIN_CHARS_PER_PAGE * pages;
}

export function truncate(text: string, max = MAX_CHARS): { text: string; truncated: boolean } {
	if (text.length <= max) return { text, truncated: false };
	return { text: text.slice(0, max), truncated: true };
}

function scannedReport(chars: number, pages: number, file: string): string {
	return [
		`Text extraction returned ~${chars} chars from ${pages} page(s) — this PDF looks scanned or image-only.`,
		"Offer the user these options and wait for their pick:",
		`(a) render pages to PNG and read them with the vision-capable read tool: gs -sDEVICE=png16m -r150 -dFirstPage=N -dLastPage=M -sOutputFile=page-%d.png "${file}"`,
		"(b) OCR with tesseract if installed",
		"(c) a different page range",
		"Do NOT OCR silently.",
	].join("\n");
}

async function hasBinary(bin: string): Promise<boolean> {
	try {
		await execFileAsync("which", [bin]);
		return true;
	} catch {
		return false;
	}
}

async function ensurePypdf(): Promise<string> {
	const python = path.join(VENV_DIR, "bin", "python3");
	if (!fs.existsSync(python)) {
		await execFileAsync("python3", ["-m", "venv", VENV_DIR]);
		await execFileAsync(path.join(VENV_DIR, "bin", "pip"), ["install", "-q", "pypdf"]);
	}
	return python;
}

/** python -c reads argv after the script: [1]=file [2]=first [3]=last [4]=password */
const PYPDF_SCRIPT = [
	"import sys",
	"from pypdf import PdfReader",
	"path, first, last, password = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]",
	"r = PdfReader(path)",
	"if r.is_encrypted:",
	"    if not password:",
	"        print('ENCRYPTED')",
	"        sys.exit(0)",
	"    r.decrypt(password)",
	"pages = r.pages",
	"total = len(pages)",
	"f = max(1, int(first)) if first else 1",
	"l = min(total, int(last)) if last else total",
	"print(f'PAGES {total} {f} {l}')",
	"print('\\n\\n'.join((p.extract_text() or '') for p in pages[f-1:l]))",
].join("\n");

interface Extracted {
	text: string;
	extractor: "pdftotext" | "gs" | "pypdf";
	/** Pages examined for the scanned check; 1 means "unknown" (threshold sits at the absolute floor). */
	pages: number;
	totalPages?: number;
}

async function extract(file: string, range: PageRange, password?: string): Promise<Extracted> {
	if (!password && (await hasBinary("pdftotext"))) {
		try {
			const { stdout } = await execFileAsync("pdftotext", extractorArgs("pdftotext", file, range), { maxBuffer: 64 * 1024 * 1024 });
			return { text: stdout, extractor: "pdftotext", pages: pageCountFromFormFeeds(stdout) };
		} catch {
			// fall through to the next extractor — including on password errors
		}
	}
	if (!password && (await hasBinary("gs"))) {
		try {
			const { stdout } = await execFileAsync("gs", extractorArgs("gs", file, range), { maxBuffer: 64 * 1024 * 1024 });
			return { text: stdout, extractor: "gs", pages: range.first && range.last ? range.last - range.first + 1 : 1 };
		} catch {
			// pypdf reports ENCRYPTED itself
		}
	}
	const python = await ensurePypdf();
	const { stdout } = await execFileAsync(
		python,
		["-c", PYPDF_SCRIPT, file, range.first ? String(range.first) : "", range.last ? String(range.last) : "", password ?? ""],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	if (stdout.startsWith("ENCRYPTED")) throw new EncryptedPdfError();
	const pageLine = stdout.match(/^PAGES (\d+) (\d+) (\d+)\n/);
	const totalPages = pageLine ? Number(pageLine[1]) : undefined;
	const f = pageLine ? Number(pageLine[2]) : 1;
	const l = pageLine ? Number(pageLine[3]) : 1;
	return {
		text: pageLine ? stdout.slice(pageLine[0].length) : stdout,
		extractor: "pypdf",
		pages: l - f + 1,
		totalPages,
	};
}

class EncryptedPdfError extends Error {}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "read_pdf",
		label: "Read PDF",
		description:
			"Extract text from a PDF file (the built-in read tool does not support PDFs). Uses the first available of pdftotext, Ghostscript, or a throwaway pypdf venv. Pass first_page/last_page for long documents. Scanned or image-only PDFs are reported with options, never OCRed silently. For encrypted PDFs, pass the user-supplied password.",
		promptGuidelines: [
			"Pass first_page/last_page to read_pdf for long PDFs instead of extracting the whole document.",
			"When read_pdf reports a scanned/image-only or encrypted PDF, present the options to the user and wait for their pick — do not OCR or decrypt silently.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "Path to the PDF file (absolute, or relative to the working directory)." }),
			first_page: Type.Optional(Type.Number({ description: "First page to extract, 1-based inclusive." })),
			last_page: Type.Optional(Type.Number({ description: "Last page to extract, 1-based inclusive." })),
			password: Type.Optional(Type.String({ description: "Password for an encrypted PDF (ask the user)." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = (ctx as { cwd?: string } | undefined)?.cwd ?? process.cwd();
			const file = path.resolve(cwd, params.path);
			const fail = (text: string) => ({ content: [{ type: "text" as const, text }] });

			if (!fs.existsSync(file)) return fail(`No such file: ${file}`);
			if (path.extname(file).toLowerCase() !== ".pdf") return fail(`Not a PDF file: ${file}`);

			const first = params.first_page === undefined ? undefined : Math.max(1, Math.floor(params.first_page));
			const last = params.last_page === undefined ? undefined : Math.floor(params.last_page);
			if (first && last && last < first) return fail(`last_page (${last}) must be ≥ first_page (${first}).`);

			let result: Extracted;
			try {
				result = await extract(file, { first, last }, params.password);
			} catch (err) {
				if (err instanceof EncryptedPdfError) {
					return fail("This PDF is encrypted. Ask the user for the password, then call read_pdf again with the password argument.");
				}
				return fail(`All extractors failed for ${file}: ${(err as Error)?.message ?? err}. Last resort: install poppler (pdftotext) or Ghostscript.`);
			}

			const chars = result.text.trim().length;
			if (isLikelyScanned(result.text, result.pages)) {
				return fail(scannedReport(chars, result.pages, file));
			}

			const { text, truncated } = truncate(result.text);
			const rangeNote = result.totalPages
				? `pages ${first ?? 1}-${last ?? result.totalPages} of ${result.totalPages}`
				: first || last
					? `pages ${first ?? 1}-${last ?? "?"}`
					: `${result.pages} page(s)`;
			const header = `[via ${result.extractor} · ${rangeNote} · ${chars.toLocaleString()} chars${truncated ? ` · truncated at ${MAX_CHARS} — narrow first_page/last_page` : ""}]`;
			return { content: [{ type: "text" as const, text: `${header}\n\n${text}` }] };
		},
	});
}
