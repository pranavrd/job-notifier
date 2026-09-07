// ATS adapters — one uniform contract per source family.
//
// Adding a new ATS is writing one adapter object and dropping it in the
// ADAPTERS array below; the orchestrator in lib/fetchers.js iterates adapters ×
// configs and needs no change. An adapter is:
//
//   {
//     id:        string                 // stable key, e.g. "greenhouse"
//     configs:   T[]                    // the per-board configs from lib/sources.js
//     label:     (config) => string     // per-task id for the sources[] health report
//     list:      async (config) => raw[]        // fetch → array of raw postings
//     normalize: (raw, config, ctx) => Job|null // map one raw posting via normalize()
//   }
//
// `ctx` carries values shared across a single fetch pass — currently { now } —
// so day-resolution adapters floor their relative dates against one clock read.

import { normalize, workdayPostedAt, oraclePostedAt } from "./normalize.js";
import { TIMEOUT_MS, USER_AGENT } from "./config.js";
import { GREENHOUSE, LEVER, ASHBY, WORKDAY, ORACLE, AGGREGATORS } from "./sources.js";

async function getJSON(url, init) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Turn an ATS board token into a display company name ("scale-ai" -> "Scale AI").
function pretty(token) {
  return token
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, "AI");
}

// ---- Greenhouse ------------------------------------------------------------
// `?content=true` is required to get `first_published` — the TRUE post date.
// The plain /jobs endpoint only exposes `updated_at`, which boards bulk-refresh,
// so every role looks "posted today" and floods a 24h feed.
const greenhouse = {
  id: "greenhouse",
  configs: GREENHOUSE,
  label: (t) => `Greenhouse:${t}`,
  list: (t) =>
    getJSON(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`).then((d) => d.jobs || []),
  normalize: (j, t) =>
    normalize({
      company: pretty(t),
      title: j.title,
      url: j.absolute_url,
      location: j.location && j.location.name,
      hint: "",
      postedAt: Date.parse(j.first_published || j.updated_at || ""),
      source: "Greenhouse",
    }),
};

// ---- Lever -----------------------------------------------------------------
const lever = {
  id: "lever",
  configs: LEVER,
  label: (t) => `Lever:${t}`,
  list: (t) =>
    getJSON(`https://api.lever.co/v0/postings/${t}?mode=json`).then((d) => (Array.isArray(d) ? d : [])),
  normalize: (j, t) =>
    normalize({
      company: pretty(t),
      title: j.text,
      url: j.hostedUrl || j.applyUrl,
      location: j.categories && j.categories.location,
      remoteFlag: (j.workplaceType || "").toLowerCase() === "remote",
      hint: (j.categories && j.categories.commitment) || "",
      postedAt: Number(j.createdAt) || 0,
      source: "Lever",
    }),
};

// ---- Ashby -----------------------------------------------------------------
const ashby = {
  id: "ashby",
  configs: ASHBY,
  label: (t) => `Ashby:${t}`,
  list: (t) =>
    getJSON(`https://api.ashbyhq.com/posting-api/job-board/${t}`).then((d) => d.jobs || []),
  normalize: (j, t) =>
    normalize({
      company: pretty(t),
      title: j.title,
      url: j.jobUrl || j.applyUrl,
      location: j.location || (j.address && j.address.postalAddress && j.address.postalAddress.addressLocality),
      remoteFlag: !!j.isRemote,
      hint: j.employmentType || "",
      postedAt: Date.parse(j.publishedAt || j.updatedAt || ""),
      source: "Ashby",
    }),
};

// ---- Workday ---------------------------------------------------------------
const workday = {
  id: "workday",
  configs: WORKDAY,
  label: (c) => `Workday:${c.name}`,
  list: async ({ host, tenant, site }) => {
    const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ limit: 20, offset: 0, searchText: "", appliedFacets: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} workday/${tenant}`);
    const data = await res.json();
    return data.jobPostings || [];
  },
  normalize: (j, { name, host, site }, ctx) =>
    normalize({
      company: name,
      title: j.title,
      url: `https://${host}/${site}${j.externalPath || ""}`,
      location: j.locationsText,
      hint: "",
      postedAt: workdayPostedAt(j.postedOn, ctx.now),
      source: "Workday",
      uid: j.externalPath, // unique per posting — avoids title+location id collisions
      precision: "day",
    }),
};

// ---- Oracle Cloud (Fusion Recruiting) --------------------------------------
const oracle = {
  id: "oracle",
  configs: ORACLE,
  label: (c) => `Oracle Cloud:${c.name}`,
  list: async ({ host, siteNumber }) => {
    const data = await getJSON(
      `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
        `?onlyData=true&expand=requisitionList.secondaryLocations` +
        `&finder=findReqs;siteNumber=${siteNumber},limit=50,sortBy=POSTING_DATES_DESC`
    );
    return (data.items && data.items[0] && data.items[0].requisitionList) || [];
  },
  normalize: (j, { name, host, siteNumber }, ctx) => {
    const site = `https://${host}/hcmUI/CandidateExperience/en/sites/${siteNumber}`;
    // Include secondaryLocations so a US location that isn't PrimaryLocation is seen.
    const locations = [j.PrimaryLocation, ...(j.secondaryLocations || []).map((s) => s && s.Name)];
    return normalize({
      company: name,
      title: j.Title,
      url: j.Id ? `${site}/job/${j.Id}` : `${site}/requisitions`,
      location: locations.filter(Boolean).join(" · "),
      hint: "",
      postedAt: oraclePostedAt(j.PostedDate, ctx.now),
      source: "Oracle Cloud",
      uid: j.Id, // unique requisition id — avoids title+location id collisions
      precision: "day",
    });
  },
};

// ---- Aggregators (Remotive / Arbeitnow) ------------------------------------
// One adapter over the AGGREGATORS array; list + normalize dispatch on `kind`.
const aggregators = {
  id: "aggregators",
  configs: AGGREGATORS,
  label: (a) => (a.kind === "remotive" ? "Remotive" : "Arbeitnow"),
  list: async (a) => {
    const d = await getJSON(a.url);
    return (a.kind === "remotive" ? d.jobs : d.data) || [];
  },
  normalize: (j, a) =>
    a.kind === "remotive"
      ? normalize({
          company: j.company_name,
          title: j.title,
          url: j.url,
          location: j.candidate_required_location,
          remoteFlag: true,
          hint: j.job_type,
          postedAt: Date.parse(j.publication_date || ""),
          source: "Remotive",
        })
      : normalize({
          company: j.company_name,
          title: j.title,
          url: j.url,
          location: j.location,
          remoteFlag: !!j.remote,
          hint: (j.job_types || []).join(" "),
          postedAt: (Number(j.created_at) || 0) * 1000,
          source: "Arbeitnow",
        }),
};

export const ADAPTERS = [greenhouse, lever, ashby, workday, oracle, aggregators];
