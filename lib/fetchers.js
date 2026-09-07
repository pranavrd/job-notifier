// Orchestration — fan out across every ATS adapter, isolate failures, dedupe,
// and window the result. The per-source mapping now lives in lib/adapters.js
// (one adapter object per ATS); this file just drives them.
//
// Public surface (kept stable for the app, the CLI, the RSS feed, and tests):
//   fetchAllJobs()        -> { jobs, sourcesOk, sourcesTotal, sources }
//   getCachedJobs(opts)   -> { raw, stale }   (TTL cache shared by both routes)
//   withinWindow(jobs, …) -> Job[]            (trailing window + caps + sort)
//   WINDOW_HOURS, and the pure helpers re-exported for unit tests.

import { ADAPTERS } from "./adapters.js";
import { dedupeExact, dedupeCrossSource } from "./normalize.js";
import { CONCURRENCY, CACHE_TTL_MS, WINDOW_HOURS, FEED_CAP, PER_COMPANY_CAP } from "./config.js";

// Re-export the pure helpers so existing test/CLI imports (`from "../lib/
// fetchers.js"`) keep working after the split into normalize.js/config.js.
export { hashId, normalize, workdayPostedAt, oraclePostedAt, dedupeExact, dedupeCrossSource } from "./normalize.js";
export { WINDOW_HOURS } from "./config.js";

// Run thunked tasks through a bounded-concurrency pool. Firing all ~265 fetches
// at once spikes sockets/memory and trips rate limits; a small pool keeps
// throughput high without the stampede. Isolates failures like
// Promise.allSettled — each result is { status:"fulfilled", value } or
// { status:"rejected", reason } — and preserves input order.
async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i].run() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(runners);
  return results;
}

// Fetch every source through the pool; drop the ones that fail or time out, then
// dedupe (exact id, then cross-source aggregator echoes).
export async function fetchAllJobs() {
  const ctx = { now: Date.now() };

  // Build one task per (adapter, config). `run` is a thunk — the fetch doesn't
  // start until the pool picks it up. `source` labels the per-source health row.
  const tasks = [];
  for (const a of ADAPTERS) {
    for (const config of a.configs) {
      tasks.push({
        source: a.label(config),
        run: async () => {
          const raw = await a.list(config);
          return raw.map((r) => a.normalize(r, config, ctx)).filter(Boolean);
        },
      });
    }
  }

  const settled = await runPool(tasks, CONCURRENCY);
  const jobs = [];
  const sources = []; // per-task: { source, ok, count }
  let ok = 0;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const label = tasks[i].source;
    if (r.status === "fulfilled") {
      ok++;
      const produced = r.value || [];
      for (const j of produced) jobs.push(j);
      sources.push({ source: label, ok: true, count: produced.length });
    } else {
      sources.push({ source: label, ok: false, count: 0 });
    }
  }

  const unique = dedupeCrossSource(dedupeExact(jobs));
  return { jobs: unique, sourcesOk: ok, sourcesTotal: tasks.length, sources };
}

// In-memory TTL cache shared by the JSON API and the RSS feed, so both endpoints
// ride ONE 90s fan-out instead of each hammering ~265 upstreams. Stale-while-
// revalidate: if a refetch throws but a last-good payload exists, return it
// flagged `stale` and keep it warm for another TTL (so an upstream outage
// doesn't re-run the whole fan-out on every request). Throws only on a cold miss.
let CACHE = { at: 0, payload: null };
export async function getCachedJobs({ fresh = false, now = Date.now() } = {}) {
  let raw = CACHE.payload;
  let stale = false;
  if (fresh || !raw || now - CACHE.at > CACHE_TTL_MS) {
    try {
      raw = await fetchAllJobs();
      CACHE = { at: now, payload: raw };
    } catch (e) {
      if (!raw) throw e; // cold miss with nothing cached — let the caller 502
      stale = true;
      CACHE = { at: now, payload: raw };
    }
  }
  return { raw, stale };
}

// Keep only postings inside the trailing window, sort newest-first, cap how many
// any single company can contribute (so one big board can't dominate the feed),
// and cap the overall payload so the client stays snappy. Cap defaults come from
// lib/config.js so the API, the RSS feed, and the CLI all agree.
export function withinWindow(jobs, now = Date.now(), hours = WINDOW_HOURS, cap = FEED_CAP, perCompany = PER_COMPANY_CAP) {
  const cutoff = now - hours * 3600 * 1000;
  const sorted = jobs
    .filter((j) => j.postedAt >= cutoff && j.postedAt <= now + 5 * 60 * 1000)
    .sort((a, b) => b.postedAt - a.postedAt);

  const counts = {};
  const out = [];
  for (const j of sorted) {
    const k = (j.company || "").toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] > perCompany) continue;
    out.push(j);
    if (out.length >= cap) break;
  }
  return out;
}
