#!/usr/bin/env node
// Streaming benchmark for BitDeer AI models — TTFT, total latency, tokens/sec.
// Env: BITDEERAI_API_KEY (required), BITDEERAI_API_BASE (default https://api-inference.bitdeer.ai/v1)
// Usage: bench-models.mjs [--models a,b,c] [--iter N] [--list] [--prompt "..."] [--max-tokens N]

const BASE = process.env.BITDEERAI_API_BASE ?? 'https://api-inference.bitdeer.ai/v1';
const KEY = process.env.BITDEERAI_API_KEY;
const DEFAULT_MODELS = [
  'deepseek-ai/DeepSeek-V4-Flash',
  'zai-org/GLM-5.2',
  'moonshotai/Kimi-K3',
  'MiniMaxAI/MiniMax-M3',
];
const DEFAULT_PROMPT = 'Explain, in three short paragraphs, how the Kubernetes scheduler places a pending pod.';

function parseArgs(argv) {
  const o = { models: DEFAULT_MODELS, iter: 4, list: false, prompt: DEFAULT_PROMPT, maxTokens: 512 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') o.models = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--iter') o.iter = parseInt(argv[++i], 10);
    else if (a === '--list') o.list = true;
    else if (a === '--prompt') o.prompt = argv[++i];
    else if (a === '--max-tokens') o.maxTokens = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') { console.log('Usage: bench-models.mjs [--models a,b,c] [--iter N] [--list] [--prompt "..."] [--max-tokens N]'); process.exit(0); }
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return o;
}

async function listModels() {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`GET /models → ${res.status}`);
  const { data } = await res.json();
  for (const m of data) console.log(m.id);
}

async function benchOnce(model, prompt, maxTokens) {
  const t0 = performance.now();
  let ttft = null, completion = 0;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: true, max_tokens: maxTokens,
      stream_options: { include_usage: true },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().then(t => t.slice(0, 200))}`);
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const event = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') break;
        try {
          const j = JSON.parse(data);
          const d = j.choices?.[0]?.delta;
          const delta = (d?.content ?? '') || (d?.reasoning_content ?? ''); // reasoning models stream reasoning_content
          if (delta) {
            if (ttft === null) ttft = performance.now() - t0;
            completion = j.usage?.completion_tokens ?? completion + 1; // chunk≈token fallback, refined by usage
          }
          if (j.usage?.completion_tokens) completion = j.usage.completion_tokens;
        } catch { /* partial event */ }
      }
    }
  }
  const total = performance.now() - t0;
  const gen = total - (ttft ?? total);
  return { ttft, total, completion, tps: gen > 0 ? completion / (gen / 1000) : 0 };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x, d = 0) => x.toFixed(d);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!KEY) { console.error('BITDEERAI_API_KEY is not set'); process.exit(1); }
  if (o.list) { await listModels(); return; }

  const rows = [];
  for (const model of o.models) {
    const runs = [];
    for (let i = 0; i < o.iter; i++) {
      try { runs.push(await benchOnce(model, o.prompt, o.maxTokens)); }
      catch (e) { console.error(`  ${model} run ${i + 1}/${o.iter} failed: ${e.message}`); }
    }
    if (!runs.length) { rows.push([model, '—', '—', '—', `0/${o.iter}`]); continue; }
    rows.push([
      model,
      `${fmt(mean(runs.map(r => r.ttft)))} ms`,
      fmt(mean(runs.map(r => r.tps)), 1),
      `${fmt(mean(runs.map(r => r.total / 1000)), 1)} s`,
      `${runs.length}/${o.iter}`,
    ]);
  }
  console.log(`\nBase: ${BASE} · iter: ${o.iter} · prompt tokens vary · max_tokens: ${o.maxTokens}\n`);
  console.log('| Model | TTFT (mean) | tok/s (mean) | Total (mean) | OK |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
