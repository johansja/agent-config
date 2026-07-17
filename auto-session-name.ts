/**
 * Auto Session Name Extension
 *
 * Automatically generates a short, human-readable name for each new session
 * after the first user/assistant exchange completes — similar to opencode's
 * auto-naming. The name appears in /resume and `pi -r` instead of the
 * first-message preview.
 *
 * Behavior:
 *   - Fires once per session, on the first `agent_settled` event (i.e. after
 *     the initial exchange — including tool calls, retries, and any auto-
 *     compaction — has fully completed).
 *   - Only names brand-new sessions: at `session_start`, if the branch has
 *     zero prior user messages, we consider it fresh. Resumed (`pi -c`,
 *     `/resume`) and forked sessions already have prior turns and are left
 *     alone, to avoid surprising mid-session renames.
 *   - Skips if a name is already set (via `/name`, `--name`, or another
 *     extension).
 *   - Skips ephemeral sessions (`--no-session` / no session file).
 *   - Silently skips on any error (model unavailable, auth missing, API
 *     failure, empty/parse-failed response). Set `PI_AUTO_SESSION_NAME_DEBUG=1`
 *     to surface diagnostics to stderr and the TUI.
 *
 * Configuration (precedence: env var > settings.json > default):
 *
 *   ~/.pi/agent/settings.json "autoSessionName" block (global only, mirroring
 *   the permissionGate pattern in ai-permission-gate.ts):
 *     {
 *       "autoSessionName": {
 *         "model": "bitdeerai/MiniMaxAI/MiniMax-M2.5",
 *         "maxChars": 60,
 *         "timeout": 15000,
 *         "disabled": false
 *       }
 *     }
 *
 *   Environment variables (override settings.json):
 *   PI_AUTO_SESSION_NAME_MODEL     - Model for naming. Accepts "provider/modelId"
 *                                    (e.g. "bitdeerai/MiniMaxAI/MiniMax-M2.5")
 *                                    or a bare model id matched across providers.
 *                                    Default: the session's current model (ctx.model).
 *   PI_AUTO_SESSION_NAME_DISABLED  - "1"/"true"/"yes" disables the extension.
 *   PI_AUTO_SESSION_NAME_DEBUG     - "1"/"true"/"yes" logs diagnostics to stderr
 *                                    and emits ui.notify on naming/error.
 *                                    (env-only; not in settings.json)
 *   PI_AUTO_SESSION_NAME_MAX_CHARS - Truncate generated name to N chars (default 60).
 *   PI_AUTO_SESSION_NAME_TIMEOUT   - LLM call timeout in ms (default 15000).
 *
 * Install:
 *   ln -sf ~/projects/pi-extensions/auto-session-name.ts \
 *      ~/.pi/agent/extensions/auto-session-name.ts
 *
 * Test:
 *   node --test auto-session-name.test.mjs
 */

