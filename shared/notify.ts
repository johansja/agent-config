/**
 * Shared blocking helpers for extensions that pause the agent waiting for user input.
 *
 * Used by ai-permission-gate (permission prompts) and questionnaire (multi-question
 * UI). Each block-start pairs with exactly one block-end via the caller's try/finally
 * or .finally(), and both transports — OSC terminal notification and the herdr:blocked
 * event — fire together, so a producer cannot forget one and silently desync.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Fire a native terminal notification. Supports:
 * - OSC 99: Kitty
 * - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode (default)
 */
function notify(title: string, body: string): void {
	if (process.env.KITTY_WINDOW_ID) {
		process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
		process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
	} else {
		process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
	}
}

/**
 * Emit a herdr:blocked state change so herdr tracks "agent paused on user input".
 * Defensive: silently no-ops if pi.events is unavailable (e.g. herdr not installed,
 * or a future pi version without a shared EventBus). herdr maintains a counter,
 * so every active:true must pair with exactly one active:false.
 */
function emitBlocked(pi: ExtensionAPI, active: boolean, label?: string): void {
	try {
		pi.events?.emit?.("herdr:blocked", { active, label });
	} catch {
		// Silently ignore if the events bus is unavailable
	}
}

/**
 * Begin a user-input block: fire the terminal notification AND emit
 * herdr:blocked active:true with the same label. Caller MUST call blockEnd
 * exactly once (in a finally clause) to release the blocked state.
 */
export function blockStart(pi: ExtensionAPI, label: string): void {
	notify("Pi", label);
	emitBlocked(pi, true, label);
}

/**
 * End a user-input block: emit herdr:blocked active:false. Pair with blockStart
 * in try/finally or .finally() so the state is always released on submit,
 * cancel, or error.
 */
export function blockEnd(pi: ExtensionAPI): void {
	emitBlocked(pi, false);
}
