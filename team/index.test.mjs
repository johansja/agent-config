/**
 * Tests for the team extension's pure helper functions.
 *
 * Run with: node --test team/index.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─── Inlined pure functions from team/index.ts ─────────────────────────────

function sanitizeTaskName(task) {
	const trimmed = task.trim();
	if (!trimmed) return null;
	if (trimmed.length < 1 || trimmed.length > 64) return null;
	if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.split(/[\/\\]/).includes("..")) return null;
	return trimmed;
}

function validateTaskName(task) {
	const sanitized = sanitizeTaskName(task);
	if (sanitized === null) {
		throw new Error(`Invalid task name: "${task}". Must be 1–64 characters, no slashes or "..".`);
	}
	return sanitized;
}

function workflowDir(cwd, task) {
	return path.join(cwd, ".pi", "workflow", task);
}

function statePath(cwd, task) {
	return path.join(workflowDir(cwd, task), "state.json");
}

function mailboxDir(cwd, task) {
	return path.join(workflowDir(cwd, task), "mailbox");
}

function mailboxPath(cwd, task, agent) {
	return path.join(mailboxDir(cwd, task), `${agent}.json`);
}

function readMailbox(filePath) {
	try {
		const content = fs.readFileSync(filePath, "utf-8").trim();
		if (!content) return [];
		const lines = content.split("\n").filter(Boolean);
		const messages = [];
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				messages.push(JSON.parse(line));
			} catch (_) {
				// skip malformed lines
			}
		}
		return messages;
	} catch {
		return [];
	}
}

function appendToMailbox(filePath, message) {
	const line = JSON.stringify(message) + "\n";
	fs.appendFileSync(filePath, line, { encoding: "utf-8" });
}

function clearMailbox(filePath) {
	fs.writeFileSync(filePath, "", { encoding: "utf-8" });
}

function saveState(cwd, state) {
	const sp = statePath(cwd, state.task);
	fs.writeFileSync(sp, JSON.stringify(state, null, 2), { encoding: "utf-8" });
}

function loadState(cwd, task) {
	const sp = statePath(cwd, task);
	try {
		const content = fs.readFileSync(sp, "utf-8").trim();
		if (!content) return null;
		const state = JSON.parse(content);
		if (state.orchestratorPaneId === undefined) {
			state.orchestratorPaneId = null;
		}
		if (state.status === undefined) {
			state.status = "active";
		}
		// Backward compat: "completed" status no longer exists; treat as "shutdown"
		if (state.status === "completed") {
			state.status = "shutdown";
		}
		if (state.surfaceIds === undefined) {
			state.surfaceIds = {};
		}
		// Remove obsolete fields
		delete state.agentStatus;
		return state;
	} catch {
		return null;
	}
}

const MAX_CONTEXT_DISPATCHES = 20;

function buildOrchestratorContext(state, extraInfo) {
	const lines = [];

	lines.push(`📋 ${state.task}`);
	lines.push("");

	lines.push("You are the **orchestrator**. Research and plan, then delegate.");
	lines.push("- Use `team_orchestrate` to dispatch. Give goals and constraints, not step-by-step instructions.");
	lines.push("- You may explore the codebase by reading files, grepping, etc.");
	lines.push("- You must NOT make code changes, write files, or run tests / build commands yourself — that's the team's job.");
	lines.push("- Do NOT dispatch a different agent until the current one reports back.");
	lines.push("- When an agent finishes, briefly note the result, then dispatch the next step.");
	lines.push("");

	lines.push("**Agents:**");
	for (const agent of state.agents) {
		const rolesLabel = agent.roles && agent.roles.length > 0
			? ` [${agent.roles.join(", ")}]`
			: "";
		lines.push(`  ${agent.name}${rolesLabel} — ${agent.description}`);
	}
	lines.push("");

	const done = state.dispatchHistory
		.slice(-MAX_CONTEXT_DISPATCHES)
		.filter((d) => d.result && d.result !== "[Session interrupted]" && d.result !== "[Team completed]");

	if (done.length > 0) {
		lines.push("**Done:**");
		for (const d of done) {
			lines.push(`- ${d.agent}: ${d.result.substring(0, 200)}${d.result.length > 200 ? "..." : ""}`);
		}
		lines.push("");
	}

	if (extraInfo) {
		lines.push(extraInfo);
		lines.push("");
	}

	lines.push("Use `team_orchestrate` to dispatch an agent.");

	return lines.join("\n");
}

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeTmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "team-test-"));
}

function cleanup(dir) {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch { /* best effort */ }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("sanitizeTaskName", () => {
	it("accepts valid names", () => {
		assert.equal(sanitizeTaskName("alpha"), "alpha");
		assert.equal(sanitizeTaskName("task-123"), "task-123");
		assert.equal(sanitizeTaskName("team-name"), "team-name");
		assert.equal(sanitizeTaskName("  spaced  "), "spaced");
	});

	it("rejects empty strings", () => {
		assert.equal(sanitizeTaskName(""), null);
		assert.equal(sanitizeTaskName("   "), null);
	});

	it("revents path traversal", () => {
		assert.equal(sanitizeTaskName("../etc"), null);
		assert.equal(sanitizeTaskName("./foo"), null);
		assert.equal(sanitizeTaskName("a/b"), null);
		assert.equal(sanitizeTaskName("a\\b"), null);
		assert.equal(sanitizeTaskName("foo..bar"), "foo..bar");
	});

	it("rejects names > 64 characters", () => {
		assert.equal(sanitizeTaskName("a".repeat(65)), null);
		assert.equal(sanitizeTaskName("a".repeat(64)), "a".repeat(64));
	});
});

