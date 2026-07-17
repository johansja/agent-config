/**
 * AI Permission Gate Extension
 *
 * Uses the pi-ai completeSimple() API to classify bash commands and MCP tool calls
 * by risk level and require user confirmation before executing potentially harmful ones.
 *
 * Instead of maintaining a long list of regex patterns, this extension
 * asks a fast, cheap model to judge each command. The LLM returns a
 * structured verdict with a risk level and explanation.
 *
 * CWD-Aware Classification:
 *   The current working directory (CWD) is passed to the LLM via both
 *   the system prompt guidelines and the user prompt, enabling the LLM
 *   to treat project-local operations (e.g., rm -rf ./build, npm install)
 *   as less risky than system-wide equivalents. No post-check heuristics
 *   or risk-downgrading logic — the LLM makes CWD-aware judgments directly.
 *
 * Configuration (precedence: env var > settings.json > default):
 *
 *   ~/.pi/agent/settings.json "permissionGate" block:
 *     {
 *       "permissionGate": {
 *         "model": "anthropic/claude-sonnet-4-5",
 *         "blockLevel": "low",
 *         "maxTokens": 128,
 *         "temperature": 0,
 *         "timeout": 10000
 *       }
 *     }
 *
 *   Environment variables (override settings.json):
 *   PI_AI_PERM_GATE_MODEL       - Model for classification (format: "provider/modelId")
 *   PI_AI_PERM_GATE_BLOCK_LEVEL - Minimum risk level to block: "low" | "medium" | "high" (default: "low")
 *     "low"    = block on any risk (safest, most confirmations)
 *     "medium" = block on medium and high risk
 *     "high"   = only block on high risk (fewest confirmations)
 *   PI_AI_PERM_GATE_TIMEOUT     - Timeout in ms for the LLM call (default: 10000)
 *   PI_AI_PERM_GATE_FALLBACK    - What to do if LLM fails: "allow" | "block" | "confirm" (default: "confirm")
 *   PI_AI_PERM_GATE_MAX_TOKENS  - Maximum tokens for the LLM classification call (default: 128)
 *   PI_AI_PERM_GATE_TEMPERATURE - Sampling temperature for classification, e.g. 0 or 0.1 (optional)
 */

