// Source vetting script — probe every job source in lib/sources.js and report
// which boards are still live.
//
// Usage:
//   node scripts/vet.mjs
//
// Hits the live public ATS/aggregator APIs (no keys, network required) and prints
// one line per source, grouped by ATS:
//   OK <n> jobs   — 200 with at least one posting
//   EMPTY         — 200 but zero postings (token likely stale / board paused)
//   DEAD <detail> — non-2xx status, timeout, or fetch error
// Then a summary count (live / empty / dead). Always exits 0; a handful of
// DEAD/EMPTY lines is normal — treat it as a maintenance signal, not a failure.

import { GREENHOUSE, LEVER, ASHBY, WORKDAY, ORACLE, AGGREGATORS } from "../lib/sources.js";

const TIMEOUT_MS = 8000;
const UA = "job-notifier/1.0 (+https://github.com/) source-vet";

async function getJSON(url, init) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// ---- Per-source probes: each resolves to a job count or throws ----

async function countGreenhouse(token) {
  const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  return (d.jobs || []).length;
}

async function countLever(token) {
  const d = await getJSON(`https://api.lever.co/v0/postings/${token}?mode=json`);
  return (Array.isArray(d) ? d : []).length;
}

async function countAshby(token) {
  const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
  return (d.jobs || []).length;
}

async function countWorkday({ host, tenant, site }) {
  const d = await getJSON(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify({ limit: 20, offset: 0, searchText: "", appliedFacets: {} }),
  });
  return (d.jobPostings || []).length;
}

async function countOracle({ host, siteNumber }) {
  // `expand=requisitionList` is required — without it the response omits the
  // requisitionList entirely and every live board looks EMPTY.
  const d = await getJSON(
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${siteNumber},limit=50`
  );
  const list = (d.items && d.items[0] && d.items[0].requisitionList) || [];
  return list.length;
}

async function countAggregator({ kind, url }) {
  const d = await getJSON(url);
  return ((kind === "arbeitnow" ? d.data : d.jobs) || []).length;
}

// ---- Probe wrapper: classify OK / EMPTY / DEAD, never throws ----

async function probe(run) {
  try {
    const n = await run();
    return n > 0 ? { status: "OK", count: n } : { status: "EMPTY" };
  } catch (e) {
    const detail = e && e.name === "TimeoutError" ? "timeout" : (e && e.message) || String(e);
    return { status: "DEAD", detail };
  }
}

// ---- Orchestration ----

// One flat task list so every source is probed concurrently; `group`/`label`
// are carried through for grouped printing.
const tasks = [
  ...GREENHOUSE.map((t) => ({ group: "Greenhouse", label: t, run: () => countGreenhouse(t) })),
  ...LEVER.map((t) => ({ group: "Lever", label: t, run: () => countLever(t) })),
  ...ASHBY.map((t) => ({ group: "Ashby", label: t, run: () => countAshby(t) })),
  ...WORKDAY.map((c) => ({ group: "Workday", label: c.name, run: () => countWorkday(c) })),
  ...ORACLE.map((c) => ({ group: "Oracle Cloud", label: c.name, run: () => countOracle(c) })),
  ...AGGREGATORS.map((a) => ({ group: "Aggregators", label: a.kind, run: () => countAggregator(a) })),
];

const GROUPS = ["Greenhouse", "Lever", "Ashby", "Workday", "Oracle Cloud", "Aggregators"];

function fmt(r) {
  if (r.status === "OK") return `OK    ${r.count} jobs`;
  if (r.status === "EMPTY") return "EMPTY";
  return `DEAD  ${r.detail}`;
}

async function main() {
  const results = await Promise.all(tasks.map(async (t) => ({ ...t, ...(await probe(t.run)) })));

  let live = 0, empty = 0, dead = 0;
  for (const name of GROUPS) {
    const rows = results.filter((r) => r.group === name);
    if (!rows.length) continue;
    const w = Math.max(...rows.map((r) => r.label.length));
    console.log(`\n${name} (${rows.length})`);
    for (const r of rows) {
      if (r.status === "OK") live++;
      else if (r.status === "EMPTY") empty++;
      else dead++;
      console.log(`  ${r.label.padEnd(w)}  ${fmt(r)}`);
    }
  }

  console.log(`\nSummary: ${live} live · ${empty} empty · ${dead} dead  (${results.length} sources)`);
  process.exitCode = 0;
}

main();