import {
	SettingsManager,
	type ExtensionAPI,
	type ExtensionContext,
	type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { Model, Api, Context } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// Types (structural, to avoid deep imports into pi internals)
// ---------------------------------------------------------------------------

type ContentBlock = {
	type?: string;
	text?: string;
};

type SessionEntry = {
	type: string;
	message?: {
		role?: string;
		content?: unknown;
	};
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CHARS = 60;
const DEFAULT_TIMEOUT_MS = 15_000;

interface Config {
	modelSpec: string | undefined;
	disabled: boolean;
	debug: boolean;
	maxChars: number;
	timeoutMs: number;
}

function isTruthyEnv(v: string | undefined): boolean {
	return v === "1" || v === "true" || v === "yes";
}

/**
 * Read the "autoSessionName" block from the global settings.json. Returns the
 * block as a plain object, or undefined if unset/malformed. Mirrors the
 * permissionGate read pattern in ai-permission-gate.ts (global settings only;
 * project-local settings.json is not honored, matching that extension).
 */
function readSettingsBlock(cwd: string, agentDir: string): Record<string, unknown> | undefined {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
	const block = globalSettings.autoSessionName;
	if (block && typeof block === "object" && !Array.isArray(block)) {
		return block as Record<string, unknown>;
	}
	return undefined;
}

/**
 * Load config with precedence: env var > settings.json > default.
 * `debug` is env-only (diagnostic flag, not a persistent setting).
 */
function loadConfig(cwd: string): Config {
	const settings = readSettingsBlock(cwd, `${process.env.HOME}/.pi/agent`);

	const modelSpec = process.env.PI_AUTO_SESSION_NAME_MODEL?.trim()
		|| (typeof settings?.model === "string" ? settings.model.trim() : undefined)
		|| undefined;

	const disabledFromSettings = typeof settings?.disabled === "boolean" ? settings.disabled : false;

	const maxCharsRaw = parseInt(process.env.PI_AUTO_SESSION_NAME_MAX_CHARS ?? "", 10);
	const maxCharsFromSettings = typeof settings?.maxChars === "number" ? settings.maxChars : undefined;
	const maxChars = Number.isNaN(maxCharsRaw)
		? (maxCharsFromSettings ?? DEFAULT_MAX_CHARS)
		: maxCharsRaw;

	const timeoutRaw = parseInt(process.env.PI_AUTO_SESSION_NAME_TIMEOUT ?? "", 10);
	const timeoutFromSettings = typeof settings?.timeout === "number" ? settings.timeout : undefined;
	const timeoutMs = Number.isNaN(timeoutRaw)
		? (timeoutFromSettings ?? DEFAULT_TIMEOUT_MS)
		: timeoutRaw;

	return {
		modelSpec,
		disabled: isTruthyEnv(process.env.PI_AUTO_SESSION_NAME_DISABLED) || disabledFromSettings,
		debug: isTruthyEnv(process.env.PI_AUTO_SESSION_NAME_DEBUG),
		maxChars,
		timeoutMs,
	};
}

// ---------------------------------------------------------------------------
// Pure helpers (these are unit-tested via auto-session-name.test.mjs)
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a message's content (string or content-block array).
 * Returns the concatenated text, or "" if no text blocks are present.
 */
function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}
	return parts.join("\n");
}

/**
 * Count user messages in a list of session entries. Used to detect whether
 * a session is brand-new (0 prior user messages) at session_start time.
 */
function countUserMessages(entries: SessionEntry[]): number {
	let count = 0;
	for (const entry of entries) {
		if (entry.type === "message" && entry.message?.role === "user") {
			count++;
		}
	}
	return count;
}

/**
 * Build the naming input from session entries: the first user prompt and the
 * first assistant reply. Both are truncated to keep the LLM call cheap.
 * Returns null if there is no user message or no assistant message yet.
 */
function buildConversationInput(
	entries: SessionEntry[],
	maxPerMessage = 800,
): { user: string; assistant: string } | null {
	let userText = "";
	let assistantText = "";
	let sawUser = false;
	let sawAssistant = false;

	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message?.role) continue;
		const role = entry.message.role;

		if (role === "user" && !sawUser) {
			const text = extractText(entry.message.content).trim();
			if (text) {
				sawUser = true;
				userText = text.slice(0, maxPerMessage);
			}
		} else if (role === "assistant" && !sawAssistant) {
			const text = extractText(entry.message.content).trim();
			if (text) {
				sawAssistant = true;
				assistantText = text.slice(0, maxPerMessage);
			}
		}

		if (sawUser && sawAssistant) break;
	}

	if (!sawUser || !sawAssistant) return null;
	return { user: userText, assistant: assistantText };
}

const SYSTEM_PROMPT = [
	"You generate a short title that summarizes a coding-agent conversation.",
	"The title will be shown in a session picker alongside many other titles,",
	"so it must be concise and distinctive.",
	"",
	"Rules:",
	"- 3 to 6 words.",
	"- Plain text. No quotes, no trailing punctuation, no emoji.",
	"- Lowercase unless a word is a proper noun (a library, framework, file",
	"  name, or brand).",
	"- Describe the task or topic, not the conversation meta",
	"  (avoid \"chat about\", \"session for\", \"help with\").",
	"- Prefer concrete nouns from the user's request (file paths, feature",
	"  names, error messages).",
	"",
	"Reply with the title only.",
].join("\n");

function buildUserPrompt(user: string, assistant: string): string {
	return [
		"Generate a short title for this coding-agent conversation.",
		"",
		"User:",
		user,
		"",
		"Assistant (first reply):",
		assistant,
		"",
		"Reply with the title only. No explanation, no quotes, no punctuation.",
	].join("\n");
}

