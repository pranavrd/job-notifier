// Cron endpoint — the hourly email digest. Vercel Cron hits this every hour
// (see vercel.json); it self-gates on the Pacific-time slot (lib/notify.js), so
// it only actually sends at 7AM + hourly 9AM–9PM PT.
//
// Env vars:
//   CRON_SECRET     Vercel sends this as `Authorization: Bearer …` on cron runs.
//                   When set, requests without it are rejected (so the route
//                   can't be triggered by anyone). Also accepted as `?secret=`.
//   RESEND_API_KEY  Resend API key (required to send).
//   NOTIFY_TO       recipient address (required to send).
//   NOTIFY_FROM     sender (default "JobNotifier <onboarding@resend.dev>").
//   NOTIFY_QUERY    optional facet filter, e.g. "role=AI/ML&country=USA".
//
// Test helpers (query params): ?dry=1 renders without sending; ?force=1 ignores
// the slot gate (uses ?hours= or 1h) so you can preview off-schedule.

import { NextResponse } from "next/server";
import { getCachedJobs } from "../../../../lib/fetchers.js";
import { notificationWindow, parseNotifyQuery, selectJobs, ptHour } from "../../../../lib/notify.js";
import { renderDigest, sendEmail } from "../../../../lib/email.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const now = Date.now();

  // Authorize: Vercel Cron sends the Bearer header; a manual test can pass ?secret=.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const ok = request.headers.get("authorization") === `Bearer ${secret}` || params.get("secret") === secret;
    if (!ok) return json({ error: "unauthorized" }, 401);
  }

  const dry = params.get("dry") === "1";
  const force = params.get("force") === "1";

  // Which window are we in? Precedence:
  //   1. force (test only) — synthesize a window from ?hours= regardless of clock.
  //   2. NOTIFY_WINDOW_HOURS — fixed-window mode: every run sends a digest for
  //      this many hours, bypassing the PT-slot gate. This is the Vercel Hobby
  //      path — Hobby cron runs at most once/day, so set NOTIFY_WINDOW_HOURS=24
  //      and a daily cron for one 24h digest (the hourly-slot schedule needs Pro).
  //   3. Otherwise — the real PT schedule (7AM + hourly 9AM–9PM); off-schedule
  //      hours do nothing.
  const fixedHours = Number(process.env.NOTIFY_WINDOW_HOURS);
  let win;
  if (force) {
    const hours = Number(params.get("hours")) || 1;
    win = { ptHour: ptHour(new Date(now)), hours, isCatchup: false, label: `the last ${hours} hours (forced)` };
  } else if (Number.isFinite(fixedHours) && fixedHours > 0) {
    win = { ptHour: ptHour(new Date(now)), hours: fixedHours, isCatchup: false, label: `the last ${fixedHours} hours` };
  } else {
    win = notificationWindow(new Date(now));
    if (!win) return json({ skipped: true, reason: "not a send hour", ptHour: ptHour(new Date(now)) });
  }

  const { role, country, work } = parseNotifyQuery(process.env.NOTIFY_QUERY);

  let raw;
  try {
    ({ raw } = await getCachedJobs({ fresh: true, now }));
  } catch {
    return json({ error: "failed to fetch sources" }, 502);
  }

  const jobs = selectJobs(raw.jobs, { now, hours: win.hours, role, country, work });

  // Nothing new → don't send an empty email.
  if (!jobs.length) return json({ sent: false, count: 0, window: win.label });

  const feedQs = process.env.NOTIFY_QUERY ? `?${process.env.NOTIFY_QUERY}` : "";
  const { subject, html, text } = renderDigest(jobs, {
    windowLabel: win.label,
    appUrl: url.origin,
    feedUrl: `${url.origin}/api/feed${feedQs}`,
  });

  if (dry) return json({ dry: true, count: jobs.length, window: win.label, subject });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO;
  const from = process.env.NOTIFY_FROM || "JobNotifier <onboarding@resend.dev>";
  if (!apiKey || !to) {
    return json({ skipped: true, reason: "email not configured (set RESEND_API_KEY and NOTIFY_TO)", count: jobs.length });
  }

  try {
    const result = await sendEmail({ apiKey, from, to, subject, html, text });
    return json({ sent: true, count: jobs.length, window: win.label, to, id: result && result.id });
  } catch (e) {
    return json({ sent: false, error: String(e && e.message ? e.message : e), count: jobs.length }, 502);
  }
}
