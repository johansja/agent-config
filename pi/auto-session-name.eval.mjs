/**
 * Offline A/B evaluation harness for auto-session-name.
 *
 * Replays historical sessions through the OLD naming pipeline (input + prompt)
 * and the proposed NEW one, then reports deterministic metrics plus an
 * eyeball table. The extension itself is not modified by this script; helper
 * functions are imported from it verbatim via jiti so the replay cannot drift.
 *
 * Usage:
 *   BITDEERAI_API_KEY=... node pi/auto-session-name.eval.mjs
 *
 * Env:
 *   BITDEERAI_API_KEY   (required) gateway key
 *   EVAL_BASE_URL       default https://api-inference.bitdeer.ai/v1
 *   EVAL_MODEL          default: production naming model (autoSessionName.model in
 *                       ~/.pi/agent/settings.json, provider prefix stripped)
 *   EVAL_CONCURRENCY    default 3
 *   EVAL_OUT            results JSON path, default /tmp/auto-session-name-eval.json
 *   EVAL_ARMS           comma list of arm ids to run (default: all)
 *   EVAL_ONLY_INPUTS    "1" = build corpus + report input stats, no LLM calls
 *
 * Arms (2x2 attribution grid + word-cap sweep; R* suffix = prompt revision):
 *   A0       old input + old prompt           (replay baseline; maxChars 60)
 *   A1       old input + new prompt W8        (maxChars 80)
 *   A2       new input + old prompt           (maxChars 60)
 *   A3W6/W8/W10  new input + new prompt       (maxChars 60/80/100)
 *   A3W8R2   new input + W8 prompt revision 2 (skill-anchor, weak-ids, meta ban)
 *
 * Old input = buildConversationInput(entries): first user + first assistant
 * texts, 800 chars each (production function, verbatim).
 * New input = all turn-1 user+assistant texts concatenated, 4000-char budget,
 * head-truncated. Turn 1 = first user message up to (excluding) the second.
 *
 * Interpretation notes (learned from rounds 1-2):
 *   - The naming model runs at gateway default temperature, so single-run
 *     micro-diffs are noise (only 4/40 names byte-stable across 3 samples).
 *     Judge arms by metric aggregates and per-sample semantic stability
 *     (topic + identifier preservation), not one-off diffs.
 *   - Degenerate control-token output (e.g. <|open|>tools<|sep|>…call
 *     tool="write")
 *     occurs stochastically (~1 per ~120 calls) — flag it in results.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- extension imports via jiti (same mechanism as the .test.mjs) ----------
const PI_ROOT = process.env.PI_ROOT
	|| path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const { createJiti } = await import(path.join(PI_ROOT, "node_modules/jiti/lib/jiti.mjs"));
const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${PI_ROOT}/dist/index.js`,
		"@earendil-works/pi-ai": `${PI_ROOT}/node_modules/@earendil-works/pi-ai/dist/index.js`,
	},
});
const ext = await jiti.import(path.join(HERE, "auto-session-name.ts"));
const { extractText, sanitizeTitle } = ext;

// Frozen replica of the pre-revamp system prompt (used by A0/A2 baseline arms;
// the extension's exported SYSTEM_PROMPT is the new prompt). sanitizeTitle is
// shared across arms — its control-token guard changes nothing for normal
// titles, and flags rare degenerate output uniformly.
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

// Frozen replica of the pre-revamp input builder (first user + first assistant
// text, 800 chars each). The extension no longer exports it; A0/A1 stay pinned
// to the historical pipeline so results stay comparable across rounds.
function buildConversationInput(entries, maxPerMessage = 800) {
	let userText = "", assistantText = "", sawUser = false, sawAssistant = false;
	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message?.role) continue;
		const role = entry.message.role;
		if (role === "user" && !sawUser) {
			const t = extractText(entry.message.content).trim();
			if (t) { sawUser = true; userText = t.slice(0, maxPerMessage); }
		} else if (role === "assistant" && !sawAssistant) {
			const t = extractText(entry.message.content).trim();
			if (t) { sawAssistant = true; assistantText = t.slice(0, maxPerMessage); }
		}
		if (sawUser && sawAssistant) break;
	}
	if (!sawUser || !sawAssistant) return null;
	return { user: userText, assistant: assistantText };
}

// Verbatim replica of the extension's private buildUserPrompt (old-prompt arms).
function buildUserPromptOld(user, assistant) {
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

// --- proposed new prompt -----------------------------------------------------
function newSystemPrompt(wordCap, maxChars, inputKind) {
	const inputLine = inputKind === "turn"
		? "Input: the text of the conversation's first turn. It may contain injected"
		: "Input: the first user message and the first assistant reply. The user message may contain injected";
	return [
		"You generate a short title that summarizes a coding-agent conversation.",
		"The title is shown in a session picker alongside many other titles, so it must",
		"be concise and distinctive.",
		"",
		inputLine,
		"scaffolding (skill definitions, command templates) around the real request —",
		"title the user's actual request, never the scaffolding.",
		"",
		"Rules:",
		`- 3 to ${wordCap} words, under ${maxChars} characters.`,
		"- Plain text. No quotes, no trailing punctuation, no emoji.",
		"- Lowercase unless a word is a proper noun (library, framework, file name, brand).",
		"- If the request references an identifier — ticket id (AIC-3523), MR/PR/job",
		"  number, branch name — the title must include it.",
		"- Describe the task, not the conversation meta (no \"chat about\", \"session\",",
		"  \"grilling\", \"skill\").",
		"- Prefer concrete nouns: feature names, error messages, file paths.",
		"",
		"Examples of good titles:",
		"- review managed-kubernetes-platform MR 126",
		"- AIC-3523 spec writeback trace",
		"- fix failed gitlab CI job 314275",
		"- quartz migration decision (request arrived wrapped in a skill definition)",
		"",
		"Reply with the title only.",
	].join("\n");
}

// Round-2 revision: skill-anchor rule, weak-id coverage, hard meta-word ban.
function newSystemPromptV2(wordCap, maxChars) {
	return [
		"You generate a short title that summarizes a coding-agent conversation.",
		"The title is shown in a session picker alongside many other titles, so it must",
		"be concise and distinctive.",
		"",
		"Input: the text of the conversation's first turn. It may contain injected",
		"scaffolding (skill definitions, command templates) around the real request.",
		"When a <skill> or command block appears, the actual request follows it, after",
		"the closing tag — title that request, never the skill's own name.",
		"",
		"Rules:",
		`- 3 to ${wordCap} words, under ${maxChars} characters.`,
		"- Plain text. No quotes, no trailing punctuation, no emoji.",
		"- Lowercase unless a word is a proper noun (library, framework, file name, brand).",
		"- If the request references an identifier — ticket id (AIC-3523), issue/PR",
		"  number (#876), MR (!94), job number, branch name — the title must include it.",
		"- Describe the task, not the conversation meta. The words \"session\" and",
		"  \"grilling\" must not appear; use \"skill\" only when the task itself is",
		"  about a skill.",
		"- Prefer concrete nouns: feature names, error messages, file paths.",
		"",
		"Examples of good titles:",
		"- review managed-kubernetes-platform MR 126",
		"- AIC-3523 spec writeback trace",
		"- fix failed gitlab CI job 314275",
		"- review plan workflow duplication (the request followed a skill block; the",
		"  skill's own name was ignored)",
		"",
		"Reply with the title only.",
	].join("\n");
}

function buildUserPromptNewTurn(turnText) {
	return [
		"Generate a short title for this coding-agent conversation's first turn.",
		"",
		turnText,
		"",
		"Reply with the title only. No explanation, no quotes, no punctuation.",
	].join("\n");
}

// --- corpus extraction ---------------------------------------------------------
const SESSIONS_ROOT = path.join(process.env.HOME, ".pi/agent/sessions");
const NEW_INPUT_BUDGET = 4000;
const TARGETS = { skill: 10, cluster: 15, random: 15 };

const AUTOMATION_NAME = /^(orchestrator|worker|reviewer|planner|coder|scout):\s|[🔵🔷🟡🟢⚪]/u;
const CLUSTER_NAME = /review|merge request|code.?review|\bmr\b/i;

function readSession(file) {
	let storedName = null, storedNameIdx = -1;
	const entries = [];
	let idx = -1;
	for (const line of fs.readFileSync(file, "utf8").split("\n")) {
		if (!line) continue;
		idx++;
		let e;
		try { e = JSON.parse(line); } catch { continue; }
		if (e.type === "session_info" && storedName === null && typeof e.name === "string") {
			storedName = e.name;
			storedNameIdx = idx;
		}
		if (e.type === "message") entries.push(e);
	}
	return { storedName, storedNameIdx, entries };
}

/** All turn-1 user+assistant text joined, head-truncated to the budget. */
function buildNewInput(entries) {
	const parts = [];
	let userCount = 0;
	for (const e of entries) {
		const role = e.message?.role;
		if (role === "user") {
			userCount++;
			if (userCount > 1) break;
		}
		if (role !== "user" && role !== "assistant") continue;
		const t = extractText(e.message.content).trim();
		if (t) parts.push(t);
	}
	return parts.join("\n\n").slice(0, NEW_INPUT_BUDGET);
}

