// Black Universe — load / stress test harness.
//
// Pure Node (uses the built-in global fetch, Node 18+). No external deps.
// It fires a configurable number of requests at a target endpoint using a
// fixed-size worker pool, then reports latency percentiles, throughput, and
// the error breakdown so you can see where the system starts to bottleneck.
//
// USAGE (all via env vars, all optional):
//   BASE_URL=http://localhost:80 \
//   TARGET=/api/matrix/accounts \
//   METHOD=GET \
//   TOTAL=1000 \
//   CONCURRENCY=50 \
//   node scripts/stress-test.mjs
//
// To simulate the deposit/exchange write path you must supply a session
// cookie (citizens are authenticated by an express-session cookie):
//   COOKIE="connect.sid=s%3A..." \
//   TARGET=/api/matrix/equity/buy METHOD=POST \
//   BODY='{"gravityAmount":100}' \
//   TOTAL=10000 CONCURRENCY=200 node scripts/stress-test.mjs
//
// NOTE: pointing high concurrency at the *dev* server will mostly measure the
// single dev process + one Postgres connection pool. Real 10k-user numbers
// must be measured against a production deployment (see docs/architecture.md).

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const TARGET = process.env.TARGET ?? "/api/matrix/accounts";
const METHOD = (process.env.METHOD ?? "GET").toUpperCase();
const TOTAL = Number(process.env.TOTAL ?? 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const BODY = process.env.BODY ?? null;
const COOKIE = process.env.COOKIE ?? null;

const url = `${BASE_URL}${TARGET}`;

const headers = { "content-type": "application/json" };
if (COOKIE) headers["cookie"] = COOKIE;

/** @type {number[]} */
const latencies = [];
const statusCounts = new Map();
let completed = 0;
let errors = 0;

function recordStatus(code) {
  statusCounts.set(code, (statusCounts.get(code) ?? 0) + 1);
}

async function oneRequest() {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: METHOD,
      headers,
      body: METHOD === "GET" || METHOD === "HEAD" ? undefined : BODY,
    });
    // Drain the body so the connection can be reused / closed cleanly.
    await res.text();
    latencies.push(performance.now() - start);
    recordStatus(res.status);
    if (res.status >= 400) errors++;
  } catch (err) {
    latencies.push(performance.now() - start);
    recordStatus("NETWORK_ERR");
    errors++;
  } finally {
    completed++;
  }
}

// Worker-pool: keep exactly CONCURRENCY requests in flight until TOTAL is done.
async function worker() {
  while (true) {
    const next = completed + inFlight.size;
    if (next >= TOTAL) break;
    const p = oneRequest();
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
    await p;
  }
}

const inFlight = new Set();

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  console.log("─".repeat(60));
  console.log("Black Universe — stress test");
  console.log(`  target      : ${METHOD} ${url}`);
  console.log(`  total       : ${TOTAL} requests`);
  console.log(`  concurrency : ${CONCURRENCY}`);
  console.log(`  auth cookie : ${COOKIE ? "yes" : "no"}`);
  console.log("─".repeat(60));

  const wallStart = performance.now();
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  const wallMs = performance.now() - wallStart;

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / (sorted.length || 1);

  console.log("\nRESULTS");
  console.log(`  wall time   : ${(wallMs / 1000).toFixed(2)} s`);
  console.log(`  throughput  : ${(TOTAL / (wallMs / 1000)).toFixed(1)} req/s`);
  console.log(`  success     : ${TOTAL - errors}/${TOTAL}`);
  console.log(`  errors      : ${errors} (${((errors / TOTAL) * 100).toFixed(1)}%)`);
  console.log("\nLATENCY (ms)");
  console.log(`  min  : ${sorted[0]?.toFixed(1) ?? "-"}`);
  console.log(`  avg  : ${avg.toFixed(1)}`);
  console.log(`  p50  : ${pct(sorted, 50).toFixed(1)}`);
  console.log(`  p95  : ${pct(sorted, 95).toFixed(1)}`);
  console.log(`  p99  : ${pct(sorted, 99).toFixed(1)}`);
  console.log(`  max  : ${sorted[sorted.length - 1]?.toFixed(1) ?? "-"}`);
  console.log("\nSTATUS CODES");
  for (const [code, count] of [...statusCounts.entries()].sort()) {
    console.log(`  ${code} : ${count}`);
  }

  console.log("\nBOTTLENECK HINTS");
  if (pct(sorted, 99) > 5 * pct(sorted, 50)) {
    console.log("  • p99 ≫ p50 → tail latency: likely DB connection-pool");
    console.log("    saturation or GC pauses under load.");
  }
  if (errors / TOTAL > 0.01) {
    console.log("  • >1% errors → server rejecting/timing out: raise pool size,");
    console.log("    add a queue, or scale horizontally.");
  }
  if (errors === 0 && pct(sorted, 99) <= 5 * pct(sorted, 50)) {
    console.log("  • Stable at this load. Re-run with higher CONCURRENCY to");
    console.log("    find the knee of the curve.");
  }
  console.log("─".repeat(60));
}

main();
