// Fetchers for each source type. Every fetcher:
//   - is wrapped so a single failing/slow source never breaks the feed
//   - returns a list of NORMALIZED jobs (see shape below)
//
// Normalized job:
//   { id, company, title, url, location, country, workType, role, position, source, postedAt }
// postedAt is epoch ms.

import { classifyRole, classifyPosition, detectCountry, detectWorkType } from "./classify.js";
import { GREENHOUSE, LEVER, ASHBY, AGGREGATORS } from "./sources.js";

const TIMEOUT_MS = 8000;
const UA = "job-notifier/1.0 (+https://github.com/) live-feed";

function hashId(...parts) {
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

function normalize({ company, title, url, location, remoteFlag, hint, postedAt, source }) {
  if (!title || !postedAt) return null;
  const role = classifyRole(title);
  if (!role) return null; // not a tech/AI role — keep the feed focused
  return {
    id: hashId(company, title, location || ""),
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
  };
}

// ---- Greenhouse ------------------------------------------------------------
async function fromGreenhouse(token) {
  const data = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  const company = pretty(token);
  return (data.jobs || []).map((j) =>
    normalize({
      company,
      title: j.title,
      url: j.absolute_url,
      location: j.location && j.location.name,
      hint: "",
      postedAt: Date.parse(j.updated_at || j.first_published || ""),
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
// Fetch every source in parallel; drop the ones that fail or time out.
export async function fetchAllJobs() {
  const tasks = [
    ...GREENHOUSE.map((t) => fromGreenhouse(t)),
    ...LEVER.map((t) => fromLever(t)),
    ...ASHBY.map((t) => fromAshby(t)),
    ...AGGREGATORS.map((a) =>
      a.kind === "remotive" ? fromRemotive(a.url) : fromArbeitnow(a.url)
    ),
  ];

  const settled = await Promise.allSettled(tasks);
  const jobs = [];
  let ok = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      ok++;
      for (const j of r.value) if (j) jobs.push(j);
    }
  }

  // Dedupe by id (company + title + location).
  const seen = new Set();
  const unique = [];
  for (const j of jobs) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    unique.push(j);
  }

  return { jobs: unique, sourcesOk: ok, sourcesTotal: tasks.length };
}

export const WINDOW_HOURS = 24;

// Keep only postings inside the trailing window, sort newest-first, and cap
// the payload so the client stays snappy.
export function withinWindow(jobs, now = Date.now(), hours = WINDOW_HOURS, cap = 400) {
  const cutoff = now - hours * 3600 * 1000;
  return jobs
    .filter((j) => j.postedAt >= cutoff && j.postedAt <= now + 5 * 60 * 1000)
    .sort((a, b) => b.postedAt - a.postedAt)
    .slice(0, cap);
}