import {
	SettingsManager,
	type ExtensionAPI,
	type ExtensionContext,
	type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { completeSimple, type Model, type Api, type Context } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { blockStart, blockEnd } from "./shared/notify.ts";

// Risk levels, ordered from least to most severe
const RISK_LEVELS = ["safe", "low", "medium", "high"] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

interface Verdict {
	risk: RiskLevel;
	reason: string;
}

const SYSTEM_PROMPT = `You are a command safety classifier. You analyze shell commands and determine their risk level.

Respond with EXACTLY this JSON format and nothing else:
{"risk":"safe|low|medium|high","reason":"brief explanation"}

Risk levels:
- safe: Read-only or harmless operations (ls, cat, echo, pwd, which, node -v, git status, git log, etc.)
- low: Minor side effects that are easily reversible or low-impact, including CWD-scoped deletions and modifications (rm -rf ./build, rm -rf ./dist, rm ./temp.log, git add, git commit, npm install, pip install, mkdir ./dir, touch ./file, cp ./a ./b, mv ./a ./b, git checkout, git switch, git stash, kubectl get, kubectl describe, helm list, helm status)
- medium: Significant changes that could affect the system or data, including operations affecting paths outside CWD but not system-critical (rm -rf ../other-project, git push, kubectl apply, helm install, helm upgrade, npm publish, ALTER TABLE with WHERE, DELETE with WHERE, UPDATE with WHERE, docker rm, docker rmi, pip uninstall)
- high: Destructive, irreversible, or security-sensitive operations, including system-wide or irreversible operations, or operations outside CWD that affect system state (rm -rf /etc, sudo, DROP TABLE, TRUNCATE, DELETE without WHERE, UPDATE without WHERE, git push --force, kubectl delete, shutdown, reboot, mkfs, dd, iptables, chmod 777)

MCP tool call context:
- You may also be asked to analyze MCP (Model Context Protocol) tool calls
- MCP read/search/list/describe operations (e.g. web_search, web_fetch, search, list, get, describe) are generally safe or low risk
- MCP write/modify/create/send operations (e.g. create_issue, update, delete, send_notification, publish, apply) are at least medium risk
- MCP operations affecting production infrastructure or external systems (e.g. deploy, release, provision) are at least medium risk
- Destructive MCP operations (delete, remove, drop, terminate, purge, uninstall) are high risk
- Consider the target server: a notification server sending alerts is lower risk than a database server dropping tables

Working directory context:
- You will be given the current working directory (CWD)
- Commands whose effects are contained within the CWD are less risky than system-wide equivalents
- Deleting files/dirs under CWD (e.g., rm -rf ./build, rm -rf ./node_modules) is low risk — it only affects the project, not the system
- Modifying project-local files (e.g., ./src, ./config, ./data within CWD) is low risk
- Commands targeting paths outside CWD or system paths (/etc, /usr, /var, /opt, ~, /) retain their normal risk level
- Package installs (npm install, pip install) within CWD are low risk
- Docker/container operations that only affect project containers are medium risk (still affects runtime)

Important guidelines:
- Analyze the FULL command including all flags and arguments
- Consider chained commands (&&, ||, ;) - rate by the most dangerous segment
- Shell variable expansion and command substitution should raise suspicion slightly since content is unknown
- Piping data into destructive commands is high risk
- Commands that modify live infrastructure (k8s, databases) are at least medium
- When in doubt, rate one level higher rather than lower
- Be concise in your reason - one short sentence max`;

function riskLevelIndex(level: RiskLevel): number {
	return RISK_LEVELS.indexOf(level);
}

function truncateCommand(command: string, maxLines: number = 5): string {
	const lines = command.split("\n");
	if (lines.length <= maxLines) return command;
	return lines.slice(0, maxLines).join("\n") + "\n…";
}

function stripCodeFences(raw: string): string {
	let text = raw.trim();
	// Strip markdown code fences: ```json ... ``` or ``` ... ```
	text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
	return text.trim();
}

function parseVerdict(raw: string): Verdict {
	const cleaned = stripCodeFences(raw);
	try {
		const parsed = JSON.parse(cleaned);
		if (
			parsed &&
			typeof parsed.risk === "string" &&
			RISK_LEVELS.includes(parsed.risk as RiskLevel) &&
			typeof parsed.reason === "string"
		) {
			return parsed as Verdict;
		}
	} catch {
		// Try to extract JSON from the response in case the model added extra text
		const jsonMatch = cleaned.match(/\{[^{}]*"risk"[^{}]*"reason"[^{}]*\}/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[0]);
				if (
					parsed &&
					typeof parsed.risk === "string" &&
					RISK_LEVELS.includes(parsed.risk as RiskLevel) &&
					typeof parsed.reason === "string"
				) {
					return parsed as Verdict;
				}
			} catch {
				// fall through
			}
		}
	}
	return { risk: "medium", reason: "Could not parse LLM verdict" };
}

function logCommandDecision(
	command: string,
	risk: RiskLevel,
	blockLevel: RiskLevel,
	decision: "allowed" | "blocked" | "confirmed",
	reason?: string,
): void {
	const timestamp = new Date().toISOString();
	const entry = {
		timestamp,
		command,
		risk,
		blockLevel,
		decision,
		reason,
	};
	const logLine = JSON.stringify(entry) + "\n";

	const logFile = path.join(process.env.HOME || "/tmp", ".pi", "ai-permission-gate.jsonl");
	try {
		const dir = path.dirname(logFile);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.appendFileSync(logFile, logLine, { encoding: "utf-8" });
	} catch {
		// Silently fail if we can't write to log
	}
}

/**
 * Read the permissionGate.model setting from settings.json.
 * Returns undefined if not configured.
 */
function readPermissionGateModel(cwd: string, agentDir: string): string | undefined {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	// SettingsManager doesn't expose custom keys, so read the raw global settings
	const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
	const gate = globalSettings.permissionGate as Record<string, unknown> | undefined;
	if (gate && typeof gate.model === "string") {
		return gate.model;
	}
	return undefined;
}

/**
 * Read the permissionGate.blockLevel setting from settings.json.
 * Returns undefined if not configured or invalid.
 */