describe("validateTaskName", () => {
	it("returns sanitized name for valid input", () => {
		assert.equal(validateTaskName("alpha"), "alpha");
	});

	it("throws for invalid input", () => {
		assert.throws(() => validateTaskName("../foo"), /Invalid task name/);
		assert.throws(() => validateTaskName(""), /Invalid task name/);
	});
});

describe("path helpers", () => {
	const cwd = "/tmp/project";
	const task = "my-task";

	it("workflowDir produces correct path", () => {
		assert.equal(workflowDir(cwd, task), path.join(cwd, ".pi", "workflow", task));
	});

	it("statePath points inside workflow dir", () => {
		assert.equal(statePath(cwd, task), path.join(workflowDir(cwd, task), "state.json"));
	});

	it("mailboxPath points inside mailbox dir", () => {
		assert.equal(mailboxPath(cwd, task, "agent1"), path.join(mailboxDir(cwd, task), "agent1.json"));
	});
});

describe("mailbox I/O", () => {
	let tmpDir;
	let mboxFile;

	it("setup temp dir", () => {
		tmpDir = makeTmpDir();
		mboxFile = path.join(tmpDir, "mailbox.json");
	});

	it("appendToMailbox + readMailbox round-trip", () => {
		appendToMailbox(mboxFile, { type: "dispatch", from: "orch", to: "agent1", instructions: "do work", timestamp: 1 });
		appendToMailbox(mboxFile, { type: "done", from: "agent1", to: "orch", summary: "done", timestamp: 2 });

		const msgs = readMailbox(mboxFile);
		assert.equal(msgs.length, 2);
		assert.equal(msgs[0].type, "dispatch");
		assert.equal(msgs[1].summary, "done");
	});

	it("readMailbox returns [] for missing file", () => {
		const msgs = readMailbox(path.join(tmpDir, "nonexistent.json"));
		assert.deepEqual(msgs, []);
	});

	it("readMailbox skips invalid JSON lines", () => {
		clearMailbox(mboxFile);
		fs.appendFileSync(mboxFile, '{"type":"ok"}\n');
		fs.appendFileSync(mboxFile, 'this is not json\n');
		fs.appendFileSync(mboxFile, '{"type":"ok2"}\n');

		const msgs = readMailbox(mboxFile);
		assert.equal(msgs.length, 2);
		assert.equal(msgs[0].type, "ok");
		assert.equal(msgs[1].type, "ok2");
	});

	it("clearMailbox empties the file", () => {
		clearMailbox(mboxFile);
		const msgs = readMailbox(mboxFile);
		assert.deepEqual(msgs, []);
		assert.equal(fs.readFileSync(mboxFile, "utf-8"), "");
	});

	it("cleanup temp dir", () => {
		cleanup(tmpDir);
	});
});

describe("saveState / loadState round-trip", () => {
	let tmpDir;
	let task;

	it("setup", () => {
		tmpDir = makeTmpDir();
		task = "test-task";
		fs.mkdirSync(workflowDir(tmpDir, task), { recursive: true });
	});

	it("saves and loads a state object", () => {
			const original = {
			task,
			role: "orchestrator",
			status: "active",
			agents: [{ name: "planner", description: "Plans things", source: "project", filePath: "/fake.md" }],
			orchestratorPaneId: null,
			surfaceIds: {},
			dispatchHistory: [],
		};

		saveState(tmpDir, original);
		const loaded = loadState(tmpDir, task);

		assert.deepEqual(loaded.task, original.task);
		assert.deepEqual(loaded.agents, original.agents);

		assert.equal(loaded.status, "active");
		assert.equal(loaded.orchestratorPaneId, null);
	});

	it("missing file returns null", () => {
		const loaded = loadState(tmpDir, "nonexistent");
		assert.equal(loaded, null);
	});

	it("corrupted JSON returns null", () => {
		const sp = statePath(tmpDir, "corrupt");
		fs.mkdirSync(path.dirname(sp), { recursive: true });
		fs.writeFileSync(sp, "not-json{{{", "utf-8");
		const loaded = loadState(tmpDir, "corrupt");
		assert.equal(loaded, null);
	});

	it("backward compat: missing orchestratorPaneId and surfaceIds become null and {}", () => {
		const sp = statePath(tmpDir, "compat");
		fs.mkdirSync(path.dirname(sp), { recursive: true });
		fs.writeFileSync(sp, JSON.stringify({ task: "compat", status: "active" }), "utf-8");
		const loaded = loadState(tmpDir, "compat");
		assert.equal(loaded.orchestratorPaneId, null);
		assert.equal(loaded.status, "active");
		assert.deepEqual(loaded.surfaceIds, {});
	});

	it("backward compat: 'completed' status becomes 'shutdown'", () => {
		const sp = statePath(tmpDir, "completed-compat");
		fs.mkdirSync(path.dirname(sp), { recursive: true });
		fs.writeFileSync(sp, JSON.stringify({ task: "completed-compat", status: "completed" }), "utf-8");
		const loaded = loadState(tmpDir, "completed-compat");
		assert.equal(loaded.status, "shutdown");
	});

	it("cleanup", () => {
		cleanup(tmpDir);
	});
});

