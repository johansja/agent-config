/**
 * cmux notification + sidebar-status consumer for `user-input:blocked`.
 *
 * Subscribes to `user-input:blocked` and, when running under cmux
 * (`CMUX_SURFACE_ID` set), fires `cmux notify` (routes to cmux's notification
 * panel, dock badge, pane flash) and manages a cmux sidebar status pill via
 * `cmux set-status` / `clear-status` keyed by the producer's status key.
 *
 * No-op outside cmux — `notify-osc.ts` owns terminal notification there.
 * Spawn failures are silent: OSC (notify-osc.ts) is the independent fallback
 * outside cmux, so under cmux a `cmux notify` spawn failure just means no
 * terminal notification for that one event.
 *
 * Split from the former `notify.ts` (one consumer per transport). Payload
 * type duplicated structurally — no shared file (producers build payloads
 * inline by convention).
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Status spec carried in user-input:blocked payload for the cmux sidebar pill. */
interface StatusSpec {
	/** Stable key for the status slot, e.g. "my-extension". */
	key: string;
	/** Short text shown in the cmux sidebar while the block is open. */
	text: string;
}

/** user-input:blocked event payload (subset this consumer reads). */
interface UserInputBlockedEvent {
	active: boolean;
	label?: string;
	status?: StatusSpec;
	statusKey?: string;
}

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
	pi.events.on("user-input:blocked", (data: unknown) => {
		// cmux surface only; OSC (notify-osc.ts) handles terminal notification
		// outside cmux.
		if (!process.env.CMUX_SURFACE_ID) return;
		const evt = data as UserInputBlockedEvent | undefined;
		if (!evt) return;
		if (evt.active) {
			notifyCmux("Pi", evt.label ?? "Awaiting input");
			if (evt.status) cmuxSetStatus(evt.status);
		} else {
			if (evt.statusKey) cmuxClearStatus(evt.statusKey);
		}
	});
}
