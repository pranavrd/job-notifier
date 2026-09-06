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
  const params = new URL(request.url).searchParams;
  const fresh = params.get("fresh") === "1";
  const debug = params.get("debug") === "1";
  const now = Date.now();

  let raw = CACHE.payload;
  let stale = false;
  if (fresh || !raw || now - CACHE.at > CACHE_TTL_MS) {
    try {
      raw = await fetchAllJobs();
      CACHE = { at: now, payload: raw };
    } catch (e) {
      // Stale-while-revalidate: if the refetch fails but a previous payload is
      // cached, serve that last-good copy (flagged stale) instead of erroring.
      if (!raw) {
        return NextResponse.json(
          { jobs: [], error: "Failed to fetch sources", fetchedAt: now, windowHours: MAX_WINDOW_HOURS },
          { status: 502, headers: { "Cache-Control": "no-store" } }
        );
      }
      // Back off: keep the last-good payload warm for another TTL so an upstream
      // outage doesn't re-run the full ~40-source fan-out on every request.
      stale = true;
      CACHE = { at: now, payload: raw };
    }
  }

  const jobs = withinWindow(raw.jobs, now, MAX_WINDOW_HOURS, 600, 15);

  const body = {
    jobs,
    fetchedAt: now,
    windowHours: MAX_WINDOW_HOURS,
    totalTracked: raw.jobs.length,
    sourcesOk: raw.sourcesOk,
    sourcesTotal: raw.sourcesTotal,
  };
  if (stale) body.stale = true;
  // Defensive: `sources` may or may not exist depending on lib/fetchers.js.
  if (debug) body.sources = raw.sources || [];

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
