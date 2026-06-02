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

function buildOrchestratorContext(state) {
	const lines = [];

	const agentNames = state.agents.map(a => a.name);
	const namesText = agentNames.length <= 2
		? agentNames.join(" and ")
		: agentNames.slice(0, -1).join(", ") + " and " + agentNames.at(-1);

	lines.push(`You are the team lead managing ${namesText}.`);
	lines.push("- Use `team_orchestrate` to dispatch. Give goals and constraints, not step-by-step instructions.");
	lines.push("- While an agent is working, stay active — chat with the user, plan the next move, or prepare materials.");
	lines.push("- If an agent needs course correction, send a steer (redispatch the same agent).");
	lines.push("- Only dispatch one agent at a time. Wait for their result before dispatching a different agent.");
	lines.push("- Typical flow for implementation tasks: dispatch implementor → review deliverable → dispatch reviewer for quality check → if critical issues found, send implementor back to fix → repeat as needed.");
	lines.push("- When an agent finishes, briefly note what they delivered, then decide what's next.");
	lines.push("");

	lines.push(`**Agents (${state.agents.length} total — you may ONLY dispatch these):**`);
	for (const agent of state.agents) {
		const rolesLabel = agent.roles && agent.roles.length > 0
			? ` [${agent.roles.join(", ")}]`
			: "";
		lines.push(`  ${agent.name}${rolesLabel} — ${agent.description}`);
	}
	lines.push("");
	lines.push("You may ONLY dispatch agents listed above. Do not invent or reference any other agent names.");
	lines.push("");

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
	function makeState(agents = []) {
		return {
			task: "test-task",
			agents,
			dispatchHistory: [],
			status: "active",
		};
	}

	it("contains team lead intro with agent names", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "worker", description: "Does things", roles: ["implementation"] },
			{ name: "reviewer", description: "Reviews things", roles: ["review"] },
		]));
		assert.ok(ctx.includes("You are the team lead managing worker and reviewer."));
	});

	it("formats three agents with oxford-style 'and'", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "alice", description: "A", roles: [] },
			{ name: "bob", description: "B", roles: [] },
			{ name: "carol", description: "C", roles: [] },
		]));
		assert.ok(ctx.includes("alice, bob and carol"));
	});

	it("contains agent roster with descriptions", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "worker", description: "Does things", roles: ["implementation"] },
			{ name: "reviewer", description: "Reviews things", roles: ["review"] },
		]));
		assert.ok(ctx.includes("worker"));
		assert.ok(ctx.includes("reviewer"));
		assert.ok(ctx.includes("Does things"));
		assert.ok(ctx.includes("Reviews things"));
	});

	it("includes role labels in roster", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "worker", description: "Does things", roles: ["implementation"] },
			{ name: "reviewer", description: "Reviews things", roles: ["review"] },
		]));
		assert.ok(ctx.includes("[implementation]"));
		assert.ok(ctx.includes("[review]"));
	});

	it("omits roles label when no roles", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "plain", description: "Plain agent", roles: [] },
		]));
		assert.ok(ctx.includes("plain — Plain agent"));
	});

	it("warns to only dispatch listed agents", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "worker", description: "Does things", roles: [] },
		]));
		assert.ok(ctx.includes("You may ONLY dispatch agents listed above."));
	});

	it("mentions team_orchestrate dispatch instruction", () => {
		const ctx = buildOrchestratorContext(makeState([
			{ name: "worker", description: "Does things", roles: [] },
		]));
		assert.ok(ctx.includes("Use `team_orchestrate` to dispatch an agent."));
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
