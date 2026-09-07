#!/usr/bin/env node
// aggregate.mjs — standalone CLI for the JobNotifier aggregator.
//
// Fetches live tech/AI jobs from every configured source (Greenhouse, Lever,
// Ashby, Workday, Oracle Cloud, aggregators), applies optional role/country
// filters, then the trailing-window filter, and prints the result.
//
// Usage:
//   node bin/aggregate.mjs [options]
//
// Options:
//   --window <hours>   trailing window in hours (default WINDOW_HOURS = 24)
//   --role <bucket>    filter by role: Software | AI/ML | Backend | Cloud | Other
//   --country <name>   filter by country: USA | Canada | Cross-Border | International
//   --json             emit a JSON array on stdout (otherwise a readable table)
//   --help, -h         show this help
//
// Flags accept both "--window 48" and "--window=48". Default output is an
// aligned table (company · title · location · role · source · age); a one-line
// summary (jobs shown / window / sources ok) is written to stderr, so JSON
// piped from stdout stays clean.
//
// Examples:
//   node bin/aggregate.mjs --window 48 --role AI/ML
//   node bin/aggregate.mjs --country USA --json
//
// Runtime: the lib/*.js modules are ESM. Run under a Node that treats them as
// ESM — Node 20.17+/22.7+ (auto-detects module syntax), or any Node once
// package.json has "type": "module". Uses global fetch (Node 18+) and hits the
// network, so a few seconds per run is normal.

import { fetchAllJobs, withinWindow, WINDOW_HOURS } from "../lib/fetchers.js";
import { ROLES } from "../lib/classify.js";

// detectCountry() collapses locations into these four; there is no exported
// list, so keep it in step with lib/classify.js:detectCountry.
const COUNTRIES = ["USA", "Canada", "Cross-Border", "International"];

function parseArgs(argv) {
  const opts = { window: WINDOW_HOURS, role: null, country: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    let flag = argv[i];
    let inlineVal = null;
    if (flag.startsWith("--")) {
      const eq = flag.indexOf("=");
      if (eq !== -1) { inlineVal = flag.slice(eq + 1); flag = flag.slice(0, eq); }
    }
    const value = () => (inlineVal !== null ? inlineVal : argv[++i]);
    switch (flag) {
      case "-h":
      case "--help": opts.help = true; break;
      case "--json": opts.json = true; break;
      case "--window": opts.window = Number(value()); break;
      case "--role": opts.role = value(); break;
      case "--country": opts.country = value(); break;
      default:
        fail(`Unknown option: ${argv[i]}\nRun with --help for usage.`);
    }
  }
  return opts;
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function usage() {
  console.log(
    [
      "aggregate.mjs — standalone CLI for the JobNotifier aggregator.",
      "",
      "Usage:",
      "  node bin/aggregate.mjs [options]",
      "",
      "Options:",
      "  --window <hours>   trailing window in hours (default " + WINDOW_HOURS + ")",
      "  --role <bucket>    filter by role: " + ROLES.join(" | "),
      "  --country <name>   filter by country: " + COUNTRIES.join(" | "),
      "  --json             emit a JSON array on stdout (otherwise a readable table)",
      "  --help, -h         show this help",
      "",
      "Examples:",
      "  node bin/aggregate.mjs --window 48 --role AI/ML",
      "  node bin/aggregate.mjs --country USA --json",
    ].join("\n")
  );
}

function eqi(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

// Resolve a user-supplied filter value to its canonical bucket (case-insensitive);
// returns undefined if it is not a known value.
function canonical(list, value) {
  return list.find((x) => eqi(x, value));
}

function age(postedAt, now) {
  const ms = now - postedAt;
  if (!Number.isFinite(ms) || ms < 0) return "0m";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function trunc(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function printTable(jobs, now) {
  if (!jobs.length) {
    console.log("No jobs match.");
    return;
  }
  const W = { company: 22, title: 46, location: 26, role: 8, source: 12 };
  const pad = (s, n) => String(s).padEnd(n);
  const row = (c, t, l, r, src, a) =>
    [pad(c, W.company), pad(t, W.title), pad(l, W.location), pad(r, W.role), pad(src, W.source), a].join("  ");
  const header = row("COMPANY", "TITLE", "LOCATION", "ROLE", "SOURCE", "AGE");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const j of jobs) {
    console.log(
      row(
        trunc(j.company, W.company),
        trunc(j.title, W.title),
        trunc(j.location, W.location),
        trunc(j.role, W.role),
        trunc(j.source, W.source),
        age(j.postedAt, now)
      )
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (!Number.isFinite(opts.window) || opts.window <= 0) {
    fail("--window must be a positive number of hours.");
  }
  // Resolve filters to canonical buckets up front; reject unknown values (like
  // --window) rather than silently returning an empty result.
  let role = null;
  if (opts.role != null) {
    role = canonical(ROLES, opts.role);
    if (!role) fail(`Unknown role "${opts.role}" (expected: ${ROLES.join(", ")}).`);
  }
  let country = null;
  if (opts.country != null) {
    country = canonical(COUNTRIES, opts.country);
    if (!country) fail(`Unknown country "${opts.country}" (expected: ${COUNTRIES.join(", ")}).`);
  }

  const { jobs, sourcesOk, sourcesTotal } = await fetchAllJobs();

  // Apply role/country filters BEFORE windowing, so withinWindow's per-company
  // and overall caps don't evict matching jobs to make room for filtered-out ones.
  let filtered = jobs;
  if (role) filtered = filtered.filter((j) => j.role === role);
  if (country) filtered = filtered.filter((j) => j.country === country);

  const now = Date.now();
  const out = withinWindow(filtered, now, opts.window);

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    printTable(out, now);
  }
  // Summary on stderr so stdout stays pure data (clean JSON / table when piped).
  console.error(`\n${out.length} jobs shown · window ${opts.window}h · sources ${sourcesOk}/${sourcesTotal} ok`);
}

main().catch((err) => {
  console.error(`aggregate: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
