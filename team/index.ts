/**
 * Team Extension — Dynamic LLM-orchestrated multi-agent workflows
 *
 * Compose a team from any agents discovered via .md files. The orchestrator
 * (the main pi session) uses LLM reasoning to decide which agent to dispatch
 * next and when to re-dispatch.
 *
 * All worker communication routes through the orchestrator — workers never
 * talk to each other directly.
 *
 * Commands:
 *   /team init <name> [<agent>...]   — Create team, become orchestrator (omitting agents loads all)
 *   /team status [name]              — Show workflow state
 *   /team resume [name]              — Resume an interrupted team session
 *   /team list                       — List available agents
 *   /team history [name]             — Show dispatch history
 *   /team cleanup <team-name>        — Remove a team regardless of status
 *
 * Tools (registered for LLM use):
 *   team_orchestrate  — Dispatch an agent (orchestrator only)
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isToolCallEventType, SessionManager, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { discoverAgents, type AgentConfig } from "./agents.js";
import { Text } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);

// ─── Module-level state ───────────────────────────────────────────────────

const activeWatchers: (fs.FSWatcher | NodeJS.Timeout)[] = [];
const spawnedTempDirs: string[] = [];
const activeDispatches = new Map<string, string>(); // key: `${task}/${role}`

// ─── Logging helper ─────────────────────────────────────────────────────────

function safeLog(level: "error" | "warn" | "info" | "debug", message: string): void {
	try {
		if (level === "error") console.error(message);
		else if (level === "warn") console.warn(message);
		else console.log(message);
	} catch { /* last resort */ }
}

// ─── Config ────────────────────────────────────────────────────────────────

const CONFIG = {
	POLL_INTERVAL_MS: 2000,
	SPAWN_DELAY_MS: 500,
	PENDING_RESUME_EXPIRY_MS: 5 * 60 * 1000,
	CMUX_TIMEOUT_MS: 10000,
	TASK_NAME_MAX_LENGTH: 64,
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────



type AgentRosterEntry = Omit<AgentConfig, "systemPrompt">;

interface DispatchEntry {
	agent: string;
	instructions: string;
	timestamp: number;
	result?: string;
	stopReason?: string;
	questions?: string[];
	dispatchId: string;
}

interface TeamState {
	task: string;
	role: "orchestrator";
	status: "active" | "shutdown";
	agents: AgentRosterEntry[];
	orchestratorPaneId: string | null;
	surfaceIds: Record<string, string>;
	dispatchHistory: DispatchEntry[];
	originalSystemPrompt?: string;
	pendingTeamResume?: number; // timestamp (Date.now()) — auto-expires after 5 minutes
	orchestratorSessionFile?: string;
}

interface WorkerState {
	task: string;
	role: string;
	dispatchId?: string;
}

interface TeamMessage {
	type: "dispatch" | "message" | "shutdown";
	from: string;
	to: string;
	body?: string;          // message content
	instructions?: string;  // dispatch instructions
	timestamp: number;
	dispatchId?: string;
}

// ─── Task name validation ──────────────────────────────────────────────────

function sanitizeTaskName(task: string): string | null {
	const trimmed = task.trim();
	if (!trimmed) return null;
	if (trimmed.length < 1 || trimmed.length > CONFIG.TASK_NAME_MAX_LENGTH) return null;
	if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.split(/[\/\\]/).includes("..")) return null;
	return trimmed;
}

function validateTaskName(task: string): string {
	const sanitized = sanitizeTaskName(task);
	if (sanitized === null) {
		throw new Error(`Invalid task name: "${task}". Must be 1–64 characters, no slashes or "..".`);
	}
	return sanitized;
}

// ─── File path helpers ───────────────────────────────────────────────────────

function workflowDir(cwd: string, task: string): string {
	return path.join(cwd, ".pi", "workflow", task);
}

function statePath(cwd: string, task: string): string {
	return path.join(workflowDir(cwd, task), "state.json");
}

function mailboxDir(cwd: string, task: string): string {
	return path.join(workflowDir(cwd, task), "mailbox");
}

function mailboxPath(cwd: string, task: string, agent: string): string {
	return path.join(mailboxDir(cwd, task), `${agent}.json`);
}

// ─── Session meta helpers ─────────────────────────────────────────────────

function agentSessionDir(cwd: string, task: string): string {
	return path.join(workflowDir(cwd, task), "sessions");
}

function agentSessionMetaPath(cwd: string, task: string, agentName: string): string {
	return path.join(agentSessionDir(cwd, task), `${agentName}.json`);
}

function saveAgentSessionMeta(cwd: string, task: string, agentName: string, sessionFile: string): void {
	const dir = agentSessionDir(cwd, task);
	fs.mkdirSync(dir, { recursive: true });
	const metaPath = agentSessionMetaPath(cwd, task, agentName);
	fs.writeFileSync(metaPath, JSON.stringify({ sessionFile }), { encoding: "utf-8" });
}

function loadAgentSessionMeta(cwd: string, task: string, agentName: string): string | null {
	try {
		const metaPath = agentSessionMetaPath(cwd, task, agentName);
		const content = fs.readFileSync(metaPath, "utf-8").trim();
		if (!content) return null;
		const meta = JSON.parse(content) as { sessionFile: string };
		if (meta.sessionFile && fs.existsSync(meta.sessionFile)) {
			return meta.sessionFile;
		}
		return null;
	} catch {
		return null;
	}
}

function sessionFileHasData(sessionFile: string): boolean {
	try {
		const content = fs.readFileSync(sessionFile, "utf-8").trim();
		if (!content) return false;
		// Header line + at least one entry line means there's real session data
		return content.split("\n").length > 1;
	} catch {
		return false;
	}
}

function sessionFileHasTeamEntry(sessionFile: string, taskName: string): boolean {
	try {
		const sm = SessionManager.open(sessionFile);
		const entries = sm.getEntries();
		return entries.some(
			(e: any) => e.type === "custom" && e.customType === "team-orchestrator" && e.data?.task === taskName,
		);
	} catch {
		return false;
	}
}

// ─── State persistence ───────────────────────────────────────────────────────

function saveState(cwd: string, state: TeamState): void {
	const sp = statePath(cwd, state.task);
	try {
		fs.writeFileSync(sp, JSON.stringify(state, null, 2), { encoding: "utf-8" });
	} catch (e) {
		safeLog("error", `team: failed to save state for ${state.task}: ${e}`);
		throw e; // re-throw so callers know state wasn't saved
	}
}

function loadState(cwd: string, task: string): TeamState | null {
	const sp = statePath(cwd, task);
	try {
		const content = fs.readFileSync(sp, "utf-8").trim();
		if (!content) return null;
		return JSON.parse(content) as TeamState;
	} catch (e: any) {
		if (e?.code !== "ENOENT") {
			safeLog("warn", `team: failed to load state for ${task}: ${e}`);
		}
		return null;
	}
}

function findPendingResumeTask(cwd: string): string | null {
	try {
		const workflowRoot = path.join(cwd, ".pi", "workflow");
		if (!fs.existsSync(workflowRoot)) return null;
		const entries = fs.readdirSync(workflowRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const state = loadState(cwd, entry.name);
			if (!state?.pendingTeamResume) continue;
			const elapsed = Date.now() - state.pendingTeamResume;
			if (elapsed <= CONFIG.PENDING_RESUME_EXPIRY_MS) {
				return state.task;
			}
		}
	} catch {
		// best effort
	}
	return null;
}

