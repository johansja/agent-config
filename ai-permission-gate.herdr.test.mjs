// Smoke + behavioral test for ai-permission-gate.ts.
// Uses pi's bundled jiti (same runtime TS loader pi uses) with aliases pointing
// the bare package specifiers at pi's installed locations — extensions rely on
// pi's own deps at runtime (per repo AGENTS.md), so this mirrors production.
import { createJiti } from "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const PI = "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${PI}/dist/index.js`,
		"@earendil-works/pi-ai": `${PI}/node_modules/@earendil-works/pi-ai/dist/index.js`,
	},
});

const mod = await jiti.import("./ai-permission-gate.ts");
const extension = mod.default;

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

// ---------------------------------------------------------------------------
// Tests
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
