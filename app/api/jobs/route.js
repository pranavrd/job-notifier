import { NextResponse } from "next/server";
import { getCachedJobs, withinWindow } from "../../../lib/fetchers.js";
import { MAX_WINDOW_HOURS, FEED_CAP, PER_COMPANY_CAP } from "../../../lib/config.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const fresh = params.get("fresh") === "1";
  const debug = params.get("debug") === "1";
  const now = Date.now();

  // The window is applied AFTER the cache, relative to request time, so "last
  // 24h from load / Sync" stays accurate even on a cache hit. The client slider
  // reaches 48h, so return the full 48h superset and let the browser narrow it.
  let raw, stale;
  try {
    ({ raw, stale } = await getCachedJobs({ fresh, now }));
  } catch {
    // Cold miss with nothing cached — nothing to serve.
    return NextResponse.json(
      { jobs: [], error: "Failed to fetch sources", fetchedAt: now, windowHours: MAX_WINDOW_HOURS },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const jobs = withinWindow(raw.jobs, now, MAX_WINDOW_HOURS, FEED_CAP, PER_COMPANY_CAP);

  const body = {
    jobs,
    fetchedAt: now,
    windowHours: MAX_WINDOW_HOURS,
    totalTracked: raw.jobs.length,
    sourcesOk: raw.sourcesOk,
    sourcesTotal: raw.sourcesTotal,
  };
  if (stale) body.stale = true;
  if (debug) body.sources = raw.sources || [];

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
