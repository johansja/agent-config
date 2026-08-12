/**
 * Tests for the auto-session-name pure helpers.
 *
 * Run with: node --test pi/auto-session-name.test.mjs
 *
 * Covers extractText(), countUserMessages(), buildConversationInput(),
 * sanitizeTitle(), and SYSTEM_PROMPT — the deterministic logic that doesn't
 * require an LLM call.
 *
 * The functions under test are imported from the real extension module via
 * jiti (same TS loader pi uses at runtime). The extension's side effects live inside its default-exported
 * function (pi.on handlers registered at call time, not import time), so
 * jiti.import is safe. Previously these helpers were inlined as copies here;
 * that let the real code drift out of sync undetected — the imports close
 * that hole.
 */

import { execSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
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
	},
});

const mod = await jiti.import("./auto-session-name.ts");
const {
	extractText,
	countUserMessages,
	buildConversationInput,
	sanitizeTitle,
	SYSTEM_PROMPT,
} = mod;

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe("extractText", () => {
	it("returns string content unchanged", () => {
		assert.equal(extractText("hello world"), "hello world");
	});

	it("returns empty string for non-array non-string content", () => {
		assert.equal(extractText(undefined), "");
		assert.equal(extractText(null), "");
		assert.equal(extractText(42), "");
		assert.equal(extractText({ foo: "bar" }), "");
	});

	it("concatenates text blocks from a content array", () => {
		const content = [
			{ type: "text", text: "first" },
			{ type: "text", text: "second" },
		];
		assert.equal(extractText(content), "first\nsecond");
	});

	it("skips non-text blocks in a content array", () => {
		const content = [
			{ type: "text", text: "keep" },
			{ type: "image", data: "base64..." },
			{ type: "toolCall", name: "bash" },
			{ type: "text", text: "this too" },
		];
		assert.equal(extractText(content), "keep\nthis too");
	});

	it("returns empty string for array with no text blocks", () => {
		const content = [
			{ type: "image", data: "base64..." },
			{ type: "toolCall", name: "bash" },
		];
		assert.equal(extractText(content), "");
	});

	it("ignores malformed parts in a content array", () => {
		const content = [
			null,
			undefined,
			"string-not-block",
			{ type: "text", text: "valid" },
			{ type: "text" }, // missing text field
		];
		assert.equal(extractText(content), "valid");
	});
});

// ---------------------------------------------------------------------------
// countUserMessages
// ---------------------------------------------------------------------------

describe("countUserMessages", () => {
	it("returns 0 for empty entries", () => {
		assert.equal(countUserMessages([]), 0);
	});

	it("returns 0 for entries with no user messages", () => {
		const entries = [
			{ type: "message", message: { role: "assistant", content: "hi" } },
			{ type: "compaction", summary: "..." },
			{ type: "model_change", provider: "openai", modelId: "gpt-5" },
		];
		assert.equal(countUserMessages(entries), 0);
	});

	it("counts only user messages, ignoring other roles and entry types", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "first" } },
			{ type: "message", message: { role: "assistant", content: "reply" } },
			{ type: "message", message: { role: "user", content: "second" } },
			{ type: "message", message: { role: "toolResult", content: "..." } },
			{ type: "session_info", name: "foo" },
			{ type: "message", message: { role: "user", content: "third" } },
		];
		assert.equal(countUserMessages(entries), 3);
	});

	it("ignores non-message entries", () => {
		const entries = [
			{ type: "thinking_level_change", thinkingLevel: "high" },
			{ type: "label", label: "checkpoint" },
			{ type: "branch_summary", summary: "..." },
		];
		assert.equal(countUserMessages(entries), 0);
	});
});

// ---------------------------------------------------------------------------
// buildConversationInput
// ---------------------------------------------------------------------------

