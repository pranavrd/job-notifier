// Where the jobs come from.
//
// "ats" sources hit a company's OWN public job-board API (the same JSON their
// careers page consumes) — free, no API key, permissive CORS, and about as
// close to "directly from the company" as you can get without a fragile HTML
// scraper. Add a company by dropping its board token into the right list.
//
// To find a token: open a company's careers page and look at the network
// requests, or the URL — e.g. boards.greenhouse.io/<token>, jobs.lever.co/<token>,
// jobs.ashbyhq.com/<token>. Invalid tokens are skipped safely at fetch time.
//
// Every token below was validated on two axes before inclusion:
//   1. it returns real jobs from its public ATS board, AND
//   2. the company has recent H-1B/LCA filings (2024+) in the DOL disclosure
//      data (h1bdata.info, the same data behind the USCIS H-1B Employer Data
//      Hub) — recent filings are used to exclude programs that appear paused.
// Greenhouse is read with `?content=true` so we can use the true `first_published`
// date — see lib/fetchers.js.

export const GREENHOUSE = [
  "anthropic", "databricks", "stripe", "mongodb", "brex", "cloudflare", "samsara",
  "elastic", "coinbase", "instacart", "gusto", "datadog", "gitlab", "roblox",
  "okta", "squarespace", "peloton", "dropbox", "reddit", "affirm", "sofi",
  "twilio", "airbnb", "discord", "flexport", "chime", "robinhood", "figma",
  "asana", "twitch", "lyft", "pinterest", "airtable", "faire", "gemini",
  "cockroachlabs", "applovin", "coursera", "carta",
  // added — H-1B sponsors with recent filings + a live Greenhouse board
  "zscaler", "verkada", "rubrik", "scaleai", "mercury", "amplitude",
  "newrelic", "webflow", "lattice", "udemy",
];

export const LEVER = [
  "spotify", "gopuff", "ro", "chownow", "swordhealth",
];

export const ASHBY = [
  "harvey", "openai", "writer", "ramp", "decagon", "mercor", "notion", "linear",
  "baseten", "watershed", "sierra", "zapier", "cohere", "runway", "hex",
  "clickhouse", "replit", "browserbase", "modal", "supabase", "railway",
  "elevenlabs", "suno", "posthog",
  // added — H-1B sponsors with recent filings + a live Ashby board
  "cursor", "fireworks", "character",
];

// Free aggregator APIs — no key, updated continuously, good for volume/freshness.
export const AGGREGATORS = [
  { kind: "remotive", url: "https://remotive.com/api/remote-jobs?category=software-dev&limit=100" },
  { kind: "arbeitnow", url: "https://www.arbeitnow.com/api/job-board-api" },
];