function saveSessionState(pi: ExtensionAPI, state: TeamState): void {
	pi.appendEntry("team-orchestrator", { task: state.task });
}

function loadSessionTask(ctx: ExtensionContext): string | null {
	const entries = ctx.sessionManager.getEntries();
	// Iterate from newest to oldest, returning the first task whose state file exists.
	// This avoids stale entries from old sessions that no longer have a workflow.
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type: string; customType?: string; data?: { task: string } };
		if (e.type === "custom" && e.customType === "team-orchestrator" && e.data?.task) {
			if (fs.existsSync(statePath(ctx.cwd, e.data.task))) {
				return e.data.task;
			}
		}
	}
	return null;
}

function saveWorkerState(pi: ExtensionAPI, state: WorkerState): void {
	pi.appendEntry("team-worker", state);
}

function loadWorkerState(ctx: ExtensionContext): WorkerState | null {
	const entries = ctx.sessionManager.getEntries();
	const entry = entries
		.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "team-worker")
		.pop() as { data?: WorkerState } | undefined;
	return entry?.data ?? null;
}

function loadWorkerDispatchId(ctx: ExtensionContext): string | null {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type: string; customType?: string; data?: { dispatchId?: string } };
		if (e.type === "custom" && e.customType === "team-worker-dispatch" && e.data?.dispatchId) {
			return e.data.dispatchId;
		}
	}
	return null;
}

// ─── Mailbox helpers ─────────────────────────────────────────────────────────

function readMailbox(filePath: string, _ctx?: ExtensionContext): TeamMessage[] {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		if (!content.trim()) return [];
		const lines = content.split("\n");
		const messages: TeamMessage[] = [];
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				messages.push(JSON.parse(line) as TeamMessage);
			} catch (e) {
				safeLog("warn", `team: malformed mailbox line in ${filePath}: ${line.substring(0, 100)}`);
			}
		}
		return messages;
	} catch (e: any) {
		if (e.code !== "ENOENT") {
			safeLog("warn", `team: failed to read mailbox ${filePath}: ${e.message}`);
		}
		return [];
	}
}

function clearMailboxWatchers(): void {
	activeWatchers.forEach(w => {
		if ("close" in w && typeof w.close === "function") {
			w.close();
		} else {
			clearInterval(w as NodeJS.Timeout);
		}
	});
	activeWatchers.length = 0;
}

function appendToMailbox(filePath: string, message: TeamMessage): void {
	try {
		const line = JSON.stringify(message) + "\n";
		fs.appendFileSync(filePath, line, { encoding: "utf-8" });
	} catch (e) {
		safeLog("error", `team: failed to append to mailbox ${filePath}: ${e}`);
		throw e;
	}
}

function clearMailbox(filePath: string): void {
	// Truncate in place — do NOT rename/replace the file.
	// fs.watch() on macOS watches the inode; renaming a new file over
	// the original replaces the inode and silently breaks the watcher,
	// causing all subsequent mailbox messages to be missed.
	try {
		fs.writeFileSync(filePath, "", { encoding: "utf-8" });
	} catch (e) {
		safeLog("warn", `team: failed to clear mailbox ${filePath}: ${e}`);
	}
}

// ─── Message extraction helpers ─────────────────────────────────────────────

function findLastAssistantMessage(messages: any[]): any {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			return messages[i];
		}
	}
	return null;
}

function extractAgentResult(messages: any[]): string {
	const assistant = findLastAssistantMessage(messages);
	if (!assistant) return "[No assistant message found]";

	const texts: string[] = [];
	for (const part of assistant.content || []) {
		if (part.type === "text") {
			texts.push(part.text);
		}
	}
	return texts.join("\n") || "[Empty assistant message]";
}

// ─── cmux CLI helpers ────────────────────────────────────────────────────────

async function cmuxExec(...args: string[]): Promise<{ stdout: string; stderr: string }> {
	try {
		return await execFileAsync("cmux", args, { timeout: CONFIG.CMUX_TIMEOUT_MS });
	} catch (err: any) {
		throw new Error(`cmux ${args.join(" ")} failed: ${err.message}`);
	}
}

async function cmuxNewSurface(paneId: string): Promise<string | null> {
	try {
		const { stdout } = await cmuxExec("new-surface", "--pane", paneId);
		const match = stdout.match(/surface:(\d+)/i);
		return match ? `surface:${match[1]}` : null;
	} catch {
		return null;
	}
}

async function cmuxGetPaneId(): Promise<string | null> {
	try {
		const { stdout } = await cmuxExec("identify");
		const match = stdout.match(/pane:(\d+)/i);
		return match ? `pane:${match[1]}` : null;
	} catch {
		return null;
	}
}

async function cmuxGetSurfaceId(): Promise<string | null> {
	try {
		const { stdout } = await cmuxExec("identify");
		const data = JSON.parse(stdout) as { caller?: { surface_ref?: string } };
		return data.caller?.surface_ref ?? null;
	} catch {
		return null;
	}
}

async function cmuxFocusSurface(surfaceId: string): Promise<void> {
	try {
		await cmuxExec("rpc", "surface.focus", JSON.stringify({ surface_id: surfaceId }));
	} catch {
		// Best effort — surface may already be gone
	}
}

async function cmuxSendToSurface(surfaceId: string, text: string): Promise<void> {
	try {
		await cmuxExec("send", "--surface", surfaceId, text);
	} catch (err: any) {
		throw new Error(`cmux send failed: ${err.message}`);
	}
}

async function cmuxCloseSurface(surfaceId: string): Promise<void> {
	try {
		await cmuxExec("close-surface", "--surface", surfaceId);
	} catch {
		// Surface may already be gone — silently ignore
	}
}

async function cmuxSurfaceExists(surfaceId: string): Promise<boolean> {
	try {
		const { stdout } = await cmuxExec("identify", "--surface", surfaceId);
		return stdout.includes(surfaceId);
	} catch {
		return false;
	}
}

async function cmuxNotify(title: string, body: string): Promise<void> {
	try {
		await cmuxExec("notify", "--title", title, "--body", body);
	} catch (e) {
		safeLog("debug", `team: cmuxNotify failed: ${e}`);
	}
}

async function cmuxLog(level: string, message: string): Promise<void> {
	try {
		await cmuxExec("log", "--level", level, "--source", "team", "--", message);
	} catch (e) {
		safeLog("debug", `team: cmuxLog failed: ${e}`);
	}
}

// ─── Notification helper ─────────────────────────────────────────────────────

function terminalNotify(title: string, body: string): void {
	if (process.env.KITTY_WINDOW_ID) {
		process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
		process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
	} else {
		process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
	}
}

// ─── Team resumption helpers ──────────────────────────────────────────────────

interface AvailableTeam {
	task: string;
	status: "active" | "shutdown";
	agentCount: number;
	lastActivity: number;
	hasWorkingAgents: boolean;
}