describe("buildConversationInput", () => {
	it("returns null when there are no messages", () => {
		assert.equal(buildConversationInput([]), null);
		assert.equal(
			buildConversationInput([{ type: "compaction", summary: "..." }]),
			null,
		);
	});

	it("returns null when there is a user but no assistant message", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "help me" } },
		];
		assert.equal(buildConversationInput(entries), null);
	});

	it("returns null when there is an assistant but no user message", () => {
		const entries = [
			{ type: "message", message: { role: "assistant", content: "hi" } },
		];
		assert.equal(buildConversationInput(entries), null);
	});

	it("returns the first user and first assistant text from string content", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "fix the bug" } },
			{ type: "message", message: { role: "assistant", content: "on it" } },
		];
		assert.deepEqual(buildConversationInput(entries), {
			user: "fix the bug",
			assistant: "on it",
		});
	});

	it("uses only the first user and first assistant, ignoring later ones", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "first user" } },
			{ type: "message", message: { role: "assistant", content: "first assistant" } },
			{ type: "message", message: { role: "user", content: "second user" } },
			{ type: "message", message: { role: "assistant", content: "second assistant" } },
		];
		assert.deepEqual(buildConversationInput(entries), {
			user: "first user",
			assistant: "first assistant",
		});
	});

	it("extracts text from content-block arrays", () => {
		const entries = [
			{
				type: "message",
				message: {
					role: "user",
					content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }],
				},
			},
			{
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "hi there" }],
				},
			},
		];
		assert.deepEqual(buildConversationInput(entries), {
			user: "hello\nworld",
			assistant: "hi there",
		});
	});

	it("skips empty/whitespace-only messages and keeps scanning", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "   " } },
			{ type: "message", message: { role: "user", content: "real prompt" } },
			{ type: "message", message: { role: "assistant", content: "" } },
			{ type: "message", message: { role: "assistant", content: "real reply" } },
		];
		assert.deepEqual(buildConversationInput(entries), {
			user: "real prompt",
			assistant: "real reply",
		});
	});

	it("ignores toolResult messages when looking for user/assistant", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "run ls" } },
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "bash" }] } },
			{ type: "message", message: { role: "toolResult", content: "file1\nfile2" } },
			{ type: "message", message: { role: "assistant", content: "here are the files" } },
		];
		// First assistant has no text (only a toolCall), so we keep scanning
		// and pick up the second assistant with "here are the files".
		assert.deepEqual(buildConversationInput(entries), {
			user: "run ls",
			assistant: "here are the files",
		});
	});

	it("truncates long messages to maxPerMessage", () => {
		const longUser = "x".repeat(1000);
		const longAssistant = "y".repeat(1000);
		const entries = [
			{ type: "message", message: { role: "user", content: longUser } },
			{ type: "message", message: { role: "assistant", content: longAssistant } },
		];
		const result = buildConversationInput(entries, 100);
		assert.equal(result.user.length, 100);
		assert.equal(result.assistant.length, 100);
		assert.equal(result.user, "x".repeat(100));
		assert.equal(result.assistant, "y".repeat(100));
	});

	it("does not require assistant to come after user in entry order", () => {
		// Session branches can have any order in edge cases; we scan the whole
		// branch for the first user and first assistant independently.
		const entries = [
			{ type: "message", message: { role: "assistant", content: "reply" } },
			{ type: "message", message: { role: "user", content: "prompt" } },
		];
		assert.deepEqual(buildConversationInput(entries), {
			user: "prompt",
			assistant: "reply",
		});
	});
});

// ---------------------------------------------------------------------------
// sanitizeTitle
// ---------------------------------------------------------------------------