function buildCorpus() {
	const files = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })
		.filter((d) => d.isDirectory() && !d.name.startsWith("--private-tmp"))
		.flatMap((d) => fs.readdirSync(path.join(SESSIONS_ROOT, d.name))
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => path.join(SESSIONS_ROOT, d.name, f)))
		.sort();

	const candidates = [];
	for (const file of files) {
		const { storedName, storedNameIdx, entries } = readSession(file);
		if (!storedName || AUTOMATION_NAME.test(storedName)) continue;
		// Auto-named-at-turn-1 proxy: name written near the start of the file.
		if (storedNameIdx > 25) continue;
		const firstUser = entries.find((e) => e.message?.role === "user");
		const firstUserText = firstUser ? extractText(firstUser.message.content).trim() : "";
		if (!firstUserText) continue;
		const oldIn = buildConversationInput(entries);
		if (!oldIn) continue;
		const newIn = buildNewInput(entries);
		if (newIn.length < 20) continue;
		const bucket = firstUserText.startsWith("<skill") ? "skill" : CLUSTER_NAME.test(storedName) ? "cluster" : "random";
		candidates.push({ file, storedName, entries, firstUserText, oldIn, newIn, bucket });
	}

	const pick = (arr, n) => {
		if (arr.length <= n) return arr;
		const step = arr.length / n;
		return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
	};
	const corpus = [
		...pick(candidates.filter((c) => c.bucket === "skill"), TARGETS.skill),
		...pick(candidates.filter((c) => c.bucket === "cluster"), TARGETS.cluster),
		...pick(candidates.filter((c) => c.bucket === "random"), TARGETS.random),
	];
	// greeting canary
	const greeting = candidates.find((c) => c.storedName === "greeting with no task yet");
	if (greeting) corpus.push({ ...greeting, bucket: "canary" });
	return { corpus, totalCandidates: candidates.length };
}

