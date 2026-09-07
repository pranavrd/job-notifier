// Core mapping layer — pure, no network. Turns a raw ATS posting into the one
// normalized Job shape the rest of the app consumes, and collapses duplicates.
//
// Normalized job:
//   { id, company, title, url, location, country, workType, role, position,
//     source, postedAt, precision, sponsorship }
// postedAt is epoch ms. precision is "exact" (real timestamp) or "day"
// (day-resolution). sponsorship is "verified" | "listed" (see lib/sponsors.js).
//
// This module deliberately imports nothing that touches the network, so it can
// be unit-tested and reused (a Slack bot, a cron) without pulling in fetch code.

import { classifyRole, classifyPosition, detectCountry, detectWorkType } from "./classify.js";
import { sponsorshipFor } from "./sponsors.js";
import { fuzzyKey } from "./match.js";

export function hashId(...parts) {
  const s = parts.join("|").toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function normalize({ company, title, url, location, remoteFlag, hint, postedAt, source, uid, precision = "exact" }) {
  if (!title || !postedAt) return null;
  const role = classifyRole(title);
  if (!role) return null; // not a tech/AI role — keep the feed focused
  const idParts = [company, title, location || ""];
  if (uid) idParts.push(uid); // disambiguate distinct reqs that share a title + location
  const name = company || "Unknown";
  return {
    id: hashId(...idParts),
    company: name,
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
    sponsorship: sponsorshipFor(name), // "verified" (H-1B filer) | "listed" (gate-cleared)
  };
}

// ---- Date mappers (day-resolution sources) ---------------------------------
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

// Oracle Cloud's `PostedDate` is a bare date (day-resolution), so — like
// Workday — map it so roles never land fresher than ~23h and only appear at the
// 24h+ positions.
export function oraclePostedAt(dateStr, now) {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return 0;
  const DAY = 24 * 3600 * 1000;
  let daysAgo = Math.floor(now / DAY) - Math.floor(t / DAY);
  if (daysAgo < 0) daysAgo = 0;      // future-/today-dated
  if (daysAgo > 30) return 0;        // too old -> dropped
  return now - (daysAgo * 24 + 23) * 3600 * 1000;
}

// ---- Dedup -----------------------------------------------------------------
const AGGREGATOR_SOURCES = new Set(["Remotive", "Arbeitnow"]);

// Exact dedup: drop repeats of the same id (company + title + location [+ uid]).
export function dedupeExact(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    out.push(j);
  }
  return out;
}

// Cross-source dedup: an aggregator (Remotive/Arbeitnow) often re-lists a role
// that a company's OWN board already carries. Those echoes differ in location
// text and url, so the exact-id pass misses them. Here we drop an aggregator
// posting when a company-board posting for the same company+title exists, or
// when another aggregator already contributed that company+title.
//
// Conservative by construction: every company-board posting is kept, so a
// company's distinct same-title reqs (e.g. an SF and an NYC "Software Engineer"
// on its own board) all survive — only redundant aggregator copies are removed.
export function dedupeCrossSource(jobs) {
  const boardKeys = new Set();
  for (const j of jobs) {
    if (!AGGREGATOR_SOURCES.has(j.source)) boardKeys.add(fuzzyKey(j));
  }
  const seenAgg = new Set();
  const out = [];
  for (const j of jobs) {
    if (!AGGREGATOR_SOURCES.has(j.source)) {
      out.push(j); // always keep a posting from the company's own board
      continue;
    }
    const k = fuzzyKey(j);
    if (boardKeys.has(k) || seenAgg.has(k)) continue; // redundant aggregator echo
    seenAgg.add(k);
    out.push(j);
  }
  return out;
}
