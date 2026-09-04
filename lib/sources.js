// Where the jobs come from.
//
// "ats" sources hit a company's OWN public job-board API (the same JSON their
// careers page consumes) — free, no API key, permissive CORS, and about as
// close to "directly from the company" as you can get without a fragile HTML
// scraper. Add a company by dropping its board token into the right list.
//
// To find a token: open a company's careers page and look at the network
// requests, or the URL — e.g. boards.greenhouse.io/<token>, jobs.lever.co/<token>,
// jobs.ashbyhq.com/<token>.

export const GREENHOUSE = [
  "stripe", "databricks", "airbnb", "dropbox", "coinbase", "robinhood",
  "gitlab", "doordash", "brex", "discord", "figma", "samsara", "plaid",
  "retool", "benchling", "reddit", "asana", "flexport", "affirm", "twitch",
  "lyft", "pinterest", "instacart", "gusto", "airtable", "rippling",
];

export const LEVER = [
  "spotify", "hightouch", "mux", "census", "voiceflow", "gopuff",
];

export const ASHBY = [
  "openai", "notion", "linear", "vercel", "cohere", "perplexityai",
  "ramp", "runway", "hex", "clickhouse",
];

// Free aggregator APIs — no key, updated continuously, good for volume/freshness.
export const AGGREGATORS = [
  { kind: "remotive", url: "https://remotive.com/api/remote-jobs?category=software-dev&limit=100" },
  { kind: "arbeitnow", url: "https://www.arbeitnow.com/api/job-board-api" },
];
