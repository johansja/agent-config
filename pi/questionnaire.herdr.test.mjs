// Smoke + behavioral test for questionnaire.ts herdr:blocked emission.
// Mirrors ai-permission-gate.herdr.test.mjs — same jiti + alias setup and
// emit-pairing assertions, adapted for the registerTool entry point.
// notify() writes OSC bytes to stdout during these tests; node:test tolerates
// them (same as the gate's herdr test), so we don't stub stdout here.
import { createJiti } from "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const PI = "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const PI_TUI = `${PI}/node_modules/@earendil-works/pi-tui/dist/index.js`;
const TYPEBOX = `${PI}/node_modules/typebox/build/index.mjs`;

const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${PI}/dist/index.js`,
		"@earendil-works/pi-tui": PI_TUI,
		typebox: TYPEBOX,
	},
});

const mod = await jiti.import("./questionnaire.ts");
const extension = mod.default;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockPi() {
	const events = { emitted: [], listeners: new Map() };
	const tools = [];
	return {
		events,
		tools,
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
			registerTool(tool) {
				tools.push(tool);
			},
			registerCommand() {},
		},
	};
}

function makeMockCtx({ customImpl }) {
	return {
		hasUI: true,
		ui: {
			custom(_factory, _options) {
				return customImpl();
			},
		},
	};
}

const resolveCustom = (result) => () => Promise.resolve(result);
const rejectCustom = (error) => () => Promise.reject(error);

function herdrEmits(events) {
	return events.emitted.filter((e) => e.channel === "herdr:blocked");
}

const sampleQuestions = [
	{ id: "q1", prompt: "Pick one", options: [{ value: "a", label: "A" }] },
	{ id: "q2", prompt: "Pick two", options: [{ value: "b", label: "B" }] },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extension load", () => {
	it("default export is a function", () => {
		assert.equal(typeof extension, "function");
	});
});

describe("registerTool", () => {
	it("registers exactly one tool named questionnaire", () => {
		const { api, tools } = makeMockPi();
		extension(api);
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "questionnaire");
	});
});

describe("herdr:blocked emit pairing on questionnaire prompt", () => {
	it("emits active:true (with label) then active:false when tool runs", async () => {
		const { events, api, tools } = makeMockPi();
		extension(api);
		const ctx = makeMockCtx({
			customImpl: resolveCustom({ questions: sampleQuestions, answers: [], cancelled: true }),
		});

		await tools[0].execute("tc1", { questions: sampleQuestions }, undefined, undefined, ctx);

		const herdr = herdrEmits(events);
		assert.equal(herdr.length, 2, "expected exactly 2 herdr:blocked emits");
		assert.equal(herdr[0].data.active, true, "first emit must be active:true");
		assert.equal(herdr[1].data.active, false, "second emit must be active:false");
		assert.ok(
			typeof herdr[0].data.label === "string" && herdr[0].data.label.length > 0,
			"active:true must carry a label string",
		);
		assert.equal(herdr[1].data.label, undefined, "active:false carries no label");
	});

	it("label is singular for one question", async () => {
		const q = [{ id: "q1", prompt: "p", options: [{ value: "a", label: "A" }] }];
		const { events, api, tools } = makeMockPi();
		extension(api);
		const ctx = makeMockCtx({ customImpl: resolveCustom({ questions: q, answers: [], cancelled: true }) });

		await tools[0].execute("tc", { questions: q }, undefined, undefined, ctx);

		assert.equal(herdrEmits(events)[0].data.label, "Questionnaire: 1 question");
	});

	it("label is plural for multiple questions", async () => {
		const { events, api, tools } = makeMockPi();
		extension(api);
		const ctx = makeMockCtx({
			customImpl: resolveCustom({ questions: sampleQuestions, answers: [], cancelled: true }),
		});

		await tools[0].execute("tc", { questions: sampleQuestions }, undefined, undefined, ctx);

		assert.equal(herdrEmits(events)[0].data.label, "Questionnaire: 2 questions");
	});

	it("does NOT emit herdr:blocked when ctx.hasUI is false (headless)", async () => {
		const { events, api, tools } = makeMockPi();
		extension(api);
		const ctx = makeMockCtx({ customImpl: resolveCustom({ questions: [], answers: [], cancelled: true }) });
		ctx.hasUI = false;

		await tools[0].execute("tc", { questions: sampleQuestions }, undefined, undefined, ctx);

		assert.equal(herdrEmits(events).length, 0, "no emit when headless (early return)");
	});

	it("does NOT emit herdr:blocked when questions array is empty", async () => {
		const { events, api, tools } = makeMockPi();
		extension(api);
		const ctx = makeMockCtx({ customImpl: resolveCustom({ questions: [], answers: [], cancelled: true }) });

		await tools[0].execute("tc", { questions: [] }, undefined, undefined, ctx);

		assert.equal(herdrEmits(events).length, 0, "no emit for empty questions (early return)");
	});

	it("releases blocked state even if ctx.ui.custom rejects", async () => {
		const { events, api, tools } = makeMockPi();
		extension(api);
		const ctx = makeMockCtx({ customImpl: rejectCustom(new Error("simulated abort")) });

		await assert.rejects(
			tools[0].execute("tc", { questions: sampleQuestions }, undefined, undefined, ctx),
			/simulated abort/,
		);

		// Critical: .finally() must still release the blocked state on rejection
		const herdr = herdrEmits(events);
		assert.equal(herdr.length, 2, "active:false must fire even if custom rejects");
		assert.equal(herdr[0].data.active, true);
		assert.equal(herdr[1].data.active, false);
	});
});