// TODO: listAvailableTeams only scans the given cwd. Consider adding an option to scan
// across all project directories for a global team listing.
function listAvailableTeams(cwd: string): AvailableTeam[] {
	const workflowRoot = path.join(cwd, ".pi", "workflow");
	const teams: AvailableTeam[] = [];

	try {
		if (!fs.existsSync(workflowRoot)) return teams;

		const entries = fs.readdirSync(workflowRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const state = loadState(cwd, entry.name);
			if (!state) continue;
			const hasWorkingAgents = (state.dispatchHistory ?? []).some(d => !d.result);
			let lastActivity = 0;
			for (const d of (state.dispatchHistory ?? [])) {
				if (d.timestamp > lastActivity) lastActivity = d.timestamp;
			}
			// Fallback to file mtime for new teams with no dispatches
			if (lastActivity === 0) {
				try { lastActivity = fs.statSync(statePath(cwd, entry.name)).mtimeMs; } catch { /* ignore */ }
			}
			teams.push({
				task: state.task ?? entry.name,
				status: state.status,
				agentCount: (state.agents ?? []).length,
				lastActivity,
				hasWorkingAgents,
			});
		}
	} catch {
		// workflow dir not readable
	}

	// Sort by last activity descending (most recent first)
	teams.sort((a, b) => b.lastActivity - a.lastActivity);
	return teams;
}

function ensureResearchTools(pi: ExtensionAPI): void {
	const researchTools = ["grep", "find", "ls"];
	const current = pi.getActiveTools();
	const missing = researchTools.filter((t) => !current.includes(t));
	if (missing.length > 0) {
		pi.setActiveTools([...current, ...missing]);
	}
}

async function resumeTeam(pi: ExtensionAPI, ctx: ExtensionContext, taskName: string, onAgentComplete?: () => void): Promise<TeamState | null> {
	const state = loadState(ctx.cwd, taskName);
	if (!state) {
		ctx.ui.notify(`No workflow state found for "${taskName}"`, "error");
		return null;
	}

	// Guard for empty/undefined agents
	if (!state.agents || state.agents.length === 0) {
		ctx.ui.notify(`Team "${taskName}" has no agents. Use /team init to create a new team.`, "warning");
		return null;
	}

	// Clean up stale watchers before setting up new ones
	clearMailboxWatchers();

	// Repair stale state: add synthetic "[Session interrupted]" results for mid-task dispatches
	for (const entry of state.dispatchHistory) {
		if (!entry.result) {
			entry.result = "[Session interrupted]";
		}
	}

	// 3. Close orphaned cmux surfaces before clearing references
	for (const [, surfaceId] of Object.entries(state.surfaceIds ?? {})) {
		try {
			await cmuxCloseSurface(surfaceId);
		} catch {
			// Orphaned surface already gone
		}
	}
	state.surfaceIds = {};
	// Re-focus orchestrator after closing orphans so focus doesn't drift.
	const orchSurfaceId = await cmuxGetSurfaceId();
	if (orchSurfaceId) {
		await cmuxFocusSurface(orchSurfaceId);
	}

	// 4. Clear orchestratorPaneId (stale after session end)
	state.orchestratorPaneId = null;

	// 5. Mark as active
	state.status = "active";

	// Save repaired state
	saveState(ctx.cwd, state);

	// Save session state
	saveSessionState(pi, state);

	// Clear stale mailbox messages before re-spawning agents
	for (const agent of state.agents) {
		const mp = mailboxPath(ctx.cwd, taskName, agent.name);
		try {
			clearMailbox(mp);
		} catch (e) {
			safeLog("warn", `team: failed to clear mailbox for ${agent.name}: ${e}`);
		}
	}

	// Salvage completed results from orchestrator mailbox BEFORE clearing it
	const orchMp = mailboxPath(ctx.cwd, taskName, "orchestrator");
	try {
		const orchMessages = readMailbox(orchMp, ctx);
		for (const msg of orchMessages) {
			if (msg.type === "message" && msg.body) {
				let report: { type?: string; result?: string } | null = null;
				try {
					report = JSON.parse(msg.body);
				} catch {
					// Not structured — skip for salvage
				}
				if (report?.type === "report" && report.result) {
					for (let i = state.dispatchHistory.length - 1; i >= 0; i--) {
						const entry = state.dispatchHistory[i];
						if (entry.agent === msg.from && (!entry.result || entry.result === "[Session interrupted]")) {
							entry.result = report.result;
							break;
						}
					}
				}
			}
		}
		saveState(ctx.cwd, state);
	} catch (e) {
		safeLog("warn", `team: failed to salvage orchestrator mailbox: ${e}`);
	}

	// Clear orchestrator's stale mailbox before setting up watcher
	try {
		clearMailbox(orchMp);
	} catch (e) {
		safeLog("warn", `team: failed to clear orchestrator mailbox: ${e}`);
	}

	// Set up mailbox watching
	setupMailboxWatching(pi, ctx, taskName, "orchestrator", onAgentComplete);

	// Re-resolve orchestrator pane ID
	state.orchestratorPaneId = await cmuxGetPaneId();

	// Re-spawn all agent tabs
	for (const agent of state.agents) {
		if (!fs.existsSync(agent.filePath)) {
			safeLog("warn", `team: agent file missing for ${agent.name} at ${agent.filePath}, skipping respawn`);
			continue;
		}
		const sessionFile = loadAgentSessionMeta(ctx.cwd, taskName, agent.name);
		const { surfaceId } = await spawnAgent(
			pi, ctx, agent, taskName,
			state.orchestratorPaneId,
			async () => {
				state.orchestratorPaneId = await cmuxGetPaneId();
				return state.orchestratorPaneId;
			},
			sessionFile ?? undefined,
		);

		if (surfaceId) {
			state.surfaceIds[agent.name] = surfaceId;
		}
	}

	// Save state with new surface IDs
	saveState(ctx.cwd, state);

	// Set session name and update widget
	pi.setSessionName(`orchestrator: ${taskName}`);

	ensureResearchTools(pi);

	ctx.ui.notify(`Team "${taskName}" resumed. ${state.agents.length} agents re-spawned.`, "info");
	await cmuxLog("info", `Team "${taskName}" resumed with ${state.agents.length} agents`);

	return state;
}

// ─── Orchestrator context builder ────────────────────────────────────────────


function buildOrchestratorContext(state: TeamState): string {
	const lines: string[] = [];

	lines.push(`Dispatch agents with team_orchestrate. One at a time — wait for the result before dispatching another.`);
	lines.push("");

	lines.push(`**Available agents:**`);
	for (const agent of state.agents) {
		const rolesLabel = agent.roles && agent.roles.length > 0
			? ` [${agent.roles.join(", ")}]`
			: "";
		lines.push(`  ${agent.name}${rolesLabel} — ${agent.description}`);
	}
	lines.push("");
	lines.push("Only dispatch the agents listed above.");

	return lines.join("\n");
}


// ─── Agent spawn ─────────────────────────────────────────────────────────────