// --- identifiers for the id-carry metric -----------------------------------
function extractIds(text) {
	const digits = new Set();
	for (const re of [/AIC-(\d+)/gi, /merge_requests\/(\d+)/g, /jobs\/(\d+)/g,
		/!(\d{1,5})\b/g, /\b[MP]R\s*#?\s*(\d{1,5})\b/gi, /#(\d{2,5})\b/g]) {
		for (const m of text.matchAll(re)) digits.add(m[1]);
	}
	return [...digits];
}

// --- LLM calls -----------------------------------------------------------------
const BASE_URL = process.env.EVAL_BASE_URL ?? "https://api-inference.bitdeer.ai/v1";
// Default mirrors production: resolve autoSessionName.model from the deployed pi
// settings rather than hardcoding a model that drifts on every fleet swap.
function productionNamingModel() {
	try {
		const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".pi/agent/settings.json"), "utf8"));
		const m = s?.autoSessionName?.model;
		if (typeof m === "string" && m.trim()) return m.trim().replace(/^[^/]+\//, "");
	} catch { /* fall through to the hard failure below */ }
	return null;
}
const MODEL = process.env.EVAL_MODEL ?? productionNamingModel();
const API_KEY = process.env.BITDEERAI_API_KEY;

async function generate(systemPrompt, userPrompt) {
	const retryable = /429|5\d\d/;
	const body = {
		model: MODEL,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
		reasoning_effort: "low",
		max_tokens: 4096,
	};
	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			const res = await fetch(`${BASE_URL}/chat/completions`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(90_000),
			});
			if (!res.ok) {
				const text = (await res.text()).slice(0, 300);
				const hint = /try again in (\d+) seconds/i.exec(text);
				const waitMs = hint ? (Number(hint[1]) + 3) * 1000 : 3000 * (attempt + 1);
				if (!retryable.test(String(res.status))) return `__ERROR__: HTTP ${res.status}: ${text}`;
				await new Promise((r) => setTimeout(r, waitMs));
				continue;
			}
			const json = await res.json();
			const msg = json.choices?.[0]?.message ?? {};
			// reasoning models may put the answer in reasoning_content on truncation;
			// production sanitizeTitle treats think-only output as skip — mirror that.
			return String(msg.content ?? "");
		} catch (err) {
			await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
			if (attempt === 5) return `__ERROR__: ${err.message}`;
		}
	}
	return "__ERROR__: exhausted retries";
}

