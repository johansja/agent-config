#!/usr/bin/env node
// probe-cache.mjs — reproduce and measure prompt-cache behavior on the BitDeer gateway.
//
// Why: gateway caches are per-replica. Sequential keep-alive traffic sticks to one warm
// replica, but concurrency (parallel sessions, subagent fan-out) spreads requests across
// replicas, and cold replicas pay a full prefill. This probe makes that visible and
// re-runnable after gateway changes.
//
// Modes:
//   burst (default) — prime once, then fire N identical concurrent requests for R rounds.
//                     Round 1 misses (~N - warm replicas); later rounds converge to N/N.
//   gap             — prime once, then re-send sequentially at increasing gaps, to measure
//                     persistence/eviction over time on the sticky replica.
//
// Env: BITDEERAI_API_KEY (required), BITDEERAI_API_BASE (default https://api-inference.bitdeer.ai/v1)
// Usage: probe-cache.mjs [--mode burst|gap|both] [--models a,b] [--n N] [--rounds N]
//                        [--gaps 10,30,60,120] [--probes N] [--src DIR] [--target-chars N]
//                        [--max-tokens N] [--timeout-ms N] [--help]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BITDEERAI_API_BASE ?? 'https://api-inference.bitdeer.ai/v1';
const KEY = process.env.BITDEERAI_API_KEY;
const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  mode: 'burst',
  models: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash'],
  n: 6,
  rounds: null, // per-mode default: burst 3, gap 2
  gaps: [10, 30, 60, 120],
  probes: 2,
  targetChars: 160_000,
  maxTokens: 16,
  timeoutMs: 120_000,
  src: null,
};

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') o.mode = argv[++i];
    else if (a === '--models') o.models = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--n') o.n = parseInt(argv[++i], 10);
    else if (a === '--rounds') o.rounds = parseInt(argv[++i], 10);
    else if (a === '--gaps') o.gaps = argv[++i].split(',').map(s => parseInt(s, 10));
    else if (a === '--probes') o.probes = parseInt(argv[++i], 10);
    else if (a === '--src') o.src = path.resolve(argv[++i]);
    else if (a === '--target-chars') o.targetChars = parseInt(argv[++i], 10);
    else if (a === '--max-tokens') o.maxTokens = parseInt(argv[++i], 10);
    else if (a === '--timeout-ms') o.timeoutMs = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: probe-cache.mjs [--mode burst|gap|both] [--models a,b] [--n N] [--rounds N] [--gaps 10,30,60,120] [--probes N] [--src DIR] [--target-chars N] [--max-tokens N] [--timeout-ms N]');
      process.exit(0);
    } else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  if (!['burst', 'gap', 'both'].includes(o.mode)) { console.error(`unknown mode: ${o.mode}`); process.exit(2); }
  return o;
}

// --- context --------------------------------------------------------------
function findPiPackage() {
  const root = path.join(os.homedir(), '.pi', 'agent', 'install');
  try {
    const ver = fs.readFileSync(path.join(root, 'current-version'), 'utf8').trim();
    const p = path.join(root, 'releases', ver, 'node_modules', '@earendil-works', 'pi-coding-agent');
    if (fs.existsSync(p)) return p;
  } catch {}
  try {
    for (const v of fs.readdirSync(path.join(root, 'releases')).sort().reverse()) {
      const p = path.join(root, 'releases', v, 'node_modules', '@earendil-works', 'pi-coding-agent');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

const EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);
const SKIP = new Set(['.git', 'node_modules', '.pi']);
function walk(dir, acc = []) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, acc); }
    else if (EXTS.has(path.extname(e.name))) {
      try { const st = fs.statSync(p); if (st.size > 0 && st.size < 60_000) acc.push({ p, size: st.size }); } catch {}
    }
  }
  return acc;
}

function buildContext(srcDir, targetChars) {
  let context = '';
  for (const f of walk(srcDir).sort((a, b) => b.size - a.size)) {
    if (context.length >= targetChars) break;
    context += `\n===== FILE: ${path.relative(srcDir, f.p)} =====\n` + fs.readFileSync(f.p, 'utf8');
  }
  return context;
}

