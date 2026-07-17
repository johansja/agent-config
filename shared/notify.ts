/**
 * Shared blocking helpers for extensions that pause the agent waiting for user input.
 *
 * Used by ai-permission-gate (permission prompts) and questionnaire (multi-question
 * UI). Each block-start pairs with exactly one block-end via the caller's try/finally
 * or .finally(), and all three transports fire together, so a producer cannot forget
 * one and silently desync:
 *   - OSC terminal notification (best-effort out-of-band signal)
 *   - herdr:blocked event (so herdr tracks "agent paused on user input")
 *   - TUI status-bar indicator (in-band footer label while the block is open)
 *
 * Pass `ctx` and `status` to blockStart (and `ctx`/`statusKey` to blockEnd) to enable
 * the status indicator; omit them for notify+herdr only.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Status colors supported by pi's theme.fg(). */
type StatusColor = "accent" | "muted" | "dim" | "warning" | "success";

/** Status indicator spec passed to blockStart. */
export interface StatusSpec {
	/** Stable key for the status slot, e.g. "ai-permission-gate". */
	key: string;
	/** Short text shown in the footer while the block is open. */
	text: string;
	/** Theme color name; defaults to "accent". */
	color?: StatusColor;
}

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
 * Set a TUI status-bar indicator. Best-effort: silently no-ops if ctx.ui or
 * setStatus is unavailable (non-interactive mode, older pi, headless tests), or
 * if the theme proxy throws before initTheme (pi-web). Guards modeled on
 * ponytail's syncStatus.
 */
function setStatus(ctx: ExtensionContext | undefined, spec: StatusSpec): void {
	try {
		if (!ctx?.ui?.setStatus) return;
		let theme;
		try {
			theme = ctx.ui.theme;
			if (!theme?.fg) return;
		} catch {
			return;
		}
		ctx.ui.setStatus(spec.key, theme.fg(spec.color ?? "accent", spec.text));
	} catch {
		// Silent: status is best-effort, never block the extension
	}
}

/** Clear a TUI status-bar indicator previously set by setStatus. */
function clearStatus(ctx: ExtensionContext | undefined, key: string): void {
	try {
		ctx?.ui?.setStatus?.(key, undefined);
	} catch {
		// Silent
	}
}

/**
 * Begin a user-input block: fire the terminal notification, emit
 * herdr:blocked active:true, and set the TUI status indicator — all from one
 * call, so no transport can be forgotten. Caller MUST call blockEnd exactly
 * once (in a finally clause) to release the blocked state and clear the status.
 */
export function blockStart(
	pi: ExtensionAPI,
	ctx: ExtensionContext | undefined,
	label: string,
	status?: StatusSpec,
): void {
	notify("Pi", label);
	emitBlocked(pi, true, label);
	if (ctx && status) setStatus(ctx, status);
}

/**
 * End a user-input block: emit herdr:blocked active:false and clear the TUI
 * status indicator if a status key was given. Pair with blockStart in
 * try/finally or .finally() so the state is always released on submit,
 * cancel, or error.
 */
export function blockEnd(
	pi: ExtensionAPI,
	ctx?: ExtensionContext,
	statusKey?: string,
): void {
	emitBlocked(pi, false);
	if (ctx && statusKey) clearStatus(ctx, statusKey);
}