async function pool(items, size, fn) {
	const results = new Array(items.length);
	let next = 0;
	await Promise.all(Array.from({ length: size }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	}));
	return results;
}

// --- main ---------------------------------------------------------------------
const META_RE = /\b(grilling|skill|session|chat about)\b/i;

const ARMS = [
	{ id: "A0",   input: "old", sys: () => SYSTEM_PROMPT,                        cap: 6,  chars: 60  },
	{ id: "A1",   input: "old", sys: () => newSystemPrompt(8, 80, "msg"),        cap: 8,  chars: 80  },
	{ id: "A2",   input: "new", sys: () => SYSTEM_PROMPT,                        cap: 6,  chars: 60  },
	{ id: "A3W6", input: "new", sys: () => newSystemPrompt(6, 60, "turn"),       cap: 6,  chars: 60  },
	{ id: "A3W8", input: "new", sys: () => newSystemPrompt(8, 80, "turn"),       cap: 8,  chars: 80  },
	{ id: "A3W10", input: "new", sys: () => newSystemPrompt(10, 100, "turn"),    cap: 10, chars: 100 },
	{ id: "A3W8R2", input: "new", sys: () => newSystemPromptV2(8, 80),           cap: 8,  chars: 80  },
];

const ARM_FILTER = process.env.EVAL_ARMS?.split(",");
const ARMS_ACTIVE = ARM_FILTER ? ARMS.filter((a) => ARM_FILTER.includes(a.id)) : ARMS;

const { corpus, totalCandidates } = buildCorpus();
console.log(`corpus: ${corpus.length} sessions (from ${totalCandidates} auto-named candidates)`);
const buckets = {};
for (const c of corpus) buckets[c.bucket] = (buckets[c.bucket] ?? 0) + 1;
console.log(`buckets: ${JSON.stringify(buckets)}`);
console.log(`new-input chars: avg ${Math.round(corpus.reduce((s, c) => s + c.newIn.length, 0) / corpus.length)}, max ${Math.max(...corpus.map((c) => c.newIn.length))}`);

if (process.env.EVAL_ONLY_INPUTS === "1") {
	for (const c of corpus) {
		console.log(`\n=== [${c.bucket}] ${c.storedName}`);
		console.log(`    ids: ${extractIds(c.newIn).join(",") || "-"} | newIn ${c.newIn.length} chars | oldIn u${c.oldIn.user.length}/a${c.oldIn.assistant.length}`);
	}
	process.exit(0);
}
if (!API_KEY) { console.error("BITDEERAI_API_KEY required"); process.exit(1); }
if (!MODEL) { console.error("no EVAL_MODEL and no autoSessionName.model in ~/.pi/agent/settings.json"); process.exit(1); }

const jobs = [];
for (const c of corpus) {
	for (const arm of ARMS_ACTIVE) {
		const userPrompt = arm.input === "old"
			? buildUserPromptOld(c.oldIn.user, c.oldIn.assistant)
			: buildUserPromptNewTurn(c.newIn);
		jobs.push({ c, arm, userPrompt });
	}
}

