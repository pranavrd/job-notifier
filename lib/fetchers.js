// Fetchers for each source type. Every fetcher:
//   - is wrapped so a single failing/slow source never breaks the feed
//   - returns a list of NORMALIZED jobs (see shape below)
//
// Normalized job:
//   { id, company, title, url, location, country, workType, role, position, source, postedAt, precision }
// postedAt is epoch ms. precision is "exact" (real timestamp) or "day" (day-resolution).

import { classifyRole, classifyPosition, detectCountry, detectWorkType } from "./classify.js";
import { GREENHOUSE, LEVER, ASHBY, WORKDAY, ORACLE, AGGREGATORS } from "./sources.js";

const TIMEOUT_MS = 8000;
const UA = "job-notifier/1.0 (+https://github.com/) live-feed";

export function hashId(...parts) {
  const s = parts.join("|").toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export function normalize({ company, title, url, location, remoteFlag, hint, postedAt, source, uid, precision = "exact" }) {
  if (!title || !postedAt) return null;
  const role = classifyRole(title);
  if (!role) return null; // not a tech/AI role — keep the feed focused
  const idParts = [company, title, location || ""];
  if (uid) idParts.push(uid); // disambiguate distinct reqs that share a title + location
  return {
    id: hashId(...idParts),
    company: company || "Unknown",
    title: title.trim(),
    url: url || "#",
    location: (location || "").trim() || "Not specified",
    country: detectCountry(location || ""),
    workType: detectWorkType(location || "", title, remoteFlag),
    role,
    position: classifyPosition(title, hint),
    source,
    postedAt,
    precision, // "exact" = real timestamp; "day" = day-resolution (Workday/Oracle)
  };
}

// ---- Greenhouse ------------------------------------------------------------
// `?content=true` is required to get `first_published` — the TRUE post date.
// The plain /jobs endpoint only exposes `updated_at`, which boards bulk-refresh,
// so every role looks "posted today" and floods a 24h feed. We ignore the heavy
// `content` field and keep only what we need.
async function fromGreenhouse(token) {
  const data = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  const company = pretty(token);
  return (data.jobs || []).map((j) =>
    normalize({
      company,
      title: j.title,
      url: j.absolute_url,
      location: j.location && j.location.name,
      hint: "",
      postedAt: Date.parse(j.first_published || j.updated_at || ""),
      source: "Greenhouse",
    })
  );
}

// ---- Lever -----------------------------------------------------------------
async function fromLever(token) {
  const data = await getJSON(`https://api.lever.co/v0/postings/${token}?mode=json`);
  const company = pretty(token);
  return (Array.isArray(data) ? data : []).map((j) =>
    normalize({
      company,
      title: j.text,
      url: j.hostedUrl || j.applyUrl,
      location: j.categories && j.categories.location,
      remoteFlag: (j.workplaceType || "").toLowerCase() === "remote",
      hint: (j.categories && j.categories.commitment) || "",
      postedAt: Number(j.createdAt) || 0,
      source: "Lever",
    })
  );
}

// ---- Ashby -----------------------------------------------------------------
async function fromAshby(token) {
  const data = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
  const company = pretty(token);
  return (data.jobs || []).map((j) =>
    normalize({
      company,
      title: j.title,
      url: j.jobUrl || j.applyUrl,
      location: j.location || (j.address && j.address.postalAddress && j.address.postalAddress.addressLocality),
      remoteFlag: !!j.isRemote,
      hint: j.employmentType || "",
      postedAt: Date.parse(j.publishedAt || j.updatedAt || ""),
      source: "Ashby",
    })
  );
}

// ---- Workday ---------------------------------------------------------------
// Workday only gives a relative post date ("Posted Today"/"Posted Yesterday"/
// "Posted N Days Ago"), so we resolve to DAY granularity and never fresher than
// ~23h. That keeps Workday roles out of the sub-24h slider positions (where we
// can't verify freshness) while still surfacing them at 24h / 36h / 48h.
export function workdayPostedAt(postedOn, now) {
  const s = String(postedOn || "").toLowerCase();
  if (s.includes("today")) return now - 23 * 3600 * 1000;
  if (s.includes("yesterday")) return now - 47 * 3600 * 1000;
  const m = s.match(/(\d+)\+?\s*days?\s*ago/);
  if (m) return now - Math.max(+m[1], 2) * 24 * 3600 * 1000; // 2+ days -> older
  return 0; // unknown -> dropped by normalize()
}

async function fromWorkday({ name, host, tenant, site }) {
  const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify({ limit: 20, offset: 0, searchText: "", appliedFacets: {} }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} workday/${tenant}`);
  const data = await res.json();
  const now = Date.now();
  return (data.jobPostings || []).map((j) =>
    normalize({
      company: name,
      title: j.title,
      url: `https://${host}/${site}${j.externalPath || ""}`,
      location: j.locationsText,
      hint: "",
      postedAt: workdayPostedAt(j.postedOn, now),
      source: "Workday",
      uid: j.externalPath, // unique per posting — avoids title+location id collisions
      precision: "day",
    })
  );
}

