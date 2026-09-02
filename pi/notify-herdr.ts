/**
 * herdr re-emit consumer for blocking UI prompts.
 *
 * Subscribes to pi's core `ui_prompt_start`/`ui_prompt_end` — fired around
 * every blocking ctx.ui prompt (permission gates, questionnaires, any
 * extension UI) — and re-emits them as `herdr:blocked` (open:
 * {active:true, label}; close: {active:false}) so the external herdr consumer
 * (herdr-agent-state.ts, installed by herdr outside this repo) tracks "agent
 * paused on user input".
 *
 * Split from the former `notify.ts` (one consumer per transport).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
	pi.on("ui_prompt_start", (event) => {
		pi.events.emit("herdr:blocked", { active: true, label: event.title });
	});
	pi.on("ui_prompt_end", () => {
		pi.events.emit("herdr:blocked", { active: false });
	});
}
