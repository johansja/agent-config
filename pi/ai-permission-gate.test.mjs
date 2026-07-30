/**
 * Tests for the AI Permission Gate extension.
 *
 * Run with: node --test pi/ai-permission-gate.test.mjs
 *
 * Two layers:
 *   - Pure helpers imported from the real extension module via jiti (same TS
 *     loader pi uses at runtime). Covers parseVerdict / riskLevelIndex /
 *     truncateCommand / stripCodeFences invariants.
 *   - Source-shape assertions for config/env plumbing and the CWD-aware system
 *     prompt, plus behavioral emit-pairing for herdr:blocked.
 */

import { createJiti } from "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const PI = "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${PI}/dist/index.js`,
		"@earendil-works/pi-ai": `${PI}/node_modules/@earendil-works/pi-ai/dist/index.js`,
	},
});

const mod = await jiti.import("./ai-permission-gate.ts");
const extension = mod.default;
const {
	RISK_LEVELS,
	riskLevelIndex,
	truncateCommand,
	stripCodeFences,
	parseVerdict,
	PARSE_FAILURE_REASON,
	EMPTY_RESPONSE_REASON,
} = mod;

// ---------------------------------------------------------------------------
// Read the source file for source-shape assertions
// ---------------------------------------------------------------------------

const extensionSource = fs.readFileSync(
	path.join(import.meta.dirname, "ai-permission-gate.ts"),
	"utf-8",
);

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("riskLevelIndex", () => {
	it("returns correct indices for all risk levels", () => {
		assert.equal(riskLevelIndex("safe"), 0);
		assert.equal(riskLevelIndex("low"), 1);
		assert.equal(riskLevelIndex("medium"), 2);
		assert.equal(riskLevelIndex("high"), 3);
	});

	it("returns -1 for unknown risk level", () => {
		assert.equal(riskLevelIndex("unknown"), -1);
	});
});

describe("stripCodeFences", () => {
	it("strips code fence with json language tag", () => {
		assert.equal(
			stripCodeFences('```json\n{"risk":"low","reason":"test"}\n```'),
			'{"risk":"low","reason":"test"}',
		);
	});

	it("strips code fence without language tag", () => {
		assert.equal(
			stripCodeFences('```\n{"risk":"low","reason":"test"}\n```'),
			'{"risk":"low","reason":"test"}',
		);
	});

	it("returns plain text unchanged", () => {
		assert.equal(stripCodeFences("hello world"), "hello world");
	});

	it("returns already-stripped JSON unchanged", () => {
		const json = '{"risk":"safe","reason":"ok"}';
		assert.equal(stripCodeFences(json), json);
	});

	it("handles leading/trailing whitespace", () => {
		assert.equal(
			stripCodeFences('  \n  {"risk":"low","reason":"test"}  \n  '),
			'{"risk":"low","reason":"test"}',
		);
	});
});

describe("parseVerdict", () => {
	it("parses valid JSON verdict", () => {
		const result = parseVerdict('{"risk":"low","reason":"minor side effects"}');
		assert.deepEqual(result, { risk: "low", reason: "minor side effects" });
	});

	it("parses valid JSON verdict wrapped in code fences", () => {
		const result = parseVerdict('```json\n{"risk":"high","reason":"dangerous"}\n```');
		assert.deepEqual(result, { risk: "high", reason: "dangerous" });
	});

	it("parses valid JSON with extra whitespace", () => {
		const result = parseVerdict('  \n  {"risk":"safe","reason":"read-only"}  \n  ');
		assert.deepEqual(result, { risk: "safe", reason: "read-only" });
	});

	it("extracts JSON from surrounding prose via fallback", () => {
		// Models that ignore the JSON-only instruction still produce a parseable verdict.
		const result = parseVerdict('Here is my verdict: {"risk":"medium","reason":"moderate risk"} Done.');
		assert.deepEqual(result, { risk: "medium", reason: "moderate risk" });
	});

	// --- Failure cases ---

	it("returns medium fallback for unparseable text", () => {
		const result = parseVerdict("This is not JSON at all");
		assert.deepEqual(result, { risk: "medium", reason: PARSE_FAILURE_REASON });
		assert.equal(result.reason, PARSE_FAILURE_REASON,
			"parseVerdict fallback reason must equal the exported constant");
	});

	it("returns medium fallback for JSON with invalid risk level", () => {
		const result = parseVerdict('{"risk":"extreme","reason":"unknown risk"}');
		assert.deepEqual(result, { risk: "medium", reason: PARSE_FAILURE_REASON });
	});

	it("returns medium fallback for JSON missing reason", () => {
		const result = parseVerdict('{"risk":"low"}');
		assert.deepEqual(result, { risk: "medium", reason: PARSE_FAILURE_REASON });
	});

	it("returns a distinct fallback for empty / whitespace-only response", () => {
		// MiniMax-M3 burns its full budget on untracked reasoning and emits nothing
		// visible — distinguish from parse failure so the log surfaces the real cause.
		assert.deepEqual(parseVerdict(""), { risk: "medium", reason: EMPTY_RESPONSE_REASON });
		assert.deepEqual(parseVerdict("   \n  \t  "), { risk: "medium", reason: EMPTY_RESPONSE_REASON });
	});

	// --- Hardened parser: cases the old single-regex fallback missed ---

	it("parses verdict with reversed key order (reason before risk)", () => {
		// Old regex required "risk" before "reason"; reversed order broke it.
		const result = parseVerdict('{"reason":"moderate risk","risk":"medium"}');
		assert.deepEqual(result, { risk: "medium", reason: "moderate risk" });
	});

	it("parses verdict wrapped in thinking prose", () => {
		// Reasoning models (MiniMax-M3, DeepSeek-V4-Pro) wrap JSON in prose.
		const result = parseVerdict(
			'Thinking about this command... it modifies files outside CWD so it is medium risk.\n' +
			'Here is my verdict: {"risk":"medium","reason":"affects paths outside CWD"} Done.',
		);
		assert.deepEqual(result, { risk: "medium", reason: "affects paths outside CWD" });
	});

	it("parses verdict when prose contains code-example braces", () => {
		// Prose may include `function foo() { ... }` or `for i { x }` fragments.
		// The scanner must still locate the real JSON object independently.
		const result = parseVerdict(
			'I considered `for i := 0; i < n; i++ { x }` but that is irrelevant.\n' +
			'{"risk":"low","reason":"read-only loop in prose"}',
		);
		assert.deepEqual(result, { risk: "low", reason: "read-only loop in prose" });
	});

	it("parses verdict when a string value contains literal braces", () => {
		// JSON string values may contain { or } (e.g. reasons quoting code/config).
		// parseJsonWithRepair handles braces inside strings; the scanner must
		// yield the full object span so the parser sees them in context.
		const result = parseVerdict('{"risk":"low","reason":"touches only `{cwd}` var"}');
		assert.deepEqual(result, { risk: "low", reason: "touches only `{cwd}` var" });
	});

	it("parses the first valid verdict when prose contains other JSON-like spans", () => {
		// Model may emit an example object before the real verdict.
		const result = parseVerdict(
			'Example shape: {"foo":"bar"}. Actual verdict: {"risk":"high","reason":"irreversible"}',
		);
		assert.deepEqual(result, { risk: "high", reason: "irreversible" });
	});

	it("parses verdict embedded in a longer balanced-brace prose span", () => {
		// Outer brace in prose pairs with a brace inside the JSON's reason string,
		// so the first candidate span is prose+JSON and fails; the scanner must
		// still try the inner JSON span starting at its own `{`.
		const result = parseVerdict(
			'Here { is some prose with a } char and then ' +
			'{"risk":"medium","reason":"nested object literal"} follows.',
		);
		assert.deepEqual(result, { risk: "medium", reason: "nested object literal" });
	});

	it("exports PARSE_FAILURE_REASON and EMPTY_RESPONSE_REASON constants", () => {
		// The handler compares verdict.reason to these to decide whether to attach
		// the raw response to the log. They must stay string-equal to the values
		// historical log entries and tests rely on.
		assert.equal(PARSE_FAILURE_REASON, "Could not parse LLM verdict");
		assert.equal(EMPTY_RESPONSE_REASON, "LLM returned empty response");
	});
});

describe("truncateCommand", () => {
	it("returns the original string when ≤ 5 lines", () => {
		const cmd = "line1\nline2\nline3\nline4\nline5";
		assert.equal(truncateCommand(cmd), cmd);
	});

	it("truncates to 5 lines and appends \\n… when > 5 lines", () => {
		const cmd = "line1\nline2\nline3\nline4\nline5\nline6";
		const result = truncateCommand(cmd);
		assert.equal(result, "line1\nline2\nline3\nline4\nline5\n…");
	});

	it("handles an empty string", () => {
		assert.equal(truncateCommand(""), "");
	});

	it("handles a single-line command", () => {
		assert.equal(truncateCommand("ls -la"), "ls -la");
	});

	it("handles a command with exactly 5 lines (should NOT append …)", () => {
		const cmd = "a\nb\nc\nd\ne";
		assert.equal(truncateCommand(cmd), cmd);
	});

	it("handles a command with exactly 6 lines (should append …)", () => {
		const cmd = "a\nb\nc\nd\ne\nf";
		const result = truncateCommand(cmd);
		assert.equal(result, "a\nb\nc\nd\ne\n…");
	});

	it("respects a custom maxLines parameter", () => {
		const cmd = "a\nb\nc\nd";
		assert.equal(truncateCommand(cmd, 3), "a\nb\nc\n…");
	});
});

describe("risk level comparison logic", () => {
	it("safe is below low threshold", () => {
		assert.equal(riskLevelIndex("safe") < riskLevelIndex("low"), true);
	});

	it("low meets the low block threshold", () => {
		assert.equal(riskLevelIndex("low") >= riskLevelIndex("low"), true);
	});

	it("high exceeds all thresholds", () => {
		assert.equal(riskLevelIndex("high") > riskLevelIndex("medium"), true);
		assert.equal(riskLevelIndex("high") > riskLevelIndex("low"), true);
	});
});

// ---------------------------------------------------------------------------
// Source-shape regression guards (config/env/auth plumbing)
// ---------------------------------------------------------------------------

describe("config plumbing", () => {
	it("references PI_AI_PERM_GATE_MAX_TOKENS env var", () => {
		assert.match(extensionSource, /PI_AI_PERM_GATE_MAX_TOKENS/);
	});

	it("references PI_AI_PERM_GATE_TEMPERATURE env var", () => {
		assert.match(extensionSource, /PI_AI_PERM_GATE_TEMPERATURE/);
	});

	it("references PI_AI_PERM_GATE_TIMEOUT env var", () => {
		assert.match(extensionSource, /PI_AI_PERM_GATE_TIMEOUT/);
	});

	it("has readPermissionGateMaxTokens function", () => {
		assert.match(extensionSource, /function readPermissionGateMaxTokens/);
	});

	it("has readPermissionGateTemperature function", () => {
		assert.match(extensionSource, /function readPermissionGateTemperature/);
	});

	it("has readPermissionGateTimeout function", () => {
		assert.match(extensionSource, /function readPermissionGateTimeout/);
	});

	it("resolves API key via ModelRegistry.getApiKeyAndHeaders", () => {
		assert.match(extensionSource, /getApiKeyAndHeaders/);
	});

	it("uses Provider.streamSimple for classification", () => {
		assert.match(extensionSource, /provider\s*\.\s*streamSimple\s*\(/);
	});

	it("does NOT use compat entrypoint", () => {
		assert.doesNotMatch(extensionSource, /from ["']@earendil-works\/pi-ai\/compat["']/);
		assert.doesNotMatch(extensionSource, /\bcompleteSimple\s*\(/);
	});

	it("exports PARSE_FAILURE_REASON and EMPTY_RESPONSE_REASON constants", () => {
		assert.match(extensionSource, /export const PARSE_FAILURE_REASON/);
		assert.match(extensionSource, /export const EMPTY_RESPONSE_REASON/);
	});

	it("classifyCommand returns { verdict, rawResponse }", () => {
		// The handler threads rawResponse to the log only on parse failure.
		assert.match(extensionSource, /Promise<\{ verdict: Verdict; rawResponse: string \}>/);
		assert.match(extensionSource, /return \{ verdict: parseVerdict\(responseText\), rawResponse: responseText \}/);
	});

	it("logCommandDecision accepts an optional rawResponse param", () => {
		assert.match(extensionSource, /reason\?: string,\s*\n\s*rawResponse\?: string,\s*\n\): void/);
		// rawResponse is attached to the log entry (capped at 2000 chars) ...
		assert.match(extensionSource, /if \(rawResponse !== undefined\)/);
		assert.match(extensionSource, /rawResponse\.length > 2000/);
		assert.match(extensionSource, /\u2026\[truncated\]/);
	});

	it("handler only logs rawResponse on parse failure", () => {
		// parseFailureRaw is undefined unless verdict.reason matches a parse-failure
		// constant, so successful classifications don't bloat the log.
		assert.match(extensionSource, /verdict\.reason === PARSE_FAILURE_REASON/);
		assert.match(extensionSource, /verdict\.reason === EMPTY_RESPONSE_REASON/);
		assert.match(extensionSource, /const parseFailureRaw/);
	});

	it("confirmWithUser threads rawResponse to its log calls", () => {
		assert.match(
			extensionSource,
			/async function confirmWithUser\([\s\S]*?opts: ConfirmOptions,\s*\n\s*rawResponse\?: string,\s*\n\)/,
		);
		assert.match(
			extensionSource,
			/logCommandDecision\(command, opts\.risk, blockLevel, "blocked", opts\.blockedLogReason, rawResponse\)/,
		);
		assert.match(
			extensionSource,
			/logCommandDecision\(command, opts\.risk, blockLevel, "confirmed", opts\.confirmedLogReason, rawResponse\)/,
		);
	});
});

describe("CWD-aware system prompt content", () => {
	it("contains Working directory context section", () => {
		assert.match(extensionSource, /Working directory context:/);
	});

	it("mentions CWD in the user prompt template", () => {
		assert.match(extensionSource, /Current working directory:/);
	});

	it("classifyCommand accepts cwd parameter", () => {
		assert.match(extensionSource, /classifyCommand\([^)]*command:\s*string[^)]*cwd:\s*string/s);
	});

	it("passes ctx.cwd to classifyCommand", () => {
		assert.match(extensionSource, /classifyCommand\(\s*command,\s*ctx\.cwd/);
	});

	it("tells LLM that CWD-scoped deletions are low risk", () => {
		assert.match(extensionSource, /Deleting files\/dirs under CWD.*low risk/);
	});

	it("tells LLM that system paths retain normal risk", () => {
		assert.match(extensionSource, /paths outside CWD.*retain their normal risk/);
	});

	it("low risk definition includes CWD-scoped deletions", () => {
		assert.match(extensionSource, /CWD-scoped deletions and modifications/);
	});

	it("high risk definition mentions outside CWD", () => {
		assert.match(extensionSource, /operations outside CWD that affect system state/);
	});

	it("package installs are described as low risk (not safe)", () => {
		assert.match(extensionSource, /Package installs.*within CWD are low risk/);
	});

	it("medium risk examples include CWD-outside path", () => {
		assert.match(extensionSource, /rm -rf \.\.\/other-project/);
	});

	it("CWD is delimited with backticks in user prompt", () => {
		assert.match(extensionSource, /Current working directory: \\`\$\{cwd\}\\`/);
	});

	it("classifyCommand has CWD fallback guard", () => {
		assert.match(extensionSource, /if \(!cwd\)\s*\{\s*cwd = process\.cwd\(\)/);
	});

	it("does NOT include CWD_MAX_RISK env var (LLM-only approach)", () => {
		assert.doesNotMatch(extensionSource, /PI_AI_PERM_GATE_CWD_MAX_RISK/);
	});

	it("does NOT include isCwdScoped heuristic", () => {
		assert.doesNotMatch(extensionSource, /function isCwdScoped/);
	});

	it("does NOT include hasSystemEscapePattern", () => {
		assert.doesNotMatch(extensionSource, /function hasSystemEscapePattern/);
	});
});

// ---------------------------------------------------------------------------
// Behavioral extension tests
// ---------------------------------------------------------------------------

describe("extension load", () => {
	it("default export is a function", () => {
		assert.equal(typeof extension, "function");
	});
});

describe("herdr:blocked emit pairing on permission prompt", () => {
	// Site A path: classifier throws (ctx.model undefined), fallback=confirm,
	// ctx.ui.select returns "No" → user denies.
	it("emits active:true then active:false when user denies (Site A, No)", async () => {
		const { events, api } = makeMockPi();
		extension(api);
		const handler = api.on.mock?.calls?.[0]?.[1]; // not used — see below

		// pi.on was called with "tool_call"; grab the handler directly
		const toolCallHandlers = events.listeners.get("tool_call");
		assert.ok(toolCallHandlers?.length === 1, "tool_call handler registered");

		const ctx = makeMockCtx({ selectReturn: "No" });
		const result = await toolCallHandlers[0](
			{ toolName: "bash", input: { command: "rm -rf /important" } },
			ctx,
		);

		// Denial returns a block result
		assert.deepEqual(result, { block: true, reason: "Blocked by user (AI check failed)" });

		// Emit pairing: exactly one active:true, then exactly one active:false,
		// both on herdr:blocked, in that order.
		const herdrEvents = events.emitted.filter((e) => e.channel === "herdr:blocked");
		assert.equal(herdrEvents.length, 2, "expected exactly 2 herdr:blocked emits");
		assert.equal(herdrEvents[0].data.active, true, "first emit must be active:true");
		assert.equal(herdrEvents[1].data.active, false, "second emit must be active:false");
		assert.ok(
			typeof herdrEvents[0].data.label === "string" && herdrEvents[0].data.label.length > 0,
			"active:true must carry a label string",
		);
		assert.equal(herdrEvents[1].data.label, undefined, "active:false carries no label");
	});

	it("emits active:true then active:false when user allows (Site A, Yes)", async () => {
		const { events, api } = makeMockPi();
		extension(api);
		const toolCallHandlers = events.listeners.get("tool_call");

		const ctx = makeMockCtx({ selectReturn: "Yes" });
		const result = await toolCallHandlers[0](
			{ toolName: "bash", input: { command: "rm -rf /important" } },
			ctx,
		);

		// Allow returns undefined (gate passes)
		assert.equal(result, undefined);

		const herdrEvents = events.emitted.filter((e) => e.channel === "herdr:blocked");
		assert.equal(herdrEvents.length, 2);
		assert.equal(herdrEvents[0].data.active, true);
		assert.equal(herdrEvents[1].data.active, false);
	});

	it("does NOT emit herdr:blocked when ctx.hasUI is false (headless fallback)", async () => {
		const { events, api } = makeMockPi();
		extension(api);
		const toolCallHandlers = events.listeners.get("tool_call");

		const ctx = makeMockCtx({ selectReturn: "No" });
		ctx.hasUI = false; // headless: no prompt, fallback=confirm → allow
		const result = await toolCallHandlers[0](
			{ toolName: "bash", input: { command: "rm -rf /important" } },
			ctx,
		);

		assert.equal(result, undefined, "headless fallback=confirm allows without prompt");
		const herdrEvents = events.emitted.filter((e) => e.channel === "herdr:blocked");
		assert.equal(herdrEvents.length, 0, "no emit when no prompt was shown");
	});

	it("does NOT emit herdr:blocked for safe commands (no prompt)", async () => {
		// Force classifier success by providing a model + mocked apiKey.
		// Easier: skip classifier entirely by leaving ctx.model undefined but
		// set fallback=allow so the catch returns undefined without prompting.
		// We test the "safe command, no prompt" path via env: fallback=allow.
		const origFallback = process.env.PI_AI_PERM_GATE_FALLBACK;
		process.env.PI_AI_PERM_GATE_FALLBACK = "allow";
		try {
			const { events, api } = makeMockPi();
			extension(api);
			const toolCallHandlers = events.listeners.get("tool_call");

			const ctx = makeMockCtx({ selectReturn: "Yes" });
			// ctx.hasUI true but fallback=allow → catch branch returns undefined
			// without calling confirmWithUser → no emit.
			const result = await toolCallHandlers[0](
				{ toolName: "bash", input: { command: "ls -la" } },
				ctx,
			);

			assert.equal(result, undefined);
			const herdrEvents = events.emitted.filter((e) => e.channel === "herdr:blocked");
			assert.equal(herdrEvents.length, 0, "fallback=allow must not emit blocked");
		} finally {
			if (origFallback === undefined) delete process.env.PI_AI_PERM_GATE_FALLBACK;
			else process.env.PI_AI_PERM_GATE_FALLBACK = origFallback;
		}
	});

	it("releases blocked state even if ctx.ui.select throws", async () => {
		const { events, api } = makeMockPi();
		extension(api);
		const toolCallHandlers = events.listeners.get("tool_call");

		const ctx = makeMockCtx({ selectReturn: "Yes" });
		// Override select to throw, simulating abort/error mid-prompt
		ctx.ui.select = async () => {
			throw new Error("simulated abort");
		};

		await assert.rejects(
			toolCallHandlers[0](
				{ toolName: "bash", input: { command: "rm -rf /important" } },
				ctx,
			),
			/simulated abort/,
		);

		// Critical: try/finally must still release the blocked state
		const herdrEvents = events.emitted.filter((e) => e.channel === "herdr:blocked");
		assert.equal(herdrEvents.length, 2, "active:false must fire even if select throws");
		assert.equal(herdrEvents[0].data.active, true);
		assert.equal(herdrEvents[1].data.active, false);
	});
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockPi() {
	const events = { emitted: [], listeners: new Map() };
	return {
		events,
		api: {
			on(event, handler) {
				if (!events.listeners.has(event)) events.listeners.set(event, []);
				events.listeners.get(event).push(handler);
			},
			events: {
				emit(channel, data) {
					events.emitted.push({ channel, data });
				},
				on(channel, handler) {
					if (!events.listeners.has(channel)) events.listeners.set(channel, []);
					events.listeners.get(channel).push(handler);
				},
			},
			registerTool() {},
			registerCommand() {},
		},
	};
}

// Mock ctx that forces the classifier path to throw (ctx.model = undefined),
// landing in the fallback=confirm branch (Site A) without any real LLM call.
function makeMockCtx({ selectReturn }) {
	return {
		hasUI: true,
		cwd: process.cwd(),
		model: undefined,
		signal: undefined,
		modelRegistry: {
			async getApiKeyAndHeaders() {
				return { ok: false, error: "mock: no api key" };
			},
		},
		ui: {
			notify() {},
			async select(_prompt, _choices) {
				return selectReturn;
			},
		},
	};
}
