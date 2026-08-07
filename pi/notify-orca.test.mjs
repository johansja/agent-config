/**
 * Source-shape regression tests for notify-orca.ts.
 *
 * Run with: node --test pi/notify-orca.test.mjs
 *
 * Coverage focus: the Orca hook endpoint rotation fix. Orca rotates
 * ORCA_AGENT_HOOK_PORT / ORCA_AGENT_HOOK_TOKEN on every app restart and writes
 * the current values to endpoint.env (path in ORCA_AGENT_HOOK_ENDPOINT, which
 * does NOT rotate). postOrcaBlocked MUST read endpoint.env first and fall back
 * to process.env — using process.env directly fails silently after Orca
 * restarts because the inherited env points at a dead port and a rejected
 * token, and the fetch's .then(()=>{},()=>{}) swallows the error. Mirrors
 * orca-agent-status.ts's readEndpointFile/resolveHookCoords.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const notifySource = fs.readFileSync(
	path.join(import.meta.dirname, "notify-orca.ts"),
	"utf-8",
);

describe("Orca hook endpoint rotation fix (readEndpointFile / resolveHookCoords)", () => {
	it("imports node:fs for endpoint.env parsing", () => {
		assert.match(notifySource, /import\s*\*\s*as\s*fs\s*from\s*["']node:fs["']/);
	});

	it("defines readEndpointFile that reads ORCA_AGENT_HOOK_ENDPOINT path", () => {
		assert.match(notifySource, /function readEndpointFile/);
		assert.match(notifySource, /process\.env\.ORCA_AGENT_HOOK_ENDPOINT/);
		assert.match(notifySource, /fs\.readFileSync/);
	});

	it("parses POSIX KEY=VALUE lines (and Windows set KEY=VALUE)", () => {
		// Matches orca-agent-status.ts's regex; handles the endpoint.env format
		// Orca writes on both POSIX and Windows hosts.
		assert.match(notifySource, /\(\?:set\\s\+\)\?\(\[A-Z0-9_\]\+\)=\(\.\*\)\$/);
	});

	it("defines resolveHookCoords with file-first, env-fallback for port/token/env/version", () => {
		assert.match(notifySource, /function resolveHookCoords/);
		// Each coord: fileEnv.X || process.env.X — file wins, env is fallback
		assert.match(
			notifySource,
			/port:\s*fileEnv\.ORCA_AGENT_HOOK_PORT\s*\|\|\s*process\.env\.ORCA_AGENT_HOOK_PORT/,
		);
		assert.match(
			notifySource,
			/token:\s*fileEnv\.ORCA_AGENT_HOOK_TOKEN\s*\|\|\s*process\.env\.ORCA_AGENT_HOOK_TOKEN/,
		);
		assert.match(
			notifySource,
			/env:\s*fileEnv\.ORCA_AGENT_HOOK_ENV\s*\|\|\s*process\.env\.ORCA_AGENT_HOOK_ENV\s*\|\|\s*""/,
		);
		assert.match(
			notifySource,
			/version:\s*fileEnv\.ORCA_AGENT_HOOK_VERSION\s*\|\|\s*process\.env\.ORCA_AGENT_HOOK_VERSION\s*\|\|\s*""/,
		);
	});

	it("postOrcaBlocked resolves coords via resolveHookCoords (not process.env directly)", () => {
		// The bug: postOrcaBlocked read process.env.ORCA_AGENT_HOOK_PORT / _TOKEN
		// directly. After Orca rotated the endpoint, those pointed at a dead
		// port and a rejected token, and the fetch's error swallow hid it.
		// The fix routes through resolveHookCoords which reads endpoint.env.
		assert.match(notifySource, /function postOrcaBlocked[\s\S]*?const coords = resolveHookCoords\(\)/);
		assert.match(notifySource, /if \(!paneKey \|\| !coords\.port \|\| !coords\.token\) return/);
		assert.match(notifySource, /http:\/\/127\.0\.0\.1:\$\{coords\.port\}\/hook\/pi/);
		assert.match(notifySource, /"X-Orca-Agent-Hook-Token":\s*coords\.token/);
		assert.match(notifySource, /env:\s*coords\.env,/);
		assert.match(notifySource, /version:\s*coords\.version,/);
	});

	it("postOrcaBlocked still reads session-scoped coords (paneKey/launchToken/tabId/worktreeId) from process.env", () => {
		// These do NOT rotate on Orca restart, so process.env is correct.
		// Locking this in so a future refactor doesn't accidentally route them
		// through readEndpointFile (which doesn't carry them).
		assert.match(notifySource, /const paneKey = process\.env\.ORCA_PANE_KEY/);
		assert.match(notifySource, /launchToken:\s*process\.env\.ORCA_AGENT_LAUNCH_TOKEN/);
		assert.match(notifySource, /tabId:\s*process\.env\.ORCA_TAB_ID/);
		assert.match(notifySource, /worktreeId:\s*process\.env\.ORCA_WORKTREE_ID/);
	});

	it("does NOT read port/token directly from process.env in postOrcaBlocked (regression guard)", () => {
		// The pre-fix code had: const port = process.env.ORCA_AGENT_HOOK_PORT;
		//                     const token = process.env.ORCA_AGENT_HOOK_TOKEN;
		// inside postOrcaBlocked. After the fix, those reads happen only in
		// resolveHookCoords as the fallback arm. Confirm postOrcaBlocked's body
		// doesn't re-introduce direct reads.
		const fnBlock = notifySource.match(
			/function postOrcaBlocked[\s\S]*?^}/m,
		);
		assert.ok(fnBlock, "postOrcaBlocked function block found");
		assert.doesNotMatch(
			fnBlock[0],
			/const port = process\.env\.ORCA_AGENT_HOOK_PORT/,
			"postOrcaBlocked must not read port directly from process.env",
		);
		assert.doesNotMatch(
			fnBlock[0],
			/const token = process\.env\.ORCA_AGENT_HOOK_TOKEN/,
			"postOrcaBlocked must not read token directly from process.env",
		);
	});
});
