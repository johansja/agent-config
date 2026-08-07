/**
 * herdr re-emit consumer for `user-input:blocked`.
 *
 * Subscribes to `user-input:blocked` and re-emits it as `herdr:blocked` (open:
 * {active:true, label}; close: {active:false}) so the external herdr consumer
 * (herdr-agent-state.ts, installed by herdr outside this repo) tracks "agent
 * paused on user input".
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

export default function (pi: ExtensionAPI): void {
	pi.events.on("user-input:blocked", (data: unknown) => {
		const evt = data as UserInputBlockedEvent | undefined;
		if (!evt) return;
		if (evt.active) {
			pi.events.emit("herdr:blocked", { active: true, label: evt.label });
		} else {
			pi.events.emit("herdr:blocked", { active: false });
		}
	});
}