/**
 * Sanitize the model's title response into a valid session name:
 *   - strip thinking-model reasoning blocks (think tags) emitted inline
 *     in text by some providers like Minimax/DeepSeek/Qwen; if a think
 *     block is opened but never closed, return "" so the caller skips
 *     naming
 *   - strip markdown code fences
 *   - strip surrounding quotes (single, double, backtick, guillemet)
 *   - collapse internal whitespace (including newlines) to single spaces
 *   - strip trailing punctuation (. ! ?)
 *   - truncate to maxChars at a word boundary
 * Returns "" if nothing usable remains.
 */
function sanitizeTitle(raw: string, maxChars: number): string {
	// Strip thinking-model reasoning blocks. Built via concatenation so the
	// source has no literal think-tag sequence (avoids tooling/transport issues).
	const THINK_OPEN = "<" + "think>";
	const THINK_CLOSE = "<" + "/think>";

	let text = raw;
	const lastClose = text.lastIndexOf(THINK_CLOSE);
	if (lastClose !== -1) {
		// Model emitted reasoning then a final answer — take only the answer.
		text = text.slice(lastClose + THINK_CLOSE.length);
	} else if (text.includes(THINK_OPEN)) {
		// Think block opened but never closed — model was truncated mid-
		// reasoning. Return "" so the caller skips naming rather than persist
		// reasoning text as the session name.
		return "";
	}

	text = text.trim();

	// Strip markdown code fences: ``` ... ``` or ```text ... ```
	text = text.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
	// Strip leading/trailing quotes (single, double, backtick, guillemet)
	text = text.replace(/^["'`«»“”]+|["'`«»“”]+$/g, "");
	// Collapse internal whitespace (including newlines) to single spaces
	text = text.replace(/\s+/g, " ").trim();
	// Strip trailing sentence punctuation
	text = text.replace(/[.!?]+$/, "");

	if (!text) return "";
	if (text.length > maxChars) {
		const cut = text.slice(0, maxChars);
		const lastSpace = cut.lastIndexOf(" ");
		text = (lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
	}
	return text;
}

// ---------------------------------------------------------------------------
// Model resolution (mirrors ai-permission-gate.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve a model from a "provider/modelId" or bare-id spec.
 * Returns undefined if no spec is provided (caller falls back to ctx.model).
 * Throws if the spec is provided but matches no model (or is ambiguous).
 */
async function resolveModel(
	modelSpec: string | undefined,
	modelRegistry: ModelRegistry,
): Promise<Model<Api> | undefined> {
	if (!modelSpec) return undefined;

	const slashIdx = modelSpec.indexOf("/");
	if (slashIdx !== -1) {
		const provider = modelSpec.slice(0, slashIdx);
		const modelId = modelSpec.slice(slashIdx + 1);
		const model = modelRegistry.find(provider, modelId);
		if (!model) {
			throw new Error(
				`Model not found: ${modelSpec}. Available: ${modelRegistry
					.getAvailable()
					.map((m) => `${m.provider}/${m.id}`)
					.join(", ")}`,
			);
		}
		return model;
	}

	const available = modelRegistry.getAvailable();
	const exact = available.find((m) => m.id === modelSpec);
	if (exact) return exact;

	const partials = available.filter(
		(m) =>
			m.id.toLowerCase().includes(modelSpec.toLowerCase()) ||
			(m.name && m.name.toLowerCase().includes(modelSpec.toLowerCase())),
	);
	if (partials.length === 1) return partials[0];
	if (partials.length > 1) {
		throw new Error(
			`Ambiguous model "${modelSpec}": ${partials
				.map((m) => `${m.provider}/${m.id}`)
				.join(", ")}. Use provider/modelId format.`,
		);
	}
	throw new Error(
		`Model not found: ${modelSpec}. Available: ${available
			.map((m) => `${m.provider}/${m.id}`)
			.join(", ")}`,
	);
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

/**
 * Ask the model for a short session title. Returns the raw response text
 * (un-sanitized). Throws on timeout, abort, or empty response.
 */
async function generateTitle(
	model: Model<Api>,
	apiKey: string | undefined,
	user: string,
	assistant: string,
	timeoutMs: number,
	signal: AbortSignal | undefined,
): Promise<string> {
	const context: Context = {
		systemPrompt: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: buildUserPrompt(user, assistant),
				timestamp: Date.now(),
			},
		],
	};

	const timeoutController = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		timeoutController.abort();
	}, timeoutMs);

	const onAbort = () => timeoutController.abort();
	if (signal) {
		if (signal.aborted) timeoutController.abort();
		else signal.addEventListener("abort", onAbort, { once: true });
	}

	try {
		const response = await completeSimple(model, context, {
			apiKey,
			signal: timeoutController.signal,
		});

		const raw = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("")
			.trim();

		if (!raw) throw new Error("model returned empty response");
		return raw;
	} catch (err) {
		if (timedOut) throw new Error(`model call timed out after ${timeoutMs}ms`);
		if (signal?.aborted) throw new Error("model call aborted");
		throw err;
	} finally {
		clearTimeout(timer);
		if (signal) signal.removeEventListener("abort", onAbort);
	}
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function debugLog(msg: string): void {
	if (isTruthyEnv(process.env.PI_AUTO_SESSION_NAME_DEBUG)) {
		console.error(`[auto-session-name] ${msg}`);
	}
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	// In-process guard: ensures we only attempt to name once per session load,
	// regardless of how many agent_settled events fire. Set to true at
	// session_start for sessions we will never name (disabled, already-named,
	// or resumed/continued with prior turns), and at the first agent_settled
	// for fresh sessions (one-shot, even on failure).
	let namingAttempted = false;

	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		namingAttempted = false;

		const config = loadConfig(ctx.cwd);
		if (config.disabled) {
			namingAttempted = true;
			debugLog("disabled via env, will not name");
			return;
		}

		// Already-named sessions: never attempt (user set a name via /name,
		// --name, or another extension).
		const existingName = pi.getSessionName();
		if (existingName) {
			namingAttempted = true;
			debugLog(`session already named: ${existingName}`);
			return;
		}

		// Resumed/continued sessions have prior user messages in the branch.
		// Only name brand-new sessions (0 prior user messages at session_start).
		// This distinguishes `pi` (fresh) from `pi -c` (continued) even though
		// both fire session_start with reason "startup".
		const entries = ctx.sessionManager.getBranch() as SessionEntry[];
		const priorUserMsgs = countUserMessages(entries);
		if (priorUserMsgs > 0) {
			namingAttempted = true;
			debugLog(`session has ${priorUserMsgs} prior user messages, not fresh, will not name`);
		} else {
			debugLog("fresh session, will name after first exchange");
		}
	});

	pi.on("agent_settled", async (_event, ctx: ExtensionContext) => {
		if (namingAttempted) return;
		// One-shot: never retry even on LLM failure, to avoid spamming.
		namingAttempted = true;

		const config = loadConfig(ctx.cwd);

		// Re-check name in case user ran /name between session_start and now.
		if (pi.getSessionName()) {
			debugLog(`session named during first turn: ${pi.getSessionName()}`);
			return;
		}

		// Ephemeral session (--no-session)? Nothing to persist the name to.
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) {
			debugLog("no session file (ephemeral), skipping");
			return;
		}

		// Need a first user + first assistant exchange to name from.
		const entries = ctx.sessionManager.getBranch() as SessionEntry[];
		const convo = buildConversationInput(entries);
		if (!convo) {
			debugLog("no user+assistant exchange in branch, skipping");
			return;
		}

		try {
			const model = (await resolveModel(config.modelSpec, ctx.modelRegistry)) ?? ctx.model;
			if (!model) {
				throw new Error(
					"no model available — set PI_AUTO_SESSION_NAME_MODEL or configure a default model",
				);
			}

			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				throw new Error(`no API key for ${model.provider}/${model.id}: ${auth.error}`);
			}

			debugLog(`naming with ${model.provider}/${model.id}`);
			const rawTitle = await generateTitle(
				model,
				auth.apiKey,
				convo.user,
				convo.assistant,
				config.timeoutMs,
				ctx.signal,
			);
			const title = sanitizeTitle(rawTitle, config.maxChars);
			if (!title) {
				throw new Error("sanitized title was empty");
			}

			pi.setSessionName(title);
			debugLog(`named session: ${title}`);
			if (config.debug && ctx.hasUI) {
				ctx.ui.notify(`Session named: ${title}`, "info");
			}
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			debugLog(`naming failed: ${detail}`);
			if (config.debug && ctx.hasUI) {
				ctx.ui.notify(`Auto session name failed: ${detail}`, "warning");
			}
		}
	});
}
