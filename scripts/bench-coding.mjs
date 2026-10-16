#!/usr/bin/env node
// bench-coding.mjs — coding-realistic model benchmark. This is the default bench for
// model selection: real long context, cold vs cached prefill, and tool-call emission.
// bench-models.mjs remains the quick raw-serving check (short prompts, no tools).
//
// What it measures, per model, at ~150k-token real-code context:
//   - cold TTFT (first occurrence of each task; prefill without cache)
//   - warm TTFT (repeat iterations; cached prefix)
//   - decode tok/s at realistic output lengths
//   - tool-call pass rate: right tool name + parseable JSON args + expected fields
//
// Env: BITDEERAI_API_KEY (required), BITDEERAI_API_BASE (default https://api-inference.bitdeer.ai/v1)
// Usage: bench-coding.mjs [--models a,b] [--iter N] [--src DIR] [--target-chars N]
//                         [--max-tokens N] [--timeout-ms N] [--help]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BITDEERAI_API_BASE ?? 'https://api-inference.bitdeer.ai/v1';
const KEY = process.env.BITDEERAI_API_KEY;
const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  models: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash'],
  iter: 3,
  targetChars: 600_000,
  maxTokens: 400,
  timeoutMs: 300_000,
  src: null,
};

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') o.models = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--iter') o.iter = parseInt(argv[++i], 10);
    else if (a === '--src') o.src = path.resolve(argv[++i]);
    else if (a === '--target-chars') o.targetChars = parseInt(argv[++i], 10);
    else if (a === '--max-tokens') o.maxTokens = parseInt(argv[++i], 10);
    else if (a === '--timeout-ms') o.timeoutMs = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: bench-coding.mjs [--models a,b] [--iter N] [--src DIR] [--target-chars N] [--max-tokens N] [--timeout-ms N]');
      process.exit(0);
    } else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return o;
}