// resume cache: reuse prior non-error results from EVAL_OUT. Point EVAL_OUT at a
// fresh file to force fresh LLM samples (noise-control reruns).
const OUT = process.env.EVAL_OUT ?? "/tmp/auto-session-name-eval.json";
let cached = [];
try { cached = JSON.parse(fs.readFileSync(OUT, "utf8")).jobs ?? []; } catch {}
for (const job of jobs) {
	const hit = cached.find((r) => r.session === path.basename(job.c.file) && r.arm === job.arm.id && !r.name.startsWith("__ERROR__"));
	if (hit) { job.raw = hit.raw; job.name = hit.name; job.done = true; }
}
const pending = jobs.filter((j) => !j.done);
console.log(`running ${pending.length}/${jobs.length} naming calls across ${ARMS_ACTIVE.length} arms on ${MODEL}…`);

await pool(pending, Number(process.env.EVAL_CONCURRENCY ?? 3), async (job) => {
	const raw = await generate(job.arm.sys(), job.userPrompt);
	job.raw = raw;
	job.name = raw.startsWith("__ERROR__") ? raw : sanitizeTitle(raw, job.arm.chars);
	if (pending.indexOf(job) % 6 === 0) process.stderr.write(".");
});

// --- metrics -------------------------------------------------------------------
const byArm = Object.fromEntries(ARMS_ACTIVE.map((a) => [a.id, { rows: [] }]));
for (const job of jobs) byArm[job.arm.id].rows.push(job);

const clusterSessions = corpus.filter((c) => c.bucket === "cluster");
const skillSessions = corpus.filter((c) => c.bucket === "skill");
const idsBySession = new Map(corpus.map((c) => [c, extractIds(c.newIn)]));

const summary = {};
for (const arm of ARMS_ACTIVE) {
	const rows = byArm[arm.id].rows;
	const nameOf = (sess) => rows.find((r) => r.c === sess)?.name ?? "";
	const errors = rows.filter((r) => r.name.startsWith("__ERROR__")).length;
	const meta = skillSessions.filter((s) => META_RE.test(nameOf(s))).length;
	const withIds = corpus.filter((c) => idsBySession.get(c).length > 0);
	const idCarry = withIds.filter((c) => {
		const n = nameOf(c).toLowerCase();
		return idsBySession.get(c).some((d) => n.includes(d));
	}).length;
	const clusterNames = clusterSessions.map(nameOf).filter((n) => !n.startsWith("__ERROR__"));
	const distinct = new Set(clusterNames.map((n) => n.toLowerCase())).size;
	const clean = rows.filter((r) => !r.name.startsWith("__ERROR__") && r.name);
	const overW = clean.filter((r) => r.name.split(/\s+/).length > arm.cap).length;
	const same = clean.filter((r) => r.name.toLowerCase() === r.c.storedName.toLowerCase()).length;
	summary[arm.id] = {
		errors,
		metaWordsSkill: `${meta}/${skillSessions.length}`,
		idCarry: `${idCarry}/${withIds.length}`,
		clusterDistinct: `${distinct}/${clusterSessions.length}`,
		wordsOverCap: `${overW}/${clean.length}`,
		sameAsStored: `${same}/${clean.length}`,
		avgWords: clean.length ? (clean.reduce((s, r) => s + r.name.split(/\s+/).length, 0) / clean.length).toFixed(1) : "-",
		avgChars: clean.length ? Math.round(clean.reduce((s, r) => s + r.name.length, 0) / clean.length) : "-",
	};
}

console.log("\n=== metrics ===");
console.log(JSON.stringify(summary, null, 2));

console.log("\n=== eyeball: stored vs A0 (replay) vs A3W8 vs R2 ===");
for (const c of corpus) {
	const row = (arm) => byArm[arm]?.rows.find((r) => r.c === c)?.name ?? "-";
	console.log(`[${c.bucket}] stored: ${c.storedName}`);
	console.log(`    A0: ${row("A0")}`);
	console.log(` A3W8: ${row("A3W8")}`);
	if (byArm["A3W8R2"]) console.log(`   R2: ${row("A3W8R2")}`);
}

const out = OUT;
fs.writeFileSync(out, JSON.stringify({ model: MODEL, summary,
	jobs: jobs.map((j) => ({ session: path.basename(j.c.file), bucket: j.c.bucket, stored: j.c.storedName,
		arm: j.arm.id, raw: j.raw, name: j.name })) }, null, 2));
console.log(`\nfull results: ${out}`);