function readPermissionGateBlockLevel(cwd: string, agentDir: string): RiskLevel | undefined {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
	const gate = globalSettings.permissionGate as Record<string, unknown> | undefined;
	if (gate && typeof gate.blockLevel === "string" && RISK_LEVELS.includes(gate.blockLevel as RiskLevel)) {
		return gate.blockLevel as RiskLevel;
	}
	return undefined;
}

/**
 * Read the permissionGate.maxTokens setting from settings.json.
 * Returns undefined if not configured or not a number.
 */
function readPermissionGateMaxTokens(cwd: string, agentDir: string): number | undefined {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
	const gate = globalSettings.permissionGate as Record<string, unknown> | undefined;
	if (gate && typeof gate.maxTokens === "number") {
		return gate.maxTokens;
	}
	return undefined;
}

/**
 * Read the permissionGate.temperature setting from settings.json.
 * Returns undefined if not configured or not a number.
 */
function readPermissionGateTemperature(cwd: string, agentDir: string): number | undefined {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
	const gate = globalSettings.permissionGate as Record<string, unknown> | undefined;
	if (gate && typeof gate.temperature === "number") {
		return gate.temperature;
	}
	return undefined;
}

/**
 * Read the permissionGate.timeout setting from settings.json.
 * Returns undefined if not configured or not a number.
 */
function readPermissionGateTimeout(cwd: string, agentDir: string): number | undefined {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
	const gate = globalSettings.permissionGate as Record<string, unknown> | undefined;
	if (gate && typeof gate.timeout === "number") {
		return gate.timeout;
	}
	return undefined;
}

/**
 * Resolve a model from PI_AI_PERM_GATE_MODEL env var or settings.json.
 * Accepts "provider/modelId" format (e.g., "anthropic/claude-sonnet-4-5")
 * or a bare model id that's searched across providers.
 * Returns undefined if no model is configured (caller should fall back to ctx.model).
 */
async function resolveModel(
	modelSpec: string | undefined,
	modelRegistry: ModelRegistry,
): Promise<Model<Api> | undefined> {
	if (!modelSpec) return undefined;

	// Support "provider/modelId" format
	const slashIdx = modelSpec.indexOf("/");
	if (slashIdx !== -1) {
		const provider = modelSpec.slice(0, slashIdx);
		const modelId = modelSpec.slice(slashIdx + 1);
		const model = modelRegistry.find(provider, modelId);
		if (!model) {
			throw new Error(
				`Model not found: ${modelSpec}. Available models: ${modelRegistry.getAvailable().map((m) => `${m.provider}/${m.id}`).join(", ")}`,
			);
		}
		return model;
	}

	// Bare model id — search across all providers
	const available = modelRegistry.getAvailable();
	const exactMatch = available.find((m) => m.id === modelSpec);
	if (exactMatch) return exactMatch;

	// Partial/fuzzy match on model id or name
	const partialMatches = available.filter(
		(m) =>
			m.id.toLowerCase().includes(modelSpec.toLowerCase()) ||
			(m.name && m.name.toLowerCase().includes(modelSpec.toLowerCase())),
	);
	if (partialMatches.length === 1) return partialMatches[0];
	if (partialMatches.length > 1) {
		throw new Error(
			`Ambiguous model "${modelSpec}" matches: ${partialMatches.map((m) => `${m.provider}/${m.id}`).join(", ")}. Use provider/modelId format.`,
		);
	}

	throw new Error(
		`Model not found: ${modelSpec}. Available models: ${available.map((m) => `${m.provider}/${m.id}`).join(", ")}`,
	);
}

/**
 * Classify a tool operation using the pi-ai completeSimple() API.
 * Sends a single-shot LLM request with the safety classifier system prompt
 * and returns the parsed verdict.
 */
