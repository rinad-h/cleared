#!/usr/bin/env node
// TEMPORARY (Phase 0 spikes S1/S2). Calls a URL N times in sequence and prints
// wall-clock timings. CPU time isn't visible from the client: read `cpuTime`
// in Workers Logs (dashboard) or `npm run remote -- tail cleared --format json`.
//
//   node scripts/spike-load.mjs https://cleared.<sub>.workers.dev/spike/board 50

const [url, countArg = "50"] = process.argv.slice(2);
if (!url) {
  console.error("Usage: node scripts/spike-load.mjs <url> [count]");
  process.exit(1);
}

const count = Number(countArg);
const times = [];
const statuses = new Map();
for (let i = 0; i < count; i++) {
  const started = performance.now();
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  await res.arrayBuffer();
  times.push(performance.now() - started);
  statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
}

times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(0);
console.log(`requests: ${count}  statuses: ${JSON.stringify(Object.fromEntries(statuses))}`);
console.log(`wall ms  median ${pct(50)}  p90 ${pct(90)}  p99 ${pct(99)}  max ${times.at(-1).toFixed(0)}`);
