import { NextResponse } from "next/server";
import { fetchAllJobs, withinWindow } from "../../../lib/fetchers.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The client's window slider goes up to 48h, so the API returns the full 48h
// superset and the browser narrows it to the selected window with no refetch.
const MAX_WINDOW_HOURS = 48;

// Small in-memory cache so rapid reloads don't re-hit ~40 upstream APIs.
// The 24h window is applied AFTER the cache, relative to the request time,
// so "last 24h from load / Sync" stays accurate even on a cache hit.
let CACHE = { at: 0, payload: null };
const CACHE_TTL_MS = 90 * 1000;

export async function GET(request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const now = Date.now();

  let raw = CACHE.payload;
  if (fresh || !raw || now - CACHE.at > CACHE_TTL_MS) {
    try {
      raw = await fetchAllJobs();
      CACHE = { at: now, payload: raw };
    } catch (e) {
      if (!raw) {
        return NextResponse.json(
          { jobs: [], error: "Failed to fetch sources", fetchedAt: now, windowHours: WINDOW_HOURS },
          { status: 502 }
        );
      }
    }
  }

  const jobs = withinWindow(raw.jobs, now, MAX_WINDOW_HOURS, 600, 15);

  return NextResponse.json(
    {
      jobs,
      fetchedAt: now,
      windowHours: MAX_WINDOW_HOURS,
      totalTracked: raw.jobs.length,
      sourcesOk: raw.sourcesOk,
      sourcesTotal: raw.sourcesTotal,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