describe("buildOrchestratorContext", () => {
	function makeState(dispatches = []) {
		return {
			task: "test-task",
			agents: [
				{ name: "worker", description: "Does things", roles: ["implementation"] },
				{ name: "reviewer", description: "Reviews things", roles: ["review"] },
			],
			dispatchHistory: dispatches,
			status: "active",
		};
	}

	it("contains header with task name", () => {
		const ctx = buildOrchestratorContext(makeState());
		assert.ok(ctx.includes("📋 test-task"));
	});

	it("contains 'orchestrator' in role section", () => {
		const ctx = buildOrchestratorContext(makeState());
		assert.ok(ctx.includes("You are the **orchestrator**"));
	});

	it("contains agent roster", () => {
		const ctx = buildOrchestratorContext(makeState());
		assert.ok(ctx.includes("worker"));
		assert.ok(ctx.includes("reviewer"));
	});

	it("includes role labels in roster", () => {
		const ctx = buildOrchestratorContext(makeState());
		assert.ok(ctx.includes("[implementation]"));
		assert.ok(ctx.includes("[review]"));
	});

	it("shows completed work from dispatches", () => {
		const state = makeState([
			{ agent: "worker", instructions: "do work", timestamp: 1, result: "done" },
		]);
		const ctx = buildOrchestratorContext(state);
		assert.ok(ctx.includes("**Done:**"));
		assert.ok(ctx.includes("- worker: done"));
	});

	it("truncates long results to 200 chars", () => {
		const longResult = "a".repeat(250);
		const state = makeState([
			{ agent: "worker", instructions: "do work", timestamp: 1, result: longResult },
		]);
		const ctx = buildOrchestratorContext(state);
		assert.ok(ctx.includes("a".repeat(200) + "..."));
		assert.ok(!ctx.includes("a".repeat(201)));
	});

	it("limits to MAX_CONTEXT_DISPATCHES (20)", () => {
		const dispatches = [];
		for (let i = 0; i < 25; i++) {
			dispatches.push({ agent: "worker", instructions: `task${i}`, timestamp: i, result: `result${i}` });
		}
		const state = makeState(dispatches);
		const ctx = buildOrchestratorContext(state);

		// Only last 20 results should appear
		assert.ok(ctx.includes("result24"));
		assert.ok(ctx.includes("result5"));
		assert.ok(!ctx.includes("result4"));
	});

	it("shows extraInfo when provided", () => {
		const ctx = buildOrchestratorContext(makeState(), "Extra context here");
		assert.ok(ctx.includes("Extra context here"));
	});

	it("does not show 'Done' section when no completed work", () => {
		const ctx = buildOrchestratorContext(makeState());
		assert.ok(!ctx.includes("**Done:**"));
		assert.ok(!ctx.includes("No completed work yet"));
	});
});

// ─── Inline dispatch blocking logic (from tool_call hook) ─────────────────

function checkDispatchBlock(orchestratorWaitingFor, requestedAgent) {
	if (orchestratorWaitingFor && requestedAgent !== orchestratorWaitingFor) {
		return {
			block: true,
			reason: `"${orchestratorWaitingFor}" is still running. Wait for their result before dispatching a different agent. You can send additional instructions to the same agent if needed.`,
		};
	}
	return { block: false };
}

describe("dispatch blocking", () => {
	it("blocks dispatching a different agent while waiting", () => {
		const result = checkDispatchBlock("worker", "reviewer");
		assert.equal(result.block, true);
		assert.ok(result.reason.includes("worker"));
		assert.ok(result.reason.includes("different agent"));
	});

	it("allows dispatching the same agent while waiting (steering)", () => {
		const result = checkDispatchBlock("worker", "worker");
		assert.equal(result.block, false);
	});

	it("allows dispatching when not waiting for any agent", () => {
		const result = checkDispatchBlock(null, "worker");
		assert.equal(result.block, false);
	});
});