async function spawnAgent(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	agent: AgentRosterEntry,
	task: string,
	paneId?: string | null,
	resolvePaneId?: () => Promise<string | null>,
	sessionFile?: string,
): Promise<{ surfaceId: string | null }> {
	// Generate context temp file
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-team-"));
	spawnedTempDirs.push(tmpDir);

	const contextFile = path.join(tmpDir, `context-${agent.name}.md`);
		const contextContent = [
			`# ${agent.name}`,
			`Team: ${task}`,
			``,
			`Your instructions will arrive via mailbox. Do your work, then report back clearly.`,
		].join("\n");
		await fs.promises.writeFile(contextFile, contextContent, { encoding: "utf-8", mode: 0o600 });

		// Build the pi command
		const args: string[] = [];
		const isResume = sessionFile ? sessionFileHasData(sessionFile) : false;
		if (sessionFile) args.push("--session", sessionFile);
		if (!isResume && agent.model) args.push("--model", agent.model);
		const validToolNames = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
		if (agent.tools && agent.tools.length > 0) {
			const invalidTools = agent.tools.filter(t => !validToolNames.has(t));
			if (invalidTools.length > 0) {
				safeLog("warn", `team: agent ${agent.name} has unknown tool names: ${invalidTools.join(", ")}`);
			}
			const validTools = agent.tools.filter(t => validToolNames.has(t));
			if (validTools.length > 0) {
				args.push("--tools", validTools.join(","));
			}
		}
		if (!isResume && agent.thinking) args.push("--thinking", agent.thinking);
		args.push("--append-system-prompt", agent.filePath);
		args.push("--append-system-prompt", contextFile);

		// Set env vars for team identity
		const envPrefix = `PI_TEAM_TASK=${task} PI_TEAM_ROLE=${agent.name}`;

		// Try cmux new-surface (tab within the orchestrator's pane)
		// If the pane ID is stale (pane was recreated), retry once with a fresh ID
		let surfaceId: string | null = null;
		if (paneId) {
			surfaceId = await cmuxNewSurface(paneId);
			if (!surfaceId && resolvePaneId) {
				const freshPaneId = await resolvePaneId();
				if (freshPaneId) {
					surfaceId = await cmuxNewSurface(freshPaneId);
				}
			}
		}

		if (surfaceId) {
			await new Promise((resolve) => setTimeout(resolve, CONFIG.SPAWN_DELAY_MS));
			const command = `${envPrefix} pi ${args.join(" ")}\n`;
			await cmuxSendToSurface(surfaceId, command);

			// Tab title left to cmux defaults or user preference
		} else {
			// No cmux — print manual command
			const command = `${envPrefix} pi ${args.join(" ")}`;
			ctx.ui.notify(`cmux not available. Run manually:\n${command}`, "info");
		}

		return { surfaceId };
}

// ─── Mailbox watching ────────────────────────────────────────────────────────

function processOrchestratorMailbox(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	task: string,
	messages: TeamMessage[],
): boolean {
	const state = loadState(ctx.cwd, task);
	if (!state) return false;

	// Process each message and build combined context
	const parts: string[] = [];
	let hasActionableMessage = false;

	for (const msg of messages) {
		if (msg.type === "message") {
			hasActionableMessage = true;
			saveState(ctx.cwd, state);

			// Try to parse as a structured report
			let report: { type: string; result?: string; stopReason?: string } | null = null;
			if (msg.body) {
				try {
					report = JSON.parse(msg.body);
				} catch {
					// Not a structured message — treat body as plain text
				}
			}

			if (report?.type === "report") {
				// Update dispatch history if we can match by dispatchId
				if (msg.dispatchId) {
					for (let i = state.dispatchHistory.length - 1; i >= 0; i--) {
						if (state.dispatchHistory[i].dispatchId === msg.dispatchId) {
							state.dispatchHistory[i].result = report.result ?? "";
							state.dispatchHistory[i].stopReason = report.stopReason ?? "unknown";
							break;
						}
					}
				} else {
					for (let i = state.dispatchHistory.length - 1; i >= 0; i--) {
						if (state.dispatchHistory[i].agent === msg.from && !state.dispatchHistory[i].result) {
							state.dispatchHistory[i].result = report.result ?? "";
							state.dispatchHistory[i].stopReason = report.stopReason ?? "unknown";
							break;
						}
					}
				}
				saveState(ctx.cwd, state);

				const fullResult = report.result ?? "No result provided";
				parts.push(`Received message from "${msg.from}":\n\n${fullResult}`);
			}
		} else if (msg.type === "shutdown") {
			// Orchestrator receiving a shutdown notice (rare — mostly agent→orchestrator)
			saveState(ctx.cwd, state);
			parts.push(`Received message from "${msg.from}":\n\nThe agent has shut down.`);
		}
	}

	if (hasActionableMessage) {
		// Send a user message to trigger the orchestrator's next turn
		const fullMessage = parts.join("\n\n");
		pi.sendUserMessage(fullMessage, { deliverAs: "steer" });
	}
	return hasActionableMessage;
}

function processWorkerMailbox(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	task: string,
	role: string,
	messages: TeamMessage[],
): void {
	for (const msg of messages) {
		if (msg.type === "dispatch") {
			if (msg.dispatchId) {
				activeDispatches.set(`${task}/${role}`, msg.dispatchId);
				// Persist dispatchId in session entries so agent_end can reliably
				// look it up even if activeDispatches has raced with a new message.
				pi.appendEntry("team-worker-dispatch", { dispatchId: msg.dispatchId });
			}
			const dispatchText = msg.instructions ?? msg.body ?? "New task from orchestrator";
			pi.sendUserMessage(`Received message from "orchestrator":\n\n${dispatchText}`, { deliverAs: "steer" });
		} else if (msg.type === "shutdown") {
			ctx.ui.notify("Shutdown requested by orchestrator. Wrapping up.", "info");
		}
	}
}

function setupMailboxWatching(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	task: string,
	role: string,
	onAgentComplete?: () => void,
): void {
	const mp = mailboxPath(ctx.cwd, task, role);

	// Ensure mailbox file exists
	if (!fs.existsSync(mp)) {
		fs.mkdirSync(path.dirname(mp), { recursive: true });
		fs.writeFileSync(mp, "", { encoding: "utf-8" });
	}

	let lastSize = fs.statSync(mp).size;
	let processingMailbox = false;

	function processMessages(): void {
		if (processingMailbox) return;
		processingMailbox = true;
		try {
			const stat = fs.statSync(mp);
			if (stat.size === lastSize || stat.size === 0) return;
			lastSize = stat.size;

			const messages = readMailbox(mp, ctx);
			if (messages.length === 0) return;

			if (role === "orchestrator") {
				// Clear waiting state BEFORE sendUserMessage can synchronously trigger
				// the next LLM turn (and its tool_call events).
				onAgentComplete?.();
				processOrchestratorMailbox(pi, ctx, task, messages);
			} else {
				processWorkerMailbox(pi, ctx, task, role, messages);
			}
			clearMailbox(mp);
			lastSize = 0; // Reset after truncation so new messages of any size are detected
		} catch {
			// Mailbox file might be temporarily unavailable
		} finally {
			processingMailbox = false;
		}
	}

	// Check for existing messages (dispatch written before watcher was set up)
	const existingMessages = readMailbox(mp, ctx);
	if (existingMessages.length > 0) {
		if (role === "orchestrator") {
			// Clear waiting state BEFORE sendUserMessage can synchronously trigger
			// the next LLM turn (and its tool_call events).
			onAgentComplete?.();
			processOrchestratorMailbox(pi, ctx, task, existingMessages);
		} else {
			processWorkerMailbox(pi, ctx, task, role, existingMessages);
		}
		clearMailbox(mp);
		lastSize = 0;
	}

	try {
		const watcher = fs.watch(mp, () => {
			processMessages();
		});
		watcher.on("error", (err) => {
			safeLog("debug", `team: mailbox watcher error: ${err.message}`);
		});

		activeWatchers.push(watcher);
	} catch (e) {
		safeLog("debug", `team: fs.watch failed: ${e}`);
	}

	// Polling fallback — fs.watch is unreliable on some platforms and may
	// silently stop firing events. Poll every 2s as a safety net.
	const pollInterval = setInterval(processMessages, CONFIG.POLL_INTERVAL_MS);

	// Store interval so it can be cleaned up on session shutdown
	activeWatchers.push(pollInterval);
}

