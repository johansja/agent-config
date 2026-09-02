/**
 * Orca blocked-state consumer for blocking UI prompts.
 *
 * Subscribes to pi's core `ui_prompt_start`/`ui_prompt_end` — fired around
 * every blocking ctx.ui prompt (permission gates, questionnaires, any
 * extension UI) — and POSTs to Orca's local hook endpoint
 * (/hook/pi) to drive Orca's pi state machine: a synthetic `ask_user_question`
 * tool_call drives working → blocked; `tool_execution_end` drives
 * blocked → working. No-op outside an Orca pane.
 *
 * Orca endpoint rotation: Orca rotates ORCA_AGENT_HOOK_PORT / _TOKEN on every
 * app restart and writes the current coords to endpoint.env (path in
 * ORCA_AGENT_HOOK_ENDPOINT, which does NOT rotate). postOrcaBlocked reads
 * endpoint.env first and falls back to process.env — using process.env alone
 * fails silently after Orca restarts because the inherited env points at a
 * dead port and a rejected token. Mirrors orca-agent-status.ts.
 *
 * Split from the former `notify.ts` (one consumer per transport). Payload
 * type duplicated structurally — no shared file (producers build payloads
 * inline by convention).
 */

import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Resolve the current Orca agent-hook endpoint coords (port, token, env, version).
 *
 * Orca rotates ORCA_AGENT_HOOK_PORT and ORCA_AGENT_HOOK_TOKEN on every app
 * restart (update, crash, manual relaunch). A long-running pi session inherits
 * the coords that were current at session start via process.env; after Orca
 * restarts, those env values point at a dead port and a rejected token, so any
 * hook post pinned to process.env fails silently (fetch errors swallowed).
 *
 * Orca writes the current coords to endpoint.env (path in
 * ORCA_AGENT_HOOK_ENDPOINT, which does NOT rotate) on every start.
 * ReadEndpointFile parses that file first; process.env is the fallback when the
 * file is unavailable (headless test, non-Orca runtime). Mirrors orca-agent-status
 * .ts's readEndpointFile/resolveHookCoords so the two extensions stay in sync.
 *
 * paneKey, launchToken, tabId, worktreeId are session-scoped and do NOT rotate
 * on Orca restart, so callers continue to read those from process.env.
 */
let endpointFileOk = true;
function readEndpointFile(): Record<string, string> {
	const endpointPath = process.env.ORCA_AGENT_HOOK_ENDPOINT;
	if (!endpointPath) return {};
	if (!endpointFileOk) return {};
	try {
		const contents = fs.readFileSync(endpointPath, "utf8");
		const out: Record<string, string> = {};
		for (const line of contents.split(/\r?\n/)) {
			const m = line.match(/^(?:set\s+)?([A-Z0-9_]+)=(.*)$/);
			if (m) out[m[1]] = m[2].replace(/\r$/, "");
		}
		return out;
	} catch (err: unknown) {
		const code = (err as { code?: string } | null)?.code;
		if (code !== "ENOENT") endpointFileOk = false;
		return {};
	}
}

function resolveHookCoords() {
	const fileEnv = readEndpointFile();
	return {
		port: fileEnv.ORCA_AGENT_HOOK_PORT || process.env.ORCA_AGENT_HOOK_PORT,
		token: fileEnv.ORCA_AGENT_HOOK_TOKEN || process.env.ORCA_AGENT_HOOK_TOKEN,
		env: fileEnv.ORCA_AGENT_HOOK_ENV || process.env.ORCA_AGENT_HOOK_ENV || "",
		version: fileEnv.ORCA_AGENT_HOOK_VERSION || process.env.ORCA_AGENT_HOOK_VERSION || "",
	};
}

/**
 * Signal Orca the agent is blocked on user input (or released). No-op outside
 * an Orca pane; fire-and-forget with a 1s abort. Why: Pi's questionnaire is not in Orca's ask_user_question
 * recognize-list, so a synthetic ask_user_question tool_call drives Orca's pi
 * state machine working → blocked; tool_execution_end drives blocked → working.
 * Reads endpoint.env so the post survives Orca restarts that rotate the hook
 * port/token.
 */
function postOrcaBlocked(active: boolean, label?: string): void {
	const paneKey = process.env.ORCA_PANE_KEY;
	const coords = resolveHookCoords();
	if (!paneKey || !coords.port || !coords.token) return;
	const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
	const timeout = setTimeout(() => controller?.abort(), 1000);
	if (typeof timeout.unref === "function") timeout.unref();
	fetch(`http://127.0.0.1:${coords.port}/hook/pi`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Orca-Agent-Hook-Token": coords.token,
		},
		body: JSON.stringify({
			paneKey,
			launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN || "",
			tabId: process.env.ORCA_TAB_ID || "",
			worktreeId: process.env.ORCA_WORKTREE_ID || "",
			env: coords.env,
			version: coords.version,
			payload: {
				hook_event_name: active ? "tool_call" : "tool_execution_end",
				tool_name: "ask_user_question",
				...(active && label ? { tool_input: { label } } : {}),
			},
		}),
		...(controller ? { signal: controller.signal } : {}),
	}).then(() => {}, () => {}).finally(() => clearTimeout(timeout));
}

export default function (pi: ExtensionAPI): void {
	pi.on("ui_prompt_start", (event) => {
		postOrcaBlocked(true, event.title);
	});
	pi.on("ui_prompt_end", () => {
		postOrcaBlocked(false);
	});
}
