// Notification scheduling + selection logic — pure, no network, no email.
//
// Cadence (Pacific time, DST-aware via America/Los_Angeles): an hourly send at
// the top of each hour from 9AM to 9PM, plus a 7AM "overnight catch-up" that
// sweeps everything posted after the previous night's 9PM send. Each send
// covers the span SINCE THE PREVIOUS scheduled slot, so the whole 24h is covered
// with no gaps and no overlaps — computed from the clock, so no datastore is
// needed to track what was already sent.
//
//   slot 07  -> 10h window (since 21:00 the night before)
//   slot 09  ->  2h window (since 07:00)
//   slot 10..21 -> 1h window each
//
// The cron fires hourly (see vercel.json) and self-gates: on a non-slot hour
// notificationWindow() returns null and the route does nothing. Firing hourly
// but keying off the actual PT hour keeps the schedule correct across DST,
// which a fixed-UTC cron expression cannot.

import { ROLES, COUNTRIES, WORKTYPES } from "./config.js";

// Scheduled PT send hours, ascending. 7AM catch-up, then hourly 9AM–9PM.
export const SLOTS = [7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

// Current hour (0–23) in Pacific time for a given instant.
export function ptHour(date = new Date()) {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return parseInt(s, 10) % 24; // "24" (midnight in some ICU builds) -> 0
}

// Human label for a send, e.g. "the last hour" / "the last 2 hours" /
// "overnight (last 10 hours)".
function windowLabel(hours, isCatchup) {
  if (isCatchup) return `overnight (last ${hours} hours)`;
  if (hours === 1) return "the last hour";
  return `the last ${hours} hours`;
}

// The digest window for the current PT slot, or null when the current PT hour
// isn't a scheduled slot. `hours` is the lookback since the previous slot.
export function notificationWindow(now = new Date()) {
  const h = ptHour(now);
  const idx = SLOTS.indexOf(h);
  if (idx === -1) return null; // not a send hour — skip
  const prev = idx === 0 ? SLOTS[SLOTS.length - 1] : SLOTS[idx - 1];
  const hours = ((h - prev + 24) % 24) || 24; // span since the previous slot
  const isCatchup = idx === 0; // the 7AM overnight send
  return { ptHour: h, hours, isCatchup, label: windowLabel(hours, isCatchup) };
}

// Resolve a value to its canonical bucket (case-insensitive); null if unknown.
const canonical = (list, value) =>
  value == null ? null : list.find((x) => x.toLowerCase() === String(value).toLowerCase()) || null;

// Parse an optional NOTIFY_QUERY like "role=AI/ML&country=USA&work=Remote" into
// canonical facet values. Unknown values are ignored (treated as no filter).
export function parseNotifyQuery(str) {
  const p = new URLSearchParams(str || "");
  return {
    role: canonical(ROLES, p.get("role")),
    country: canonical(COUNTRIES, p.get("country")),
    work: canonical(WORKTYPES, p.get("work")),
  };
}

// Pick the roles to email: only EXACT-precision postings (Workday/Oracle
// day-resolution roles can't be pinned to an hour, so they'd either never match
// a short window or repeat every day — excluded from email; still in app/RSS),
// inside the trailing window, matching the optional facet filters, newest-first.
export function selectJobs(jobs, { now = Date.now(), hours, role, country, work, cap = 200 } = {}) {
  const cutoff = now - hours * 3600 * 1000;
  let out = jobs.filter(
    (j) => j.precision === "exact" && j.postedAt >= cutoff && j.postedAt <= now + 5 * 60 * 1000
  );
  if (role) out = out.filter((j) => j.role === role);
  if (country) out = out.filter((j) => j.country === country);
  if (work) out = out.filter((j) => j.workType === work);
  out.sort((a, b) => b.postedAt - a.postedAt);
  return out.slice(0, cap);
}
