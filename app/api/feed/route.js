// RSS feed — the zero-config notification channel for JobNotifier.
//
// Point any RSS reader at /api/feed and it polls for new matching roles: that's
// "notify me" with no accounts, no secrets, no cron, no database — the same
// deploy-as-is ethos as the rest of the app. The feed is filterable via query
// params so a reader can subscribe to exactly one slice:
//
//   /api/feed?window=24&role=AI/ML&country=USA&work=Remote
//
// window (hours, 1..48) · role · country · work all map to the same buckets as
// the UI filters (case-insensitive; unknown values are ignored, not errored, so
// a hand-typed URL still returns a feed). Item guids are the stable job id, so
// a reader shows each posting once and flags genuinely new ones.

import { getCachedJobs, withinWindow } from "../../../lib/fetchers.js";
import {
  ROLES,
  COUNTRIES,
  WORKTYPES,
  WINDOW_HOURS,
  MAX_WINDOW_HOURS,
  FEED_CAP,
  PER_COMPANY_CAP,
} from "../../../lib/config.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

// Resolve a user value to its canonical bucket (case-insensitive); null if unknown.
const canonical = (list, value) =>
  value == null ? null : list.find((x) => x.toLowerCase() === String(value).toLowerCase()) || null;

function renderRss({ items, now, self, home, title, desc }) {
  const rows = items
    .map((j) => {
      const meta = [j.location, j.role, j.position, j.workType, j.source]
        .filter((v) => v && v !== "Not specified")
        .join(" · ");
      const tag = j.sponsorship === "verified" ? " [H-1B]" : "";
      return [
        "    <item>",
        `      <title>${xml(`${j.title} — ${j.company}${tag}`)}</title>`,
        `      <link>${xml(j.url)}</link>`,
        `      <guid isPermaLink="false">${xml(j.id)}</guid>`,
        `      <pubDate>${new Date(j.postedAt).toUTCString()}</pubDate>`,
        `      <category>${xml(j.role)}</category>`,
        `      <description>${xml(meta)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(title)}</title>`,
    `    <link>${xml(home)}</link>`,
    `    <description>${xml(desc)}</description>`,
    `    <lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${xml(self)}" rel="self" type="application/rss+xml" />`,
    rows,
    "  </channel>",
    "</rss>",
  ].join("\n");
}

export async function GET(request) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const now = Date.now();

  // Absent / blank / non-positive `window` falls back to the default (Number(null)
  // is 0, so guard explicitly); a valid value is clamped to [1, MAX_WINDOW_HOURS].
  const wRaw = p.get("window");
  const w = wRaw == null || wRaw === "" ? NaN : Number(wRaw);
  const windowHours = Number.isFinite(w) && w >= 1 ? Math.min(w, MAX_WINDOW_HOURS) : WINDOW_HOURS;
  const role = canonical(ROLES, p.get("role"));
  const country = canonical(COUNTRIES, p.get("country"));
  const work = canonical(WORKTYPES, p.get("work"));

  let raw;
  try {
    ({ raw } = await getCachedJobs({ now }));
  } catch {
    return new Response("Failed to fetch sources", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  // Filter BEFORE windowing so the per-company / overall caps don't evict
  // matching roles to make room for filtered-out ones.
  let jobs = raw.jobs;
  if (role) jobs = jobs.filter((j) => j.role === role);
  if (country) jobs = jobs.filter((j) => j.country === country);
  if (work) jobs = jobs.filter((j) => j.workType === work);
  jobs = withinWindow(jobs, now, windowHours, FEED_CAP, PER_COMPANY_CAP);

  const facets = [
    role || null,
    country || null,
    work || null,
    `last ${windowHours}h`,
  ].filter(Boolean);
  const home = url.origin;
  const body = renderRss({
    items: jobs,
    now,
    self: url.href,
    home,
    title: `JobNotifier — ${facets.join(" · ")}`,
    desc: `Live tech & AI roles (${facets.join(", ")}). ${jobs.length} in this feed.`,
  });

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
