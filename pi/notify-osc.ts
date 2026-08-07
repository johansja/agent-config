/**
 * OSC terminal notification consumer for `user-input:blocked`.
 *
 * Subscribes to `user-input:blocked` and fires OSC 99 (Kitty) / OSC 777
 * (Ghostty, iTerm2, WezTerm, rxvt-unicode) terminal notifications on open.
 * No-op under cmux — `notify-cmux.ts` owns the cmux surface so OSC and cmux
 * don't double-fire. Outside cmux, OSC is the only terminal notification.
 *
 * Split from the former `notify.ts` (one consumer per transport). Payload
 * type duplicated structurally — no shared file (producers build payloads
 * inline by convention).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** user-input:blocked event payload (subset this consumer reads). */
interface UserInputBlockedEvent {
	active: boolean;
	label?: string;
}

/**
 * Fire a terminal notification via OSC.
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

export default function (pi: ExtensionAPI): void {
	pi.events.on("user-input:blocked", (data: unknown) => {
		// cmux owns the cmux surface (notify-cmux.ts fires `cmux notify`). No-op
		// here so the two don't double-fire; outside cmux OSC is the only path.
		if (process.env.CMUX_SURFACE_ID) return;
		const evt = data as UserInputBlockedEvent | undefined;
		if (!evt || !evt.active) return;
		notifyOsc("Pi", evt.label ?? "Awaiting input");
	});
}
