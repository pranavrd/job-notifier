// Single source of truth for JobNotifier's tunables and shared vocabularies.
//
// Every layer imports its constants from here — the server (lib/fetchers.js,
// app/api/**), the client (components/Dashboard.js), and the headless sibling
// tools (bin/aggregate.mjs, scripts/vet.mjs). Defining a value once means the
// window sizes, caps, and filter buckets can never drift between the API, the
// browser, and the CLI (they used to be copied into all three).
//
// This module is PURE DATA: no imports, no server-only APIs, no runtime logic.
// That keeps it safe to import from a "use client" component as well as from a
// plain Node script.

// ---- Filter vocabularies (the feed's buckets) ------------------------------
// These mirror the values produced by lib/classify.js. The UI prefixes an
// "all" sentinel for its pills; the canonical members live here.
export const ROLES = ["Software", "AI/ML", "Backend", "Cloud", "Other"];
export const POSITIONS = ["Internship", "Full-Time", "New Grad", "Contract", "Co-op"];
export const COUNTRIES = ["Canada", "USA", "Cross-Border", "International"];
export const WORKTYPES = ["Remote", "Hybrid", "Onsite"];

// ---- Fetch tunables --------------------------------------------------------
export const TIMEOUT_MS = 8000; // per-source fetch timeout
export const CONCURRENCY = 15;  // max source fetches in flight at once (bounded pool)
export const USER_AGENT = "job-notifier/1.0 (+https://github.com/) live-feed";

// ---- Window / cap tunables -------------------------------------------------
export const WINDOW_HOURS = 24;      // default trailing window — the honest feed
export const MAX_WINDOW_HOURS = 48;  // widest the client slider reaches; the API returns this superset
export const WINDOW_STEPS = [1, 2, 3, 6, 12, 24, 36, 48]; // slider stops (hours)
export const FEED_CAP = 600;         // max jobs the API/feed returns
export const PER_COMPANY_CAP = 15;   // max roles one company can contribute
export const HIDE_DAYS = 30;         // how long the per-card "Hide" suppresses a role

// ---- Cache -----------------------------------------------------------------
export const CACHE_TTL_MS = 90 * 1000; // in-memory TTL shared by the API route and the RSS feed
