/**
 * Tests for read-pdf-tool.ts.
 *
 * Run with: node --test pi/read-pdf-tool.test.mjs
 *
 * Pure helpers (extractorArgs, pageCountFromFormFeeds, isLikelyScanned,
 * truncate) are imported via pi's jiti. The integration suite runs the real
 * extraction chain against a fixture PDF; it needs whichever of `gs` or
 * `pdftotext` is on PATH and skips when neither is.
 */

import { execSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Resolve the pi install root: PI_ROOT env override, else npm global root.
const PI_ROOT = process.env.PI_ROOT
	|| path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
if (!fs.existsSync(PI_ROOT)) {
	throw new Error(`pi-coding-agent not found at ${PI_ROOT}. Set PI_ROOT to its install path.`);
}

const { createJiti } = await import(path.join(PI_ROOT, "node_modules/jiti/lib/jiti.mjs"));
const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${PI_ROOT}/dist/index.js`,
		"@earendil-works/pi-ai": `${PI_ROOT}/node_modules/@earendil-works/pi-ai/dist/index.js`,
		"typebox": `${PI_ROOT}/node_modules/typebox/build/index.mjs`,
	},
});

const mod = await jiti.import("./read-pdf-tool.ts");
const { extractorArgs, pageCountFromFormFeeds, isLikelyScanned, truncate } = mod;

// ---------------------------------------------------------------------------
// extractorArgs

describe("extractorArgs", () => {
	it("pdftotext without range", () => {
		assert.deepEqual(extractorArgs("pdftotext", "/a/b.pdf", {}), ["-layout", "-enc", "UTF-8", "/a/b.pdf", "-"]);
	});

	it("pdftotext with range", () => {
		assert.deepEqual(extractorArgs("pdftotext", "/a/b.pdf", { first: 3, last: 7 }), ["-layout", "-enc", "UTF-8", "-f", "3", "-l", "7", "/a/b.pdf", "-"]);
	});

	it("gs without range", () => {
		assert.deepEqual(extractorArgs("gs", "/a/b.pdf", {}), ["-sDEVICE=txtwrite", "-dNOPAUSE", "-dBATCH", "-dQUIET", "-sOutputFile=-", "/a/b.pdf"]);
	});

	it("gs with range", () => {
		assert.deepEqual(extractorArgs("gs", "/a/b.pdf", { first: 2, last: 4 }), ["-sDEVICE=txtwrite", "-dNOPAUSE", "-dBATCH", "-dQUIET", "-dFirstPage=2", "-dLastPage=4", "-sOutputFile=-", "/a/b.pdf"]);
	});
});

// ---------------------------------------------------------------------------
// pageCountFromFormFeeds / isLikelyScanned / truncate

describe("pageCountFromFormFeeds", () => {
	it("counts form-feed separators", () => {
		assert.equal(pageCountFromFormFeeds("abc"), 1);
		assert.equal(pageCountFromFormFeeds("a\fb\fc"), 3);
	});
});

describe("isLikelyScanned", () => {
	it("flags under ~100 chars per page", () => {
		assert.equal(isLikelyScanned("x".repeat(399), 4), true);
	});

	it("passes normal extraction", () => {
		assert.equal(isLikelyScanned("x".repeat(400), 4), false);
	});
});

describe("truncate", () => {
	it("returns input under the cap", () => {
		assert.deepEqual(truncate("abc", 10), { text: "abc", truncated: false });
	});

	it("slices over the cap and reports it", () => {
		assert.deepEqual(truncate("abcdef", 3), { text: "abc", truncated: true });
	});
});

// ---------------------------------------------------------------------------
// Integration: real chain against a fixture PDF

const makePdf = (text) => `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${text.length + 27}>>stream
BT /F1 12 Tf 100 700 Td (${text}) Tj ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
`;

const LONG_TEXT = "hello pdf world — this fixture page carries more than one hundred characters of real text so the scanned-detection heuristic lets it through.";

const hasCli = (bin) => {
	try {
		execSync(`which ${bin}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

describe("integration: execute() against the real chain", { skip: !hasCli("gs") && !hasCli("pdftotext") }, () => {
	// Capture the tool definition by driving the default export with a fake pi.
	let toolDef;
	const fakePi = { registerTool: (def) => (toolDef = def) };
	mod.default(fakePi);

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "read-pdf-test-"));
	const fixture = path.join(dir, "fixture.pdf");
	fs.writeFileSync(fixture, makePdf(LONG_TEXT));

	it("registers a read_pdf tool with the skill's guardrails upfront", () => {
		assert.equal(toolDef.name, "read_pdf");
		assert.match(toolDef.description, /never OCRed silently/);
	});

	it("extracts fixture text via the first extractor on PATH", async () => {
		const result = await toolDef.execute("t", { path: fixture }, undefined, undefined, { cwd: dir });
		const text = result.content[0].text;
		assert.match(text, /hello pdf world/);
		assert.match(text, /^\[via (pdftotext|gs|pypdf)/);
	});

	it("reports a near-textless page as scanned instead of OCRing silently", async () => {
		const tiny = path.join(dir, "tiny.pdf");
		fs.writeFileSync(tiny, makePdf("hi"));
		const result = await toolDef.execute("t", { path: tiny }, undefined, undefined, { cwd: dir });
		const text = result.content[0].text;
		assert.match(text, /looks scanned or image-only/);
		assert.match(text, /Do NOT OCR silently/);
	});

	it("rejects last_page < first_page without spawning", async () => {
		const result = await toolDef.execute("t", { path: fixture, first_page: 5, last_page: 2 }, undefined, undefined, { cwd: dir });
		assert.match(result.content[0].text, /must be ≥/);
	});

	it("reports non-PDF inputs", async () => {
		const txt = path.join(dir, "note.txt");
		fs.writeFileSync(txt, "hello");
		const result = await toolDef.execute("t", { path: txt }, undefined, undefined, { cwd: dir });
		assert.match(result.content[0].text, /Not a PDF file/);
	});
});
