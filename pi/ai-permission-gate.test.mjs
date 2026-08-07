/**
 * Tests for the AI Permission Gate extension.
 *
 * Run with: node --test pi/ai-permission-gate.test.mjs
 *
 * Two layers:
 *   - Pure helpers imported from the real extension module via jiti (same TS
 *     loader pi uses at runtime). Covers parseVerdict / riskLevelIndex /
 *     buildDisplaySignature / truncateToChars / stripCodeFences invariants.
 *   - Source-shape assertions for config/env plumbing and the CWD-aware system
 *     prompt.
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
	truncateToChars,
	buildDisplaySignature,
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

describe("truncateToChars", () => {
	it("returns short string unchanged", () => {
		assert.equal(truncateToChars("abc", 10), "abc");
	});

	it("returns string of exactly max length unchanged", () => {
		assert.equal(truncateToChars("abc", 3), "abc");
	});

	it("truncates to max chars and appends …", () => {
		assert.equal(truncateToChars("abcdef", 3), "abc…");
	});

	it("handles an empty string", () => {
		assert.equal(truncateToChars("", 80), "");
	});
});

describe("buildDisplaySignature", () => {
	// --- bash ---

	it("bash: short command unchanged", () => {
		assert.equal(buildDisplaySignature("bash", { command: "ls -la" }), "ls -la");
	});

	it("bash: long command truncated to 80 chars + …", () => {
		const cmd = "x".repeat(100);
		assert.equal(buildDisplaySignature("bash", { command: cmd }), "x".repeat(80) + "…");
	});

	it("bash: newlines collapsed to spaces before truncation", () => {
		// Multi-line command signature is a one-line prefix; newlines become spaces.
		assert.equal(
			buildDisplaySignature("bash", { command: "line1\nline2\nline3" }),
			"line1 line2 line3",
		);
	});

	it("bash: empty command → empty string", () => {
		assert.equal(buildDisplaySignature("bash", { command: "" }), "");
	});

	// --- mcp prefix ---

	it("mcp: server present → server/tool prefix", () => {
		assert.equal(buildDisplaySignature("mcp", { server: "exa", tool: "search" }), "exa/search");
	});

	it("mcp: server absent → tool only (absorbs server=undefined noise)", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "atlassian_createJiraIssue" }),
			"atlassian_createJiraIssue",
		);
		assert.equal(buildDisplaySignature("mcp", { server: undefined, tool: "foo" }), "foo");
	});

	it("mcp: server/tool absent → 'mcp' fallback", () => {
		assert.equal(buildDisplaySignature("mcp", {}), "mcp");
	});

	// --- mcp args: small values shown ---

	it("mcp: small scalar values shown (string, number, bool)", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { a: "x", b: 1, c: true } }),
			'foo(a="x", b=1, c=true)',
		);
	});

	it("mcp: strings quoted; numbers/bools bare", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { s: "v", n: 42, b: false } }),
			'foo(s="v", n=42, b=false)',
		);
	});

	// --- mcp args: dropped values → +N more ---

	it("mcp: long string dropped + counted in +N more", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { short: "ok", long: "x".repeat(100) } }),
			'foo(short="ok", +1 more)',
		);
	});

	it("mcp: object/array/null dropped + counted", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { obj: { a: 1 }, arr: [1, 2], nul: null, s: "k" } }),
			'foo(s="k", +3 more)',
		);
	});

	it("mcp: opaque IDs (UUID, Atlassian account ID, hex) dropped + counted", () => {
		// Atlassian account ID (24 hex, no dashes)
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { id: "641a5e161273131f2ae21205", name: "n" } }),
			'foo(name="n", +1 more)',
		);
		// Standard UUID
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { id: "3e3d218b-6aaf-41d8-8120-15bbe4bc7793", name: "n" } }),
			'foo(name="n", +1 more)',
		);
	});

	it("mcp: empty string value dropped + counted", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { empty: "", s: "k" } }),
			'foo(s="k", +1 more)',
		);
	});

	it("mcp: all values dropped → tool(+N more)", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { big: "x".repeat(100), obj: { a: 1 } } }),
			"foo(+2 more)",
		);
	});

	it("mcp: no +N more suffix when nothing dropped", () => {
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: { a: "x" } }),
			'foo(a="x")',
		);
	});

	// --- mcp args shape ---

	it("mcp: empty args object → prefix only (no parens)", () => {
		assert.equal(buildDisplaySignature("mcp", { tool: "foo", args: {} }), "foo");
	});

	it("mcp: args as JSON string parsed like an object", () => {
		const argsStr = JSON.stringify({ a: "x", b: { nested: true }, c: "y".repeat(100) });
		assert.equal(
			buildDisplaySignature("mcp", { tool: "foo", args: argsStr }),
			'foo(a="x", +2 more)',
		);
	});

	it("mcp: non-JSON args string → prefix only (can't extract)", () => {
		assert.equal(buildDisplaySignature("mcp", { tool: "foo", args: "not json" }), "foo");
	});

	it("mcp: args undefined → prefix only", () => {
		assert.equal(buildDisplaySignature("mcp", { tool: "foo" }), "foo");
		assert.equal(buildDisplaySignature("mcp", { tool: "foo", args: undefined }), "foo");
	});

	// --- the motivating example (approximate) ---

	it("mcp: createJiraIssue with a big description → compact signature", () => {
		const args = {
			additional_fields: { customfield_10014: "AIC-3250" },
			assignee_account_id: "641a5e161273131f2ae21205",
			cloudId: "3e3d218b-6aaf-41d8-8120-15bbe4bc7793",
			contentFormat: "markdown",
			description: "## Intent\n\nCAPI creates BitdeerAIMachine objects…".repeat(10),
			issueTypeName: "Task",
			projectKey: "AIC",
			summary: "B2 nodepool_reconciler: set Cluster topology.workers (cluster_worker-VM)",
		};
		// Shown: contentFormat, issueTypeName, projectKey (small, non-ID).
		// Dropped: additional_fields (object), assignee_account_id (hex ID),
		//          cloudId (UUID), description (long), summary (>60 chars).
		assert.equal(
			buildDisplaySignature("mcp", { tool: "atlassian_createJiraIssue", args }),
			'atlassian_createJiraIssue(contentFormat="markdown", issueTypeName="Task", projectKey="AIC", +5 more)',
		);
	});

	// --- other tools ---

	it("unknown toolName → just toolName", () => {
		assert.equal(buildDisplaySignature("read", { path: "/x" }), "read");
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

	it("classifies via ctx.modelRegistry.complete", () => {
		assert.match(extensionSource, /ctx\.modelRegistry\.complete\(/);
	});

	it("does NOT resolve auth manually (runtime owns it)", () => {
		assert.doesNotMatch(extensionSource, /getApiKeyAndHeaders/);
		assert.doesNotMatch(extensionSource, /getProvider\(/);
		assert.doesNotMatch(extensionSource, /provider\s*\.\s*streamSimple/);
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

	it("confirmWithUser takes a displaySignature param", () => {
		assert.match(extensionSource, /displaySignature:\s*string/);
	});

	it("select prompt uses displaySignature, not truncateCommand", () => {
		assert.match(extensionSource, /\$\{displaySignature\}/);
		assert.doesNotMatch(extensionSource, /truncateCommand/);
	});

	it("exports buildDisplaySignature and truncateToChars", () => {
		assert.match(extensionSource, /export function buildDisplaySignature/);
		assert.match(extensionSource, /export function truncateToChars/);
	});

	it("handler builds signature from event.toolName + event.input", () => {
		assert.match(extensionSource, /buildDisplaySignature\(\s*event\.toolName,\s*event\.input/);
	});

	it("handler passes signature to both confirmWithUser call sites", () => {
		// fallback-confirm (classifier failed) and success-block both thread signature.
		const matches = extensionSource.match(/confirmWithUser\(pi, ctx, command, signature, blockLevel/g) ?? [];
		assert.equal(matches.length, 2, "expected signature at both call sites");
	});

	it("notify body carries the notifyLabel (tool name)", () => {
		assert.match(extensionSource, /risk — \$\{notifyLabel\}/);
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