// ─── Main extension ──────────────────────────────────────────────────────────

export default function teamExtension(pi: ExtensionAPI) {
	let currentTeamState: TeamState | null = null;
	let currentWorkerState: WorkerState | null = null;
	let orchestratorWaitingFor: string | null = null; // agent name when tool is hidden

	function resetOrchestratorState() {
		clearMailboxWatchers();
		orchestratorWaitingFor = null;
		activeDispatches.clear();
	}

	function teardownTeam() {
		resetOrchestratorState();
		currentTeamState = null;
		currentWorkerState = null;
	}



	// ─── team_orchestrate tool (orchestrator only) ────────────────────────
	const isWorkerProcess = process.env.PI_TEAM_ROLE && process.env.PI_TEAM_ROLE !== "orchestrator";
	if (!isWorkerProcess) {
		pi.registerTool({
			name: "team_orchestrate",
		label: "Orchestrate Team",
		description: "Dispatch an agent with a task. The agent works in a background session. You must wait for their results before proceeding.",
		promptSnippet: "Dispatch an agent with instructions",
		promptGuidelines: [
			"Use team_orchestrate when you need to assign work to a team agent.",
			"Give a clear goal and any critical constraints — not step-by-step instructions. Trust the agent to explore and find the best approach.",
			"Only include context the agent can't figure out by reading the codebase (cross-module dependencies, undocumented intent, things that look like valid changes but aren't).",
			"After dispatching, the agent is actively working. Wait for their results — do not proceed or dispatch another agent until they arrive. If the agent is going off-track, you MAY redispatch the SAME agent with updated instructions — this sends a steer to correct their course.",
		],
		parameters: Type.Object({
			action: StringEnum(["dispatch"] as const, {
				description: "Action to take: 'dispatch' sends a task to an agent",
			}),
			agent: Type.Optional(Type.String({
				description: "Name of the agent to dispatch (required for 'dispatch' action)",
			})),
			instructions: Type.Optional(Type.String({
				description: "Goal and critical constraints for the agent (required for 'dispatch' action). Give the high-level objective and any non-obvious constraints — trust the agent to figure out the implementation.",
			})),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const envRole = process.env.PI_TEAM_ROLE;
			const isOrchestrator = envRole === "orchestrator" || currentTeamState !== null;

			if (!isOrchestrator) {
				return {
					content: [{ type: "text", text: "Only the orchestrator can use team_orchestrate." }],
					isError: true,
				};
			}

			const task = process.env.PI_TEAM_TASK ?? currentTeamState?.task;
			if (!task) {
				return {
					content: [{ type: "text", text: "No active team task." }],
					isError: true,
				};
			}

			const state = loadState(ctx.cwd, task);
			if (!state) {
				return {
					content: [{ type: "text", text: `No workflow state found for "${task}".` }],
					isError: true,
				};
			}

			if (params.action === "dispatch") {
				// Validate agent
				if (!params.agent) {
					const available = state.agents
						.map((a) => a.name);
					return {
						content: [{ type: "text", text: `Must specify an agent. Available: ${available.join(", ") || "none"}` }],
						isError: true,
					};
				}

				const rosterEntry = state.agents.find((a) => a.name === params.agent);
				if (!rosterEntry) {
					const available = state.agents.map((a) => a.name);
					return {
						content: [{ type: "text", text: `Unknown agent "${params.agent}". Available: ${available.join(", ")}` }],
						isError: true,
					};
				}

				if (!params.instructions) {
					return {
						content: [{ type: "text", text: "Must provide instructions for the agent." }],
						isError: true,
					};
				}

				// Mark any previous incomplete dispatch for this agent as abandoned
				for (let i = state.dispatchHistory.length - 1; i >= 0; i--) {
					if (state.dispatchHistory[i].agent === params.agent && !state.dispatchHistory[i].result) {
						state.dispatchHistory[i].result = "[Task abandoned — new instructions issued]";
						state.dispatchHistory[i].stopReason = "abandoned";
						break;
					}
				}

				// Record dispatch
				const dispatchId = crypto.randomUUID();
				state.dispatchHistory.push({
					agent: params.agent,
					instructions: params.instructions,
					timestamp: Date.now(),
					dispatchId,
				});

				// Write dispatch to agent's mailbox (agent is already running and watching)
				const agentMailbox = mailboxPath(ctx.cwd, task, params.agent);
				appendToMailbox(agentMailbox, {
					type: "dispatch",
					from: "orchestrator",
					to: params.agent,
					instructions: params.instructions,
					timestamp: Date.now(),
					dispatchId,
				});

				// Spawn agent if no surface exists (surface was closed, agent crashed, etc.)
				const existingSurfaceId = state.surfaceIds[params.agent];
				if (existingSurfaceId && !(await cmuxSurfaceExists(existingSurfaceId))) {
					delete state.surfaceIds[params.agent];
				}
				if (!state.surfaceIds[params.agent]) {
					// Resolve orchestrator pane ID if not yet known
					if (!state.orchestratorPaneId) {
						state.orchestratorPaneId = await cmuxGetPaneId();
					}

					const { surfaceId } = await spawnAgent(
						pi, ctx, rosterEntry, task,
						state.orchestratorPaneId,
						async () => {
							state.orchestratorPaneId = await cmuxGetPaneId();
							return state.orchestratorPaneId;
						},
						loadAgentSessionMeta(ctx.cwd, task, rosterEntry.name) ?? undefined,
					);

					if (surfaceId) {
						state.surfaceIds[params.agent] = surfaceId;
					}
				}

				saveState(ctx.cwd, state);
				currentTeamState = state;

				orchestratorWaitingFor = params.agent;

				return {
					content: [{
						type: "text",
						text: `Dispatched to "${params.agent}". Their task is in progress — do not proceed until their results arrive.`,
					}],
					details: { dispatchedTo: params.agent, status: "in-progress" },
				};
			}

			return {
				content: [{ type: "text", text: `Unknown action: ${params.action}` }],
				isError: true,
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			let content = theme.fg("toolTitle", theme.bold("team_orchestrate "));
			content += theme.fg("accent", args.action);
			if (args.agent) content += theme.fg("muted", ` → ${args.agent}`);
			text.setText(content);
			return text;
		},
		renderResult(result, { expanded }, theme, context) {
			const agentName = (result.details as { dispatchedTo?: string } | undefined)?.dispatchedTo;
			let text: string;
			if (result.isError) {
				text = theme.fg("error", "Error");
			} else if (agentName) {
				text = theme.fg("success", `↻ Dispatched → ${agentName}`);
			} else {
				text = theme.fg("success", "↻ Dispatched");
			}
			if (expanded && result.content[0]) {
				text += "\n  " + theme.fg("dim", (result.content[0] as { text: string }).text.substring(0, 200));
			}
			return new Text(text, 0, 0);
		},
		});
	}

	// ─── Session start: restore state ─────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		// Check for pending team resume (set by /team resume before switchSession)
		let resumeTask = loadSessionTask(ctx);
		// Fallback: if the session doesn't have the team-orchestrator entry (e.g.
		// because the custom entry wasn't flushed to disk before a prior crash),
		// scan workflow states for a pendingTeamResume flag.
		if (!resumeTask) {
			resumeTask = findPendingResumeTask(ctx.cwd);
		}
		if (resumeTask) {
			const state = loadState(ctx.cwd, resumeTask);
			const PENDING_RESUME_EXPIRY_MS = CONFIG.PENDING_RESUME_EXPIRY_MS; // 5 minutes

			if (state?.pendingTeamResume) {
				const elapsed = Date.now() - state.pendingTeamResume;
				if (elapsed > PENDING_RESUME_EXPIRY_MS) {
					// Flag is stale (pi likely crashed between /team resume and switchSession)
					state.pendingTeamResume = undefined;
					saveState(ctx.cwd, state);
					// Fall through to normal session_start logic
				} else {
					// Clear the flag
					state.pendingTeamResume = undefined;
					saveState(ctx.cwd, state);

					resetOrchestratorState();
					// Perform the actual resume (repair state, re-spawn workers)
					const resumed = await resumeTeam(pi, ctx, resumeTask, () => {
						orchestratorWaitingFor = null;
					});
					if (resumed) {
						currentTeamState = resumed;

						// Update orchestrator session meta (new session file after switchSession)
						if (ctx.sessionManager?.getSessionFile) {
							const newSessionFile = ctx.sessionManager.getSessionFile();
							if (newSessionFile) {
								saveAgentSessionMeta(ctx.cwd, resumeTask, "orchestrator", newSessionFile);
								resumed.orchestratorSessionFile = newSessionFile;
								saveState(ctx.cwd, resumed);
							}
						}
					}

					return; // Skip the rest of session_start logic
				}
			}
		}

		// If we have an active team entry but no pending resume flag
		// (e.g. after /reload), restore currentTeamState so shutdown
		// and before_agent_start keep working correctly.
		if (!currentTeamState && resumeTask) {
			const fallbackState = loadState(ctx.cwd, resumeTask);
			if (fallbackState && fallbackState.status === "active") {
				currentTeamState = fallbackState;
				// Restore waiting state so the safety net still works after /reload
				const latestIncomplete = fallbackState.dispatchHistory
					.slice()
					.reverse()
					.find(d => !d.result);
				if (latestIncomplete) {
					orchestratorWaitingFor = latestIncomplete.agent;
				}
				setupMailboxWatching(pi, ctx, resumeTask, "orchestrator", () => {
					orchestratorWaitingFor = null;
				});
				// Update session tracking for /reload resilience
				if (ctx.sessionManager?.getSessionFile) {
					const sessionFile = ctx.sessionManager.getSessionFile();
					if (sessionFile) {
						saveAgentSessionMeta(ctx.cwd, resumeTask, "orchestrator", sessionFile);
						currentTeamState.orchestratorSessionFile = sessionFile;
						saveState(ctx.cwd, currentTeamState);
					}
				}
				// Surfaces will be respawned automatically on next dispatch
			}
		}

		// Path 1: Worker with env vars (set by spawn)
		const envTask = process.env.PI_TEAM_TASK;
		const envRole = process.env.PI_TEAM_ROLE;

		if (envTask && envRole && envRole !== "orchestrator") {
			currentWorkerState = { task: envTask, role: envRole };
			saveWorkerState(pi, currentWorkerState);
			setupMailboxWatching(pi, ctx, envTask, envRole);
			pi.setSessionName(`${envRole}: ${envTask}`);
			ctx.ui.notify(`Team session: ${envRole} for ${envTask}`, "info");

			// Save session file path for resume
			if (ctx.sessionManager?.getSessionFile) {
				const sessionFile = ctx.sessionManager.getSessionFile();
				if (sessionFile) {
					saveAgentSessionMeta(ctx.cwd, envTask, envRole, sessionFile);
				}
			}

			return;
		}

		// Path 2: Orchestrator session state found — notify but don't auto-resume
		const sessionTask = loadSessionTask(ctx);
		if (sessionTask) {
			const state = loadState(ctx.cwd, sessionTask);
			if (state) {
				ctx.ui.notify(`Previous team "${sessionTask}" found. Use /team resume ${sessionTask} to resume.`, "info");
			}
		}

		// Path 3: Notify about available teams from .pi/workflow/
		const availableTeams = listAvailableTeams(ctx.cwd);

		if (availableTeams.length >= 1) {
			const lines: string[] = availableTeams.length === 1
				? ["Team found:"]
				: ["Multiple teams found:"];
			for (const team of availableTeams) {
				const timeStr = team.lastActivity > 0 ? new Date(team.lastActivity).toLocaleString() : "unknown";
				lines.push(`  ${team.task} — Agents: ${team.agentCount} | Last: ${timeStr}`);
			}
			lines.push("");
			lines.push("Use /team resume <task-name> to resume a team.");
			ctx.ui.notify(lines.join("\n"), "info");
		}
	});

	// ─── Agent end: auto-report to orchestrator ───────────────────────────

	pi.on("agent_end", async (event, ctx) => {
		const task = process.env.PI_TEAM_TASK ?? currentWorkerState?.task;
		const role = process.env.PI_TEAM_ROLE ?? currentWorkerState?.role;

		if (!task || !role || role === "orchestrator") return;

		// Extract result from conversation
		const result = extractAgentResult(event.messages);
		const lastAssistant = findLastAssistantMessage(event.messages);
		const stopReason = lastAssistant?.stopReason ?? "unknown";

		// Pi handles non-terminal states internally:
		// - "error" with willRetry → wait for the retry to complete
		// - "error" without willRetry → terminal failure, report it
		// - "aborted" → user cancelled, not a completion
		if (stopReason === "error" && event.willRetry === true) {
			// Keep state alive so the terminal agent_end can still report when pi
			// finishes its internal recovery.
			return;
		}
		if (stopReason === "aborted") {
			return;
		}

		// Load state
		const state = loadState(ctx.cwd, task);
		if (!state) return;

		// Use the dispatchId saved in session entries when the steer was delivered.
		// This is more reliable than the activeDispatches Map, which can race with
		// new mailbox messages arriving while the agent is finishing.
		const dispatchId = loadWorkerDispatchId(ctx) ?? activeDispatches.get(`${task}/${role}`);

		// Only report if there's an active dispatch. If user typed in the surface
		// without a pending dispatch, skip reporting to avoid noise.
		if (!dispatchId) {
			currentWorkerState = null;
			return;
		}

		// Update dispatch history by dispatchId. Always overwrite — a late result
		// for an abandoned dispatch should replace the synthetic placeholder.
		for (let i = state.dispatchHistory.length - 1; i >= 0; i--) {
			if (state.dispatchHistory[i].dispatchId === dispatchId) {
				state.dispatchHistory[i].result = result;
				state.dispatchHistory[i].stopReason = stopReason;
				break;
			}
		}

		// Agent session ended
		saveState(ctx.cwd, state);

		// Write result to orchestrator mailbox
		const orchestratorMailbox = mailboxPath(ctx.cwd, task, "orchestrator");
		appendToMailbox(orchestratorMailbox, {
			type: "message",
			from: role,
			to: "orchestrator",
			body: JSON.stringify({ type: "report", result, stopReason, dispatchId }),
			timestamp: Date.now(),
			dispatchId,
		});

		// Notify
		terminalNotify("Pi", `${role} completed (${stopReason}) for ${task}`);
		try {
			await cmuxNotify("Pi", `${role} completed (${stopReason}) for ${task}`);
		} catch {
			// cmux not available
		}

		// Clean up module-level state
		if (currentWorkerState?.task === task && currentWorkerState?.role === role) {
			currentWorkerState = null;
		}
		activeDispatches.delete(`${task}/${role}`);
	});

	// ─── Safety net: block team_orchestrate while waiting for an agent ────
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "team_orchestrate") return;

		if (orchestratorWaitingFor && event.input.agent !== orchestratorWaitingFor) {
			// Defensive: if module-level state is stale (race with mailbox watcher),
			// check persisted state. If the "waiting" agent already has a result,
			// self-heal and allow the dispatch.
			const task = currentTeamState?.task ?? process.env.PI_TEAM_TASK;
			if (task) {
				try {
					const state = loadState(ctx.cwd, task);
					if (state) {
						const waitingDispatch = state.dispatchHistory
							.slice()
							.reverse()
							.find((d) => d.agent === orchestratorWaitingFor && !d.result);
						if (!waitingDispatch) {
							orchestratorWaitingFor = null;
							return;
						}
					}
				} catch {
					// Best effort — fall through to block
				}
			}

			return {
				block: true,
				reason: `"${orchestratorWaitingFor}" is still running. Wait for their result before dispatching a different agent. You can send additional instructions to the same agent if needed.`,
			};
		}
	});

	// ─── Session shutdown: cleanup resources ────────────────────────────────

	pi.on("session_shutdown", async (event, ctx) => {
		// Close all active file watchers and intervals
		clearMailboxWatchers();

		// If orchestrator: send shutdown messages and close cmux surfaces
		if (currentTeamState) {
			const state = currentTeamState;
			for (const agent of state.agents) {
				const mp = mailboxPath(ctx.cwd, state.task, agent.name);
				try {
					appendToMailbox(mp, {
						type: "shutdown",
						from: "orchestrator",
						to: agent.name,
						body: "Session shutting down.",
						timestamp: Date.now(),
					});
				} catch {
					// Best effort — one failing mailbox shouldn't abort shutdown
				}
			}

			// Close cmux surfaces (defensive: surfaceIds may be undefined)
			for (const surfaceId of Object.values(state.surfaceIds ?? {})) {
				await cmuxCloseSurface(surfaceId);
			}
			// Re-focus orchestrator after teardown so focus doesn't drift.
			const orchSurfaceId = await cmuxGetSurfaceId();
			if (orchSurfaceId) {
				await cmuxFocusSurface(orchSurfaceId);
			}

			// cmux tab titles are left as-is on shutdown

			// Only mark as shutdown on explicit quit; reloads/forks/resumes should not
			if (event.reason === "quit") {
				state.status = "shutdown";
			}
			state.surfaceIds = {};
			try {
				saveState(ctx.cwd, state);
			} catch {
				// Best effort — state may be in a broken format
			}
		}

		// Nullify module-level state so it doesn't leak into future sessions
		teardownTeam();

		// Clean up any temp dirs left behind by spawned agents
		for (const dir of spawnedTempDirs) {
			try {
				await fs.promises.rm(dir, { recursive: true, force: true });
			} catch {
				// Best effort
			}
		}
		spawnedTempDirs.length = 0;
	});

	// ─── Before agent start: inject orchestrator context ────────────────────

	pi.on("before_agent_start", async (event, ctx) => {
		// Only inject for orchestrator sessions
		if (!currentTeamState) return;

			const task = currentTeamState.task;

		const state = loadState(ctx.cwd, task);
		if (!state) return;

		// Build and inject orchestrator context on every turn
		const context = buildOrchestratorContext(state);

		currentTeamState = state;

		if (!state.originalSystemPrompt) {
			state.originalSystemPrompt = event.systemPrompt;
			saveState(ctx.cwd, state);
		}
		const systemPrompt = state.originalSystemPrompt + "\n\n" + context;
		return { systemPrompt };
	});

	// ─── /team command ────────────────────────────────────────────────────

	pi.registerCommand("team", {
		description: "Manage dynamic multi-agent team workflows",
		getArgumentCompletions: (prefix: string) => {
			const parts = prefix.trim().split(/\s+/);
			const subcommand = parts[0];
			const argPrefix = parts[parts.length - 1] ?? "";

			// Subcommands that accept a team name as first argument
			const teamNameCommands = new Set(["cleanup", "resume"]);

			// If we have a subcommand and are typing an argument, offer contextual completions
			if (parts.length > 1 || prefix.endsWith(" ")) {
				if (teamNameCommands.has(subcommand)) {
					// Offer team names from .pi/workflow/
					try {
						const wfDir = path.join(process.cwd(), ".pi", "workflow");
						const entries = fs.readdirSync(wfDir, { withFileTypes: true });
						return entries
							.filter((e) => e.isDirectory() && e.name.startsWith(argPrefix))
							.map((e) => ({ value: `${subcommand} ${e.name}`, label: e.name }));
					} catch {
						return [];
					}
				}
				return [];
			}

			// Complete subcommand names
			const subcommands = ["init", "resume", "cleanup"];
			return subcommands
				.filter((s) => s.startsWith(prefix))
				.map((s) => ({ value: s, label: s }));
		},
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0];

			switch (subcommand) {
				// ─── /team init ─────────────────────────────────────────
				case "init": {
					const rawTaskName = parts[1];
					const agentNames = parts.slice(2);

					if (!rawTaskName) {
						ctx.ui.notify("Usage: /team init <task-name> [<agent>...]", "warning");
						return;
					}

					let taskName: string;
					try {
						taskName = validateTaskName(rawTaskName);
					} catch (e: any) {
						ctx.ui.notify(e.message, "error");
						return;
					}

					// Clear any leaked state from a previous team
					resetOrchestratorState();

					// Discover available agents
					const discovery = discoverAgents(ctx.cwd, "both");

					let roster: AgentRosterEntry[];

					if (agentNames.length === 0) {
						// No agents specified — load all discovered agents
						if (discovery.agents.length === 0) {
							ctx.ui.notify("No agents found.\n\nAdd agent .md files to:\n  ~/.pi/agent/team/ (user-level)\n  .pi/team/ (project-level)", "error");
							return;
						}
						roster = discovery.agents;
					} else {
						roster = [];
						const notFound: string[] = [];

						for (const name of agentNames) {
							const agent = discovery.agents.find((a) => a.name === name);
							if (!agent) {
								notFound.push(name);
							} else {
								roster.push(agent);
							}
						}

						if (notFound.length > 0) {
							const available = discovery.agents.map((a) => a.name).join(", ") || "none";
							ctx.ui.notify(`Unknown agent(s): ${notFound.join(", ")}\nAvailable agents: ${available}`, "error");
							return;
						}
					}

					// Create workflow directory structure
					const dir = workflowDir(ctx.cwd, taskName);
					const mdir = mailboxDir(ctx.cwd, taskName);
					const sdir = agentSessionDir(ctx.cwd, taskName);
					fs.mkdirSync(dir, { recursive: true });
					fs.mkdirSync(mdir, { recursive: true });
					fs.mkdirSync(sdir, { recursive: true });

					// Initialize mailbox files
					for (const agent of roster) {
						const mp = path.join(mdir, `${agent.name}.json`);
						if (!fs.existsSync(mp)) {
							fs.writeFileSync(mp, "", { encoding: "utf-8" });
						}
					}
					// Orchestrator mailbox
					const omp = path.join(mdir, "orchestrator.json");
					if (!fs.existsSync(omp)) {
						fs.writeFileSync(omp, "", { encoding: "utf-8" });
					}

					// Initialize state
					currentTeamState = {
						task: taskName,
						role: "orchestrator",
						status: "active",
						agents: roster,
						orchestratorPaneId: null,
						surfaceIds: {},
						dispatchHistory: [],
					};
					saveState(ctx.cwd, currentTeamState);
					saveSessionState(pi, currentTeamState);

					// Start watching orchestrator mailbox
					setupMailboxWatching(pi, ctx, taskName, "orchestrator", () => {
						orchestratorWaitingFor = null;
					});

					// Resolve orchestrator pane ID if not yet known
					if (!currentTeamState.orchestratorPaneId) {
						currentTeamState.orchestratorPaneId = await cmuxGetPaneId();
					}

					// Spawn all agents as tabs in the orchestrator's pane
					for (let i = 0; i < roster.length; i++) {
						const agent = roster[i];

						const { surfaceId } = await spawnAgent(
							pi, ctx, agent, taskName,
							currentTeamState.orchestratorPaneId,
							async () => {
								currentTeamState.orchestratorPaneId = await cmuxGetPaneId();
								return currentTeamState.orchestratorPaneId;
							},
						);

						if (surfaceId) {
							currentTeamState.surfaceIds[agent.name] = surfaceId;
						}
					}



					saveState(ctx.cwd, currentTeamState);

					// Name the session
					pi.setSessionName(`orchestrator: ${taskName}`);

					// Save orchestrator session file for resume
					if (ctx.sessionManager?.getSessionFile) {
						const orchSession = ctx.sessionManager.getSessionFile();
						if (orchSession) {
							saveAgentSessionMeta(ctx.cwd, taskName, "orchestrator", orchSession);
							currentTeamState!.orchestratorSessionFile = orchSession;
							saveState(ctx.cwd, currentTeamState!);
						}
					}

					const agentList = roster.map((a) => `  ${a.name} — ${a.description}`).join("\n");
					ensureResearchTools(pi);
					ctx.ui.notify(`Team initialized for "${taskName}"\nAgents:\n${agentList}\n\nDispatch agents using team_orchestrate.`, "info");
					await cmuxLog("info", `Team initialized for ${taskName} with agents: ${roster.map((a) => a.name).join(", ")}`);
					break;
				}

				// ─── /team resume ──────────────────────────────────────
				case "resume": {
					const rawTaskName = parts[1];
					let taskName: string | undefined;

					if (rawTaskName) {
						try {
							taskName = validateTaskName(rawTaskName);
						} catch (e: any) {
							ctx.ui.notify(e.message, "error");
							return;
						}
					}

					if (!taskName) {
						const teams = listAvailableTeams(ctx.cwd);
						if (teams.length === 0) {
							ctx.ui.notify("No teams found in .pi/workflow/", "info");
							return;
						}
						const lines: string[] = teams.map(t => `  ${t.task}`);
						ctx.ui.notify(`Available teams:\n${lines.join("\n")}\n\nUse /team resume <task-name> to resume.`, "info");
						return;
					}

					resetOrchestratorState();

					let orchSessionFile = loadAgentSessionMeta(ctx.cwd, taskName, "orchestrator");
					if (orchSessionFile && !sessionFileHasTeamEntry(orchSessionFile, taskName)) {
						orchSessionFile = null;
					}
					if (!orchSessionFile) {
						const state = loadState(ctx.cwd, taskName);
						if (state?.orchestratorSessionFile && fs.existsSync(state.orchestratorSessionFile)) {
							orchSessionFile = state.orchestratorSessionFile;
							if (!sessionFileHasTeamEntry(orchSessionFile, taskName)) {
								orchSessionFile = null;
							}
						}
					}
					if (!orchSessionFile) {
						try {
							const sessions = await SessionManager.list(ctx.cwd);
							for (const session of sessions.slice(-20).reverse()) {
								try {
									const sm = SessionManager.open(session.file);
									const entries = sm.getEntries();
									const teamEntries = entries.filter((e: any) => e.type === "custom" && e.customType === "team-orchestrator");
									const lastTeamEntry = teamEntries[teamEntries.length - 1];
									if (lastTeamEntry?.data?.task === taskName) {
										orchSessionFile = session.file;
										break;
									}
								} catch {
									// skip unreadable sessions
								}
							}
						} catch {
							// best effort
						}
					}

					if (orchSessionFile) {
						ctx.ui.notify(`Resuming orchestrator session from ${orchSessionFile}`, "info");
						const state = loadState(ctx.cwd, taskName);
						if (state) {
							state.pendingTeamResume = Date.now();
							saveState(ctx.cwd, state);
						}
						await ctx.switchSession(orchSessionFile, {
							withSession: async (_replacedCtx) => {
								// Intentionally empty — all post-switch work lives in `session_start`
							},
						});
						return;
					} else {
						ctx.ui.notify(`No orchestrator session file found. Resuming team without conversation history.`, "warning");
						const resumed = await resumeTeam(pi, ctx, taskName);
						if (resumed) currentTeamState = resumed;
					}
					break;
				}

				// ─── /team cleanup ──────────────────────────────────────
				case "cleanup": {
					const rawTargetTeam = parts[1];

					if (!rawTargetTeam) {
						const teams = listAvailableTeams(ctx.cwd);
						if (teams.length === 0) {
							ctx.ui.notify("No teams found in .pi/workflow/", "info");
							return;
						}
						const lines = teams.map(t => `  ${t.task}`);
						ctx.ui.notify(`Usage: /team cleanup <team-name>\n\nAvailable teams:\n${lines.join("\n")}`, "info");
						return;
					}

					let targetTeam: string;
					try {
						targetTeam = validateTaskName(rawTargetTeam);
					} catch (e: any) {
						ctx.ui.notify(e.message, "error");
						return;
					}

					const teamDir = path.join(ctx.cwd, ".pi", "workflow", targetTeam);
					if (!fs.existsSync(teamDir)) {
						ctx.ui.notify(`Team "${targetTeam}" not found.`, "error");
						return;
					}

					const state = loadState(ctx.cwd, targetTeam);
					const status = state?.status ?? "(no state)";
					const confirmed = await ctx.ui.confirm(
						"Team Cleanup",
						`Delete team "${targetTeam}" (status: ${status})?`,
					);
					if (!confirmed) {
						ctx.ui.notify("Cleanup cancelled.", "info");
						return;
					}

					const isCurrentTeam = currentTeamState?.task === targetTeam || currentWorkerState?.task === targetTeam;
					if (isCurrentTeam) {
						teardownTeam();
						try {
							const content = fs.readFileSync(path.join(teamDir, "state.json"), "utf-8");
							const stateJson = JSON.parse(content);
							for (const surfaceId of Object.values(stateJson.surfaceIds ?? {})) {
								if (typeof surfaceId === "string" && await cmuxSurfaceExists(surfaceId)) {
									await cmuxCloseSurface(surfaceId).catch(() => {});
								}
							}
						} catch { /* best effort */ }
						const orchSurfaceId = await cmuxGetSurfaceId();
						if (orchSurfaceId) {
							await cmuxFocusSurface(orchSurfaceId);
						}
					}

					await fs.promises.rm(teamDir, { recursive: true, force: true });
					ctx.ui.notify(`Cleaned up team "${targetTeam}"`, "info");
					await cmuxLog("info", `Cleaned up team "${targetTeam}"`);
					break;
				}

				default: {
					ctx.ui.notify(
						"Unknown command. Usage:\n" +
							"  /team init <team-name> [<agent>...]\n" +
							"  /team resume [task-name]\n" +
							"  /team cleanup <team-name>",
						"info",
					);
				}
			}
		},
	});
}
