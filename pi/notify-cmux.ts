/**
 * cmux notification + sidebar-status consumer for blocking UI prompts.
 *
 * Subscribes to pi's core `ui_prompt_start`/`ui_prompt_end` — fired around
 * every blocking ctx.ui prompt (permission gates, questionnaires, any
 * extension UI) — and, when running under cmux
 * (`CMUX_SURFACE_ID` set), fires `cmux notify` (routes to cmux's notification
 * panel, dock badge, pane flash) and manages a cmux sidebar status pill via
 * `cmux set-status` / `clear-status` under this consumer's own key.
 *
 * No-op outside cmux — `notify-osc.ts` owns terminal notification there.
 * Spawn failures are silent: OSC (notify-osc.ts) is the independent fallback
 * outside cmux, so under cmux a `cmux notify` spawn failure just means no
 * terminal notification for that one event.
 *
 * Split from the former `notify.ts` (one consumer per transport).
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Status spec for the cmux sidebar pill. */
interface StatusSpec {
	/** Stable key for the status slot. */
	key: string;
	/** Short text shown in the cmux sidebar while the block is open. */
	text: string;
}

/**
 * Pill key owned by this consumer. Core ui_prompt events coalesce nested
 * prompts into one outer span, so set-on-start / clear-on-end with a single
 * constant key stays balanced.
 */
const STATUS_KEY = "pi-ui-prompt";

/** Fire `cmux notify`. Silent on spawn failure. No-op outside cmux. */
function notifyCmux(title: string, body: string): void {
	if (!process.env.CMUX_SURFACE_ID) return;
	try {
		const child = spawn("cmux", ["notify", "--title", title, "--body", body], {
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
 * Set a cmux sidebar status pill. Best-effort fire-and-forget: silently no-ops
 * when not under cmux or if the spawn fails. Each extension manages its own
 * pill via a unique key, so this never collides with cmux's bundled
 * hook-driven pill or other extensions' pills. cmux clears the pill on close
 * via cmuxClearStatus with the same key. `hourglass` is the cmux Waiting
 * convention.
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

export default function (pi: ExtensionAPI): void {
	pi.on("ui_prompt_start", (event) => {
		// cmux surface only; OSC (notify-osc.ts) handles terminal notification
		// outside cmux.
		if (!process.env.CMUX_SURFACE_ID) return;
		notifyCmux("Pi", event.title ?? "Awaiting input");
		cmuxSetStatus({ key: STATUS_KEY, text: event.title ?? "waiting" });
	});
	pi.on("ui_prompt_end", () => {
		if (!process.env.CMUX_SURFACE_ID) return;
		cmuxClearStatus(STATUS_KEY);
	});
}