async function classifyCommand(
	command: string,
	cwd: string,
	model: Model<Api>,
	apiKey: string | undefined,
	timeout: number,
	signal: AbortSignal | undefined,
	options: { maxTokens?: number; temperature?: number },
): Promise<Verdict> {
	// Fallback to process CWD if ctx.cwd is missing
	if (!cwd) {
		cwd = process.cwd();
	}

	const context: Context = {
		systemPrompt: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `Analyze this operation for safety: ${command}\n\nCurrent working directory: \`${cwd}\``,
				timestamp: Date.now(),
			},
		],
	};

	// Apply timeout via a combined AbortController
	let timedOut = false;
	const timeoutController = new AbortController();

	const timer = setTimeout(() => {
		timedOut = true;
		timeoutController.abort();
	}, timeout);

	// Forward user's abort signal to the timeout controller
	const onAbort = () => timeoutController.abort();
	if (signal) {
		if (signal.aborted) {
			timeoutController.abort();
		} else {
			signal.addEventListener("abort", onAbort, { once: true });
		}
	}

	try {
		const response = await completeSimple(model, context, {
			...options,
			apiKey,
			signal: timeoutController.signal,
		});

		// Extract text from the assistant response
		let responseText = "";
		for (const part of response.content) {
			if (part.type === "text") {
				responseText += part.text;
			}
		}

		if (!responseText) {
			throw new Error("LLM classification returned empty response");
		}

		return parseVerdict(responseText);
	} catch (err) {
		if (timedOut) {
			throw new Error("LLM classification timed out");
		}
		if (signal?.aborted) {
			throw new Error("LLM classification aborted");
		}
		throw err;
	} finally {
		clearTimeout(timer);
		if (signal) {
			signal.removeEventListener("abort", onAbort);
		}
	}
}

interface ConfirmOptions {
	risk: RiskLevel | "unknown";
	notifyBody: string;
	promptTitle: string;
	promptBody: string;
	blockedLogReason: string;
	confirmedLogReason: string;
	blockReason: string;
}

/**
 * Notify + emit herdr:blocked + prompt the user to allow/deny an operation.
 * Wraps ctx.ui.select() in try/finally so the blocked state is always released
 * (user answer, abort, or error). Returns {block:true} on denial, undefined on allow.
 */