// --- request --------------------------------------------------------------
async function call(model, content, maxTokens, timeoutMs) {
  const t0 = performance.now();
  let ttft = null;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 100)}`);
  const dec = new TextDecoder();
  let buf = '', usage = null;
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of ev.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (d === '[DONE]') continue;
        let j; try { j = JSON.parse(d); } catch { continue; }
        const delta = j.choices?.[0]?.delta;
        if (delta && (delta.content || delta.reasoning_content) && ttft === null) ttft = performance.now() - t0;
        if (j.usage) usage = j.usage;
      }
    }
  }
  return { ttft, total: performance.now() - t0, cached: usage?.prompt_tokens_details?.cached_tokens };
}

const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

// --- modes ----------------------------------------------------------------
async function burst(o, context, model) {
  const short = model.split('/').pop();
  const rounds = o.rounds ?? 3;
  const prompt = `(run nonce: ${crypto.randomUUID()}) Here is a codebase.\n${context}\n\nQuestion: name one file from above.`;
  const summary = [];
  try {
    const p = await call(model, prompt, o.maxTokens, o.timeoutMs);
    console.log(`${short} prime: cached=${p.cached} ttft=${Math.round(p.ttft)}ms`);
  } catch (e) { console.log(`${short} prime FAILED: ${e.message}`); return; }
  for (let r = 1; r <= rounds; r++) {
    await sleep(2000);
    const t0 = performance.now();
    const settled = await Promise.allSettled(Array.from({ length: o.n }, () => call(model, prompt, o.maxTokens, o.timeoutMs)));
    const hits = settled.filter(s => s.status === 'fulfilled' && s.value.cached > 0).length;
    const errs = settled.filter(s => s.status === 'rejected').length;
    const detail = settled.map(s => s.status === 'fulfilled' ? (s.value.cached > 0 ? `hit:${Math.round(s.value.ttft)}` : `MISS:${Math.round(s.value.ttft)}`) : 'ERR').join(' ');
    console.log(`${short} burst r${r}: ${hits}/${o.n} hits, ${errs} errors, wall=${Math.round(performance.now() - t0)}ms | ${detail}`);
    summary.push(`${hits}/${o.n}`);
  }
  console.log(`${short} burst summary: ${summary.join('  ')}`);
}

async function gap(o, context, model) {
  const short = model.split('/').pop();
  const rounds = o.rounds ?? 2;
  for (let round = 1; round <= rounds; round++) {
    const prompt = `(run nonce: ${crypto.randomUUID()}) Here is a codebase.\n${context}\n\nQuestion: name one file from above.`;
    try {
      const p = await call(model, prompt, o.maxTokens, o.timeoutMs);
      console.log(`${short} gap r${round} prime: cached=${p.cached} ttft=${Math.round(p.ttft)}ms`);
      const t0 = performance.now();
      for (const g of o.gaps) {
        await sleep(t0 + g * 1000 - performance.now());
        const parts = [];
        for (let p2 = 1; p2 <= o.probes; p2++) {
          const r = await call(model, prompt, o.maxTokens, o.timeoutMs);
          parts.push(r.cached > 0 ? `hit:${Math.round(r.ttft)}` : `MISS:${Math.round(r.ttft)}`);
        }
        console.log(`${short} gap r${round} +${g}s: ${parts.join(' ')}`);
      }
    } catch (e) { console.log(`${short} gap r${round} FAILED: ${e.message}`); }
  }
}

// --- main -----------------------------------------------------------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!KEY) { console.error('BITDEERAI_API_KEY is not set'); process.exit(1); }
  const srcDir = o.src ?? findPiPackage() ?? path.resolve(HERE, '..');
  const context = buildContext(srcDir, o.targetChars);
  console.log(`source: ${srcDir}`);
  console.log(`context: ${context.length} chars (~${Math.round(context.length / 3.7)} tokens est) · mode: ${o.mode}\n`);
  for (const model of o.models) {
    if (o.mode === 'burst' || o.mode === 'both') await burst(o, context, model);
    if (o.mode === 'gap' || o.mode === 'both') await gap(o, context, model);
    console.log('');
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
