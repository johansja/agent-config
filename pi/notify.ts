/**
 * User-input block notification consumer.
 *
 * Subscribes to the `user-input:blocked` bus event and fires the ctx-less
 * transports; also re-emits `herdr:blocked` for the external herdr consumer.
 *
 * Glossary (canonical home for this contract):
 *   block               — a user-input pause; opened/closed in paired try/finally
 *   producer            — extension that opens a block (ai-permission-gate,
 *                         questionnaire). Producers inline the open/close pair:
 *                           open:  ctx.ui.setStatus(key, themedText)
 *                                  pi.events.emit("user-input:blocked",
 *                                      { active:true, label, status:{key,text} })
 *                           close: ctx.ui.setStatus(key, undefined)
 *                                  pi.events.emit("user-input:blocked",
 *                                      { active:false, statusKey:key })
 *                         No shared helper — keeping producers free of
 *                         repo-local imports leaves ai-permission-gate.ts
 *                         extraction-ready for a future standalone package.
 *                         The pair-invariant is enforced by convention across
 *                         two files; a third producer must copy the 4-line
 *                         pattern correctly.
 *   consumer            — this file; pi.events.on("user-input:blocked", …)
 *   transport           — delivery channel. TUI footer pill = producer-owned
 *                         (ctx-bound, set via ctx.ui.setStatus). OSC notify,
 *                         cmux sidebar pill, Orca POST, herdr re-emit =
 *                         consumer-owned (ctx-less, fired here).
 *   user-input:blocked  — neutral bus event. Payload:
 *                           { active:true,  label, status:{key,text} } on open
 *                           { active:false, statusKey }              on close
 *   herdr:blocked       — external contract event (consumer:
 *                         herdr-agent-state.ts, installed by herdr outside
 *                         this repo). Re-emitted here with {active,label}
 *                         on open and {active:false} on close so that
 *                         consumer is unchanged by this split.
 *
 * Transports fired per event:
 *   - terminal notification: `cmux notify` under cmux (routes to the cmux
 *     notification panel, dock badge, pane flash), else OSC 99/777.
 *     NOTE: fires unconditionally regardless of ctx.mode — pre-existing
 *     behavior preserved. Raw OSC in RPC mode could corrupt the JSON-RPC
 *     stream; that is an existing issue out of scope for this refactor.
 *   - herdr:blocked re-emit (so herdr tracks "agent paused on user input")
 *   - Orca blocked-state POST to /hook/pi (synthetic ask_user_question
 *     tool_call / tool_execution_end drives Orca's working↔blocked state)
 *   - cmux sidebar status pill via `cmux set-status`/`clear-status`
 *     (keyed by status.key; cmux only)
 *
 * Orca endpoint rotation: Orca rotates ORCA_AGENT_HOOK_PORT / _TOKEN on every
 * app restart and writes the current coords to endpoint.env (path in
 * ORCA_AGENT_HOOK_ENDPOINT, which does NOT rotate). postOrcaBlocked reads
 * endpoint.env first and falls back to process.env — using process.env alone
 * fails silently after Orca restarts because the inherited env points at a
 * dead port and a rejected token. Mirrors orca-agent-status.ts.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Status spec carried in user-input:blocked payload for the cmux sidebar pill. */
export interface StatusSpec {
	/** Stable key for the status slot, e.g. "ai-permission-gate". */
	key: string;
	/** Short text shown in the cmux sidebar while the block is open. */
	text: string;
}

/** user-input:blocked event payload. Mirrors producer emit. */
export interface UserInputBlockedEvent {
	active: boolean;
	/** Label for the notification + herdr re-emit (open only). */
	label?: string;
	/** cmux sidebar pill spec (open only). */
	status?: StatusSpec;
	/** cmux sidebar pill key to clear (close only). */
	statusKey?: string;
}

/**
 * Fire a terminal notification. Under cmux (CMUX_SURFACE_ID set) this shells
 * out to `cmux notify` so it routes through cmux's notification panel, dock
 * badge, and pane flash instead of a raw escape sequence that cmux may
 * suppress. Falls back to direct OSC bytes on spawn failure or when not
 * under cmux.
 *   - OSC 99: Kitty
 *   - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode (default)
 */
function notifyOsc(title: string, body: string): void {
	if (process.env.KITTY_WINDOW_ID) {
		process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
		process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
	} else {
		process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
	}
}

function notify(title: string, body: string): void {
	if (process.env.CMUX_SURFACE_ID) {
		try {
			const child = spawn("cmux", ["notify", "--title", title, "--body", body], {
				stdio: "ignore",
				detached: true,
			});
			child.on("error", () => notifyOsc(title, body));
			child.unref();
			return;
		} catch {
			// Fall through to OSC if spawn itself threw
		}
	}
	notifyOsc(title, body);
}

/**
 * Set a cmux sidebar status pill. Best-effort fire-and-forget: silently no-ops
 * when not under cmux (CMUX_SURFACE_ID unset) or if the spawn fails. Each
 * extension manages its own pill via a unique key, so this never collides with
 * cmux's bundled hook-driven pill or other extensions' pills. cmux clears the
 * pill on close via cmuxClearStatus with the same key. `hourglass` is the
 * cmux Waiting convention.
 */
function cmuxSetStatus(spec: StatusSpec): void {
	if (!process.env.CMUX_SURFACE_ID) return;
	try {
		const child = spawn("cmux", ["set-status", spec.key, spec.text, "--icon", "hourglass"], {
			stdio: "ignore",
			detached: true,
		});
		child.on("error", () => {});
		child.unref();
	} catch {
		// Silent: sidebar pill is best-effort
	}
}

/** Clear a cmux sidebar status pill previously set by cmuxSetStatus. */
function cmuxClearStatus(key: string): void {
	if (!process.env.CMUX_SURFACE_ID) return;
	try {
		const child = spawn("cmux", ["clear-status", key], {
			stdio: "ignore",
			detached: true,
		});
		child.on("error", () => {});
		child.unref();
	} catch {
		// Silent
	}
}

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
 * an Orca pane; fire-and-forget with a 1s abort — same contract as cmux/herdr.
 * Why: Pi's questionnaire/ai-permission-gate are not in Orca's ask_user_question
 * recognize-list, so a synthetic ask_user_question tool_call drives Orca's pi
 * state machine working → blocked; tool_execution_end drives blocked → working.
 * Mirrors orca-agent-status.ts's POST shape to /hook/pi and reads the same
 * endpoint.env so the post survives Orca restarts that rotate the hook port/token.
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

export default function (pi: ExtensionAPI) {
	pi.events.on("user-input:blocked", (data: unknown) => {
		const evt = data as UserInputBlockedEvent | undefined;
		if (!evt) return;
		if (evt.active) {
			notify("Pi", evt.label ?? "Awaiting input");
			pi.events.emit("herdr:blocked", { active: true, label: evt.label });
			postOrcaBlocked(true, evt.label);
			if (evt.status) cmuxSetStatus(evt.status);
		} else {
			pi.events.emit("herdr:blocked", { active: false });
			postOrcaBlocked(false);
			if (evt.statusKey) cmuxClearStatus(evt.statusKey);
		}
	});
}