async function confirmWithUser(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	command: string,
	blockLevel: RiskLevel,
	opts: ConfirmOptions,
): Promise<{ block: true; reason: string } | undefined> {
	blockStart(pi, opts.notifyBody);
	try {
		const choice = await ctx.ui.select(
			`${opts.promptTitle}\n\n  ${truncateCommand(command)}\n\n${opts.promptBody}\n\nAllow?`,
			["Yes", "No"],
		);
		if (choice !== "Yes") {
			logCommandDecision(command, opts.risk, blockLevel, "blocked", opts.blockedLogReason);
			return { block: true, reason: opts.blockReason };
		}
		logCommandDecision(command, opts.risk, blockLevel, "confirmed", opts.confirmedLogReason);
		return undefined;
	} finally {
		blockEnd(pi);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		let command: string;
		if (event.toolName === "bash") {
			command = event.input.command as string;
			if (!command?.trim()) return undefined;
		} else if (event.toolName === "mcp") {
			const server = event.input.server as string;
			const tool = event.input.tool as string;
			const args = event.input.args as Record<string, unknown> | string | undefined;
			let argsStr: string;
			if (typeof args === "string") {
				argsStr = args;
			} else if (args && Object.keys(args).length > 0) {
				argsStr = JSON.stringify(args);
			} else {
				argsStr = "{}";
			}
			command = `MCP tool call: server="${server}", tool="${tool}", args=${argsStr}`;
		} else {
			return undefined;
		}

		// Load settings from environment variables
		const modelSpec = process.env.PI_AI_PERM_GATE_MODEL
			|| readPermissionGateModel(ctx.cwd, `${process.env.HOME}/.pi/agent`)
			|| undefined;
		const blockLevel = (process.env.PI_AI_PERM_GATE_BLOCK_LEVEL as RiskLevel)
			|| readPermissionGateBlockLevel(ctx.cwd, `${process.env.HOME}/.pi/agent`)
			|| "low";
		const timeoutSetting = readPermissionGateTimeout(ctx.cwd, `${process.env.HOME}/.pi/agent`);
		const timeoutRaw = parseInt(
			process.env.PI_AI_PERM_GATE_TIMEOUT || String(timeoutSetting ?? 10000),
			10,
		);
		const timeout = Number.isNaN(timeoutRaw) ? 10000 : timeoutRaw;
		const fallback = process.env.PI_AI_PERM_GATE_FALLBACK || "confirm";
		const maxTokensSetting = readPermissionGateMaxTokens(ctx.cwd, `${process.env.HOME}/.pi/agent`);
		const maxTokensRaw = parseInt(process.env.PI_AI_PERM_GATE_MAX_TOKENS || String(maxTokensSetting ?? 128), 10);
		const maxTokens = Number.isNaN(maxTokensRaw) ? 128 : maxTokensRaw;
		const temperatureSetting = readPermissionGateTemperature(ctx.cwd, `${process.env.HOME}/.pi/agent`);
		const temperatureRaw = process.env.PI_AI_PERM_GATE_TEMPERATURE
			? parseFloat(process.env.PI_AI_PERM_GATE_TEMPERATURE)
			: temperatureSetting;
		const temperature = temperatureRaw !== undefined && !Number.isNaN(temperatureRaw)
			? temperatureRaw
			: undefined;

		let verdict: Verdict;
		try {
			// Use env var model if specified, otherwise prefer a fast/cheap model,
			// falling back to the session's current model as last resort
			const model = (await resolveModel(modelSpec, ctx.modelRegistry)) ?? ctx.model;
			if (!model) {
				throw new Error("No model available for classification");
			}

			// Resolve API key via the session's model registry
			const authResult = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!authResult.ok) {
				throw new Error(`No API key for ${model.provider}/${model.id}: ${authResult.error}`);
			}

			verdict = await classifyCommand(command, ctx.cwd, model, authResult.apiKey, timeout, ctx.signal, {
				maxTokens,
				...(temperature !== undefined && { temperature }),
			});
		} catch (err) {
			// LLM call failed - log and use fallback strategy
			const errDetail = err instanceof Error ? err.message : String(err);
			console.error(`[ai-permission-gate] Classification failed: ${errDetail}`);
			if (ctx.hasUI) {
				ctx.ui.notify(`Permission gate error: ${errDetail}`, "error");
			}
			if (fallback === "allow") {
				logCommandDecision(command, "unknown", blockLevel, "allowed", "Fallback allow after LLM failure");
				return undefined;
			}
			if (fallback === "block") {
				logCommandDecision(command, "unknown", blockLevel, "blocked", "Fallback block after LLM failure");
				if (!ctx.hasUI) {
					return { block: true, reason: "Operation blocked: AI safety check failed" };
				}
				return {
					block: true,
					reason: "Operation blocked: AI safety check failed and fallback is set to block",
				};
			}
			// fallback === "confirm" - ask the user
			if (!ctx.hasUI) {
				logCommandDecision(command, "unknown", blockLevel, "allowed", "Fallback confirm without UI — allowed");
				return undefined; // can't confirm in non-interactive mode, allow
			}
			return confirmWithUser(pi, ctx, command, blockLevel, {
				risk: "unknown",
				notifyBody: "Permission gate: awaiting input",
				promptTitle: "AI safety check failed",
				promptBody: "The LLM could not classify this operation.",
				blockedLogReason: "Blocked by user (AI check failed)",
				confirmedLogReason: "User confirmed after AI check failed",
				blockReason: "Blocked by user (AI check failed)",
			});
		}

		// Check if the risk level meets the block threshold
		const blockThreshold = riskLevelIndex(blockLevel);
		const commandRisk = riskLevelIndex(verdict.risk);

		if (commandRisk >= blockThreshold && verdict.risk !== "safe") {
			if (!ctx.hasUI) {
				logCommandDecision(command, verdict.risk, blockLevel, "blocked", verdict.reason);
				return {
					block: true,
					reason: `Permission gate blocked this operation (risk: ${verdict.risk}): ${verdict.reason}. Do not retry or work around it. Report exactly what you needed to run and why to your caller, then stop.`,
				};
			}

			return confirmWithUser(pi, ctx, command, blockLevel, {
				risk: verdict.risk,
				notifyBody: `Permission gate: ${verdict.risk} risk operation`,
				promptTitle: `Potentially dangerous operation (${verdict.risk} risk)`,
				promptBody: verdict.reason,
				blockedLogReason: "Blocked by user",
				confirmedLogReason: verdict.reason,
				blockReason: "Blocked by user",
			});
		} else {
			logCommandDecision(command, verdict.risk, blockLevel, "allowed", verdict.reason);
		}

		return undefined;
	});
}