// --- context source -------------------------------------------------------
function findPiPackage() {
  const installRoot = path.join(os.homedir(), '.pi', 'agent', 'install');
  try {
    const ver = fs.readFileSync(path.join(installRoot, 'current-version'), 'utf8').trim();
    const p = path.join(installRoot, 'releases', ver, 'node_modules', '@earendil-works', 'pi-coding-agent');
    if (fs.existsSync(p)) return p;
  } catch {}
  try {
    const releases = path.join(installRoot, 'releases');
    for (const v of fs.readdirSync(releases).sort().reverse()) {
      const p = path.join(releases, v, 'node_modules', '@earendil-works', 'pi-coding-agent');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

const EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.py', '.go', '.rs', '.yaml', '.yml', '.toml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.pi', 'sessions', '.venv', '__pycache__']);

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else if (EXTS.has(path.extname(e.name))) {
      try { const st = fs.statSync(p); if (st.size > 0 && st.size < 60_000) acc.push({ p, size: st.size }); } catch {}
    }
  }
  return acc;
}

function buildContext(srcDir, targetChars) {
  const files = walk(srcDir).sort((a, b) => b.size - a.size);
  const used = []; let context = '';
  for (const f of files) {
    if (context.length >= targetChars) break;
    const rel = path.relative(srcDir, f.p);
    context += `\n===== FILE: ${rel} =====\n` + fs.readFileSync(f.p, 'utf8');
    used.push({ rel });
  }
  return { context, used, available: files.length };
}

// --- scenarios ------------------------------------------------------------
const TOOLS = [
  { type: 'function', function: { name: 'read', description: 'Read a file from the codebase', parameters: { type: 'object', properties: { path: { type: 'string', description: 'file path' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'grep', description: 'Search a file for a pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'write', description: 'Write content to a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
];

function makeTasks(used) {
  const pick = used.find(f => f.rel.endsWith('.md')) ?? used[0];
  const pickBase = path.basename(pick.rel);
  return [
    { id: 'ask', kind: 'ask', prompt: 'Question: in one short paragraph under 80 words, what is this codebase for?' },
    { id: 'read', kind: 'read', prompt: `Task: use the read tool to open the file ${pick.rel}. Make the tool call now, no prose.` },
    { id: 'grep', kind: 'grep', prompt: `Task: use the grep tool to search for the pattern "function" in the file ${pick.rel}. Make the tool call now, no prose.` },
    { id: 'write', kind: 'write', prompt: 'Task: use the write tool to create the file bench-probe.txt with exactly the content: hello world. Make the tool call now, no prose.' },
  ].map(t => ({ ...t, expect: pickBase }));
}

function grade(task, toolCall, usage) {
  if (task.kind === 'ask') return { ok: (usage?.completion_tokens ?? 0) > 0 && !toolCall, note: 'text answer' };
  if (!toolCall) return { ok: false, note: 'no tool call' };
  let a; try { a = JSON.parse(toolCall.args || ''); } catch { return { ok: false, note: 'invalid JSON args' }; }
  if (task.kind === 'read') return { ok: toolCall.name === 'read' && typeof a.path === 'string' && a.path.includes(task.expect), note: `path=${a.path}` };
  if (task.kind === 'grep') return { ok: toolCall.name === 'grep' && typeof a.pattern === 'string' && a.pattern.includes('function'), note: `pattern=${a.pattern}` };
  if (task.kind === 'write') return { ok: toolCall.name === 'write' && typeof a.path === 'string' && a.path.includes('bench-probe.txt') && !!a.content, note: `path=${a.path}` };
  return { ok: false, note: 'unknown task' };
}

// --- request --------------------------------------------------------------
async function call(model, body, timeoutMs) {
  const t0 = performance.now();
  let ttft = null;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
  const dec = new TextDecoder();
  let buf = '', usage = null;
  const toolCalls = [];
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
        if (delta && (delta.content || delta.reasoning_content || delta.tool_calls)) {
          if (ttft === null) ttft = performance.now() - t0;
        }
        if (delta?.tool_calls) for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          toolCalls[idx] ??= { name: '', args: '' };
          if (tc.function?.name) toolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
        }
        if (j.usage) usage = j.usage;
      }
    }
  }
  return { ttft, total: performance.now() - t0, usage, toolCall: toolCalls[0] ?? null };
}

// --- main -----------------------------------------------------------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!KEY) { console.error('BITDEERAI_API_KEY is not set'); process.exit(1); }

  const srcDir = o.src ?? findPiPackage() ?? path.resolve(HERE, '..');
  const { context, used, available } = buildContext(srcDir, o.targetChars);
  const est = Math.round(context.length / 3.7);
  console.log(`source: ${srcDir}`);
  console.log(`context: ${used.length}/${available} files, ${context.length} chars (~${est} tokens est)`);
  console.log(`models: ${o.models.join(', ')} · iter: ${o.iter} · max_tokens: ${o.maxTokens}\n`);

  const tasks = makeTasks(used);
  const rows = [];
  for (let it = 1; it <= o.iter; it++) {
    for (const model of o.models) {
      for (const task of tasks) {
        const body = {
          max_tokens: o.maxTokens,
          messages: [{ role: 'user', content: `Here is a codebase.\n${context}\n\n${task.prompt}` }],
          ...(task.kind === 'ask' ? {} : { tools: TOOLS }),
        };
        const tag = `it${it} ${model.split('/').pop()} ${task.id}`;
        try {
          const r = await call(model, body, o.timeoutMs);
          const cached = r.usage?.prompt_tokens_details?.cached_tokens ?? 0;
          const g = grade(task, r.toolCall, r.usage);
          rows.push({ model, task: task.id, ttft: r.ttft, total: r.total, cached, out: r.usage?.completion_tokens ?? 0, ok: g.ok, note: g.note });
          console.log(`${tag}: ttft=${Math.round(r.ttft)}ms total=${Math.round(r.total)}ms cached=${cached} out=${r.usage?.completion_tokens ?? '?'} ${g.ok ? 'PASS' : 'FAIL'} ${g.note}`);
        } catch (e) {
          rows.push({ model, task: task.id, err: e.message });
          console.log(`${tag}: FAILED ${e.message}`);
        }
      }
    }
  }

  console.log('\n===== SUMMARY =====');
  console.log('model | task | first TTFT | repeat TTFT (mean) | tok/s (mean) | pass');
  for (const model of o.models) {
    for (const task of tasks) {
      const rs = rows.filter(r => r.model === model && r.task === task.id && !r.err);
      if (!rs.length) { console.log(`${model.split('/').pop()} | ${task.id} | — | — | — | 0/${o.iter}`); continue; }
      const first = Math.round(rs[0].ttft);
      const repeat = rs.length > 1 ? Math.round(rs.slice(1).reduce((s, r) => s + r.ttft, 0) / (rs.length - 1)) : '—';
      const tps = task.kind !== 'ask' ? [] : rs.filter(r => r.out >= 20 && r.total > r.ttft + 100).map(r => r.out / ((r.total - r.ttft) / 1000));
      const tpsMean = tps.length ? (tps.reduce((a, b) => a + b, 0) / tps.length).toFixed(0) : '—';
      console.log(`${model.split('/').pop()} | ${task.id} | ${first} ms | ${repeat === '—' ? '—' : repeat + ' ms'} | ${tpsMean} | ${rs.filter(r => r.ok).length}/${o.iter}`);
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
