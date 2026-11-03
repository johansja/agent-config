/**
 * OSC terminal notification consumer for blocking UI prompts.
 *
 * Subscribes to pi's core `ui_prompt_start` — fired around every blocking
 * ctx.ui prompt (select/confirm/input/editor/custom: permission gates,
 * questionnaires, any extension UI) — and fires OSC 99 (Kitty) / OSC 777
 * (Ghostty, iTerm2, WezTerm, rxvt-unicode) terminal notifications on open.
 *
 * Split from the former `notify.ts` (one consumer per transport).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
	pi.on("ui_prompt_start", (event) => {
		notifyOsc("Pi", event.title ?? "Awaiting input");
	});
}