// ---- Oracle Cloud (Fusion Recruiting) --------------------------------------
// `PostedDate` is a bare date (day-resolution), so — like Workday — map it so
// roles never land fresher than ~23h and only appear at the 24h+ positions.
export function oraclePostedAt(dateStr, now) {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return 0;
  const DAY = 24 * 3600 * 1000;
  let daysAgo = Math.floor(now / DAY) - Math.floor(t / DAY);
  if (daysAgo < 0) daysAgo = 0;      // future-/today-dated
  if (daysAgo > 30) return 0;        // too old -> dropped
  return now - (daysAgo * 24 + 23) * 3600 * 1000;
}

async function fromOracle({ name, host, siteNumber }) {
  const site = `https://${host}/hcmUI/CandidateExperience/en/sites/${siteNumber}`;
  const data = await getJSON(
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList.secondaryLocations` +
    `&finder=findReqs;siteNumber=${siteNumber},limit=50,sortBy=POSTING_DATES_DESC`
  );
  const list = (data.items && data.items[0] && data.items[0].requisitionList) || [];
  const now = Date.now();
  return list.map((j) => {
    // Include secondaryLocations so a US location that isn't PrimaryLocation is seen.
    const locations = [j.PrimaryLocation, ...(j.secondaryLocations || []).map((s) => s && s.Name)];
    return normalize({
      company: name,
      title: j.Title,
      url: j.Id ? `${site}/job/${j.Id}` : `${site}/requisitions`,
      location: locations.filter(Boolean).join(" · "),
      hint: "",
      postedAt: oraclePostedAt(j.PostedDate, now),
      source: "Oracle Cloud",
      uid: j.Id, // unique requisition id — avoids title+location id collisions
      precision: "day",
    });
  });
}

// ---- Remotive (aggregator) -------------------------------------------------
async function fromRemotive(url) {
  const data = await getJSON(url);
  return (data.jobs || []).map((j) =>
    normalize({
      company: j.company_name,
      title: j.title,
      url: j.url,
      location: j.candidate_required_location,
      remoteFlag: true,
      hint: j.job_type,
      postedAt: Date.parse(j.publication_date || ""),
      source: "Remotive",
    })
  );
}

// ---- Arbeitnow (aggregator) ------------------------------------------------
async function fromArbeitnow(url) {
  const data = await getJSON(url);
  return (data.data || []).map((j) =>
    normalize({
      company: j.company_name,
      title: j.title,
      url: j.url,
      location: j.location,
      remoteFlag: !!j.remote,
      hint: (j.job_types || []).join(" "),
      postedAt: (Number(j.created_at) || 0) * 1000,
      source: "Arbeitnow",
    })
  );
}

function pretty(token) {
  return token
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, "AI");
}

// ---- Orchestration ---------------------------------------------------------
// Cap on how many source fetches are in flight at once. Firing all ~265 tasks
// simultaneously (the old Promise.allSettled path) spikes sockets/memory and
// trips rate limits; a small pool keeps throughput high without the stampede.
const CONCURRENCY = 15;

// Run thunked tasks through a bounded-concurrency pool. Isolates failures like
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

// Fetch every source through the pool; drop the ones that fail or time out.
export async function fetchAllJobs() {
  // Each task carries a label so we can report per-source results. `run` is a
  // thunk — the fetch doesn't start until the pool picks it up.
  const tasks = [
    ...GREENHOUSE.map((t) => ({ source: `Greenhouse:${t}`, run: () => fromGreenhouse(t) })),
    ...LEVER.map((t) => ({ source: `Lever:${t}`, run: () => fromLever(t) })),
    ...ASHBY.map((t) => ({ source: `Ashby:${t}`, run: () => fromAshby(t) })),
    ...WORKDAY.map((c) => ({ source: `Workday:${c.name}`, run: () => fromWorkday(c) })),
    ...ORACLE.map((c) => ({ source: `Oracle Cloud:${c.name}`, run: () => fromOracle(c) })),
    ...AGGREGATORS.map((a) => ({
      source: a.kind === "remotive" ? "Remotive" : "Arbeitnow",
      run: () => (a.kind === "remotive" ? fromRemotive(a.url) : fromArbeitnow(a.url)),
    })),
  ];

  const settled = await runPool(tasks, CONCURRENCY);
  const jobs = [];
  const sources = []; // per-task: { source, ok, count }
  let ok = 0;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const label = tasks[i].source;
    if (r.status === "fulfilled") {
      ok++;
      const produced = (r.value || []).filter(Boolean);
      for (const j of produced) jobs.push(j);
      sources.push({ source: label, ok: true, count: produced.length });
    } else {
      sources.push({ source: label, ok: false, count: 0 });
    }
  }

  // Dedupe by id (company + title + location [+ uid]).
  const seen = new Set();
  const unique = [];
  for (const j of jobs) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    unique.push(j);
  }

  return { jobs: unique, sourcesOk: ok, sourcesTotal: tasks.length, sources };
}

export const WINDOW_HOURS = 24;

// Keep only postings inside the trailing window, sort newest-first, cap how many
// any single company can contribute (so one big board can't dominate the feed),
// and cap the overall payload so the client stays snappy.
export function withinWindow(jobs, now = Date.now(), hours = WINDOW_HOURS, cap = 400, perCompany = 12) {
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