describe("sanitizeTitle", () => {
	it("passes through a clean short title", () => {
		assert.equal(sanitizeTitle("fix auth bug", 60), "fix auth bug");
	});

	it("strips surrounding double quotes", () => {
		assert.equal(sanitizeTitle('"fix auth bug"', 60), "fix auth bug");
	});

	it("strips surrounding single quotes", () => {
		assert.equal(sanitizeTitle("'fix auth bug'", 60), "fix auth bug");
	});

	it("strips surrounding backticks", () => {
		assert.equal(sanitizeTitle("`fix auth bug`", 60), "fix auth bug");
	});

	it("strips markdown code fences with language tag", () => {
		assert.equal(sanitizeTitle("```text\nfix auth bug\n```", 60), "fix auth bug");
	});

	it("strips code fences without language tag", () => {
		assert.equal(sanitizeTitle("```\nfix auth bug\n```", 60), "fix auth bug");
	});

	it("strips trailing period", () => {
		assert.equal(sanitizeTitle("fix auth bug.", 60), "fix auth bug");
	});

	it("strips trailing exclamation and question marks", () => {
		assert.equal(sanitizeTitle("fix auth bug!?", 60), "fix auth bug");
	});

	it("collapses internal whitespace including newlines", () => {
		assert.equal(sanitizeTitle("fix\n\n  auth   bug", 60), "fix auth bug");
	});

	it("strips guillemet quotes", () => {
		assert.equal(sanitizeTitle("«fix auth bug»", 60), "fix auth bug");
	});

	it("strips curly quotes", () => {
		assert.equal(sanitizeTitle("“fix auth bug”", 60), "fix auth bug");
	});

	it("returns empty string for whitespace-only input", () => {
		assert.equal(sanitizeTitle("   ", 60), "");
		assert.equal(sanitizeTitle("\n\n\t", 60), "");
	});

	it("returns empty string when only quotes/punctuation remain after stripping", () => {
		assert.equal(sanitizeTitle('""', 60), "");
		assert.equal(sanitizeTitle("```\n```", 60), "");
		assert.equal(sanitizeTitle("...", 60), "");
	});

	it("truncates long titles at a word boundary", () => {
		const long = "this is a very long session title that exceeds the max chars limit";
		const result = sanitizeTitle(long, 30);
		assert.ok(result.length <= 30, `expected <= 30 chars, got ${result.length}`);
		assert.ok(!result.endsWith(" "), "should not end with a space");
		// Should be cut at a word boundary somewhere in the first 30 chars
		assert.ok(result.length > 15, "should prefer word-boundary cut over hard cut");
	});

	it("hard-truncates when no word boundary in the first half", () => {
		// One long word with no spaces — falls back to hard cut at maxChars
		const longWord = "abcdefghijklmnopqrstuvwxyz0123456789";
		const result = sanitizeTitle(longWord, 20);
		assert.equal(result.length, 20);
		assert.equal(result, longWord.slice(0, 20));
	});

	it("preserves internal capitalization (proper nouns, file paths)", () => {
		assert.equal(sanitizeTitle("Refactor AuthModule.ts", 60), "Refactor AuthModule.ts");
	});

	it("preserves internal punctuation like slashes and dots in paths", () => {
		// Only trailing sentence punctuation is stripped; internal . and / survive
		assert.equal(sanitizeTitle("Fix src/auth/login.ts", 60), "Fix src/auth/login.ts");
	});

	it("handles a typical verbose model response", () => {
		// Models sometimes add a leading label despite instructions
		assert.equal(sanitizeTitle("Title: Fix auth bug", 60), "Title: Fix auth bug");
	});

	it("handles a multi-line model response by collapsing to one line", () => {
		const result = sanitizeTitle("fix auth\nbug in login flow", 60);
		assert.equal(result, "fix auth bug in login flow");
	});

	it("default maxChars of 60 fits a typical 3-6 word title unchanged", () => {
		assert.equal(sanitizeTitle("refactor authentication middleware", 60), "refactor authentication middleware");
	});

	// ----------------------------------------------------------------------
	// Thinking-model reasoning blocks (think tags emitted inline in text by
	// some providers like Minimax/DeepSeek/Qwen)
	// ----------------------------------------------------------------------

	it("strips a closed think block and keeps the answer", () => {
		const raw = "<" + "think>" + "The user wants a title" + "<" + "/think>" + "fix login bug";
		assert.equal(sanitizeTitle(raw, 60), "fix login bug");
	});

	it("keeps only what follows the LAST think-close when multiple blocks present", () => {
		const raw = "<" + "think>" + "first" + "<" + "/think>" + "attempt one" + "<" + "think>" + "second" + "<" + "/think>" + "final answer";
		assert.equal(sanitizeTitle(raw, 60), "final answer");
	});

	it("returns empty string when think block is opened but never closed", () => {
		// Model truncated mid-reasoning — caller should skip naming
		const raw = "<" + "think>" + "The user is asking me to";
		assert.equal(sanitizeTitle(raw, 60), "");
	});

	it("returns empty string when only a bare open think tag is present", () => {
		const raw = "<" + "think>";
		assert.equal(sanitizeTitle(raw, 60), "");
	});

	it("does not treat the bare word 'think' as a tag", () => {
		// No angle brackets — not a think tag, passes through
		assert.equal(sanitizeTitle("think about auth", 60), "think about auth");
	});

	it("applies normal sanitization to the answer after a think block", () => {
		// Answer has quotes and trailing punctuation — both stripped
		const raw = "<" + "think>" + "reasoning here" + "<" + "/think>" + '"Fix login bug."';
		assert.equal(sanitizeTitle(raw, 60), "Fix login bug");
	});

	it("truncates a long answer following a think block at a word boundary", () => {
		const answer = "this is a very long session title that exceeds the max chars limit";
		const raw = "<" + "think>" + "reasoning" + "<" + "/think>" + answer;
		const result = sanitizeTitle(raw, 30);
		assert.ok(result.length <= 30, `expected <= 30 chars, got ${result.length}`);
		assert.ok(!result.includes("reasoning"), "reasoning must not leak into result");
	});

	it("passes through clean input with no think tags unchanged", () => {
		// GLM-5.2 path: no think tags, existing behavior preserved
		assert.equal(sanitizeTitle("python hello world script", 60), "python hello world script");
	});

	// ------------------------------------------------------------------
	// Edge cases not covered above (boundary, case-sensitivity, regex)
	// ------------------------------------------------------------------

	it("returns empty string for empty input", () => {
		assert.equal(sanitizeTitle("", 60), "");
	});

	it("does not truncate a title whose length exactly equals maxChars", () => {
		// The > in `length > maxChars` is strict, so an exact-length title
		// passes through unchanged — guards against an off-by-one cut.
		const title = "fix the authentication bug now"; // 30 chars
		assert.equal(title.length, 30);
		assert.equal(sanitizeTitle(title, 30), title);
	});

	it("discards any text preceding the last think-close, keeping only the final answer", () => {
		// The code slices from the LAST </think> onward, so even valid answer
		// text emitted before a think block ("early answer") is dropped.
		const raw = "early answer" + "<" + "think>" + "reasoning" + "<" + "/think>" + "final answer";
		assert.equal(sanitizeTitle(raw, 60), "final answer");
	});

	it("does not strip uppercase think tags (matching is case-sensitive)", () => {
		// Tag literals are lowercase <think></think>; <THINK> is not
		// recognized, so the whole string passes through unchanged.
		const raw = "<THINK>reasoning</THINK>actual answer";
		assert.equal(sanitizeTitle(raw, 60), raw);
	});

	it("strips inline code fences that have no surrounding newlines", () => {
		// The fence regexes use \s*\n? (newline optional), so a single-line
		// fence like ```text fix bug``` is still stripped.
		assert.equal(sanitizeTitle("```text fix auth bug```", 60), "fix auth bug");
	});

	it("hard-truncates when the only word boundary falls in the first half", () => {
		// 24 chars, single space at index 4, maxChars 20. Because 4 <= 10
		// (half of maxChars), the word-boundary branch is skipped in favor
		// of a hard cut at maxChars — distinct from the no-spaces-anywhere
		// case covered above.
		const raw = "aaaa " + "b".repeat(19); // 24 chars, space at index 4
		const result = sanitizeTitle(raw, 20);
		assert.equal(result.length, 20);
		assert.equal(result, raw.slice(0, 20));
	});
});

// ---------------------------------------------------------------------------
// System prompt content (imported, not inlined — drift can't hide here)
// ---------------------------------------------------------------------------

describe("system prompt content", () => {
	it("asks for 3 to 6 words", () => {
		assert.match(SYSTEM_PROMPT, /3 to 6 words/);
	});

	it("forbids quotes and trailing punctuation", () => {
		assert.match(SYSTEM_PROMPT, /No quotes, no trailing punctuation/);
	});

	it("requires a single title reply", () => {
		assert.match(SYSTEM_PROMPT, /Reply with the title only/);
	});
});
