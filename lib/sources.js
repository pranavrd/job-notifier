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
  "apolloio", "imbue", "duolingo", "current", "tanium", "alloy", "postman",
  "salesloft", "nextdoor", "cresta", "dataiku", "assemblyai",
];

export const LEVER = [
  "spotify", "gopuff", "ro", "chownow", "swordhealth",
  // added — H-1B sponsors with recent filings + a live Lever board
  "outreach", "wealthfront", "sysdig",
];

export const ASHBY = [
  "harvey", "openai", "writer", "ramp", "decagon", "mercor", "notion", "linear",
  "baseten", "watershed", "sierra", "zapier", "cohere", "runway", "hex",
  "clickhouse", "replit", "browserbase", "modal", "supabase", "railway",
  "elevenlabs", "suno", "posthog",
  // added — H-1B sponsors with recent filings + a live Ashby board
  "cursor", "fireworks", "character",
  "thumbtack", "neon", "cerebras", "vanta", "kong", "temporal", "anyscale",
  "miro", "fullstory", "abridge", "airbyte", "sardine", "render", "unit", "drata",
];

// Workday boards — how we reach big H-1B sponsors that DON'T use a public
// Greenhouse/Lever/Ashby board. Workday only exposes a relative post date
// ("Posted Today"), so these are day-resolution: they surface only in the 24h+
// window positions (see fetchers.js). All are well-documented, high-volume H-1B
// sponsors. Each {host, tenant, site} was verified to return live jobs.
export const WORKDAY = [
  { name: "Nvidia", host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" },
  { name: "Salesforce", host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "External_Career_Site" },
  { name: "CrowdStrike", host: "crowdstrike.wd5.myworkdayjobs.com", tenant: "crowdstrike", site: "crowdstrikecareers" },
  { name: "Adobe", host: "adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" },
  { name: "Intel", host: "intel.wd1.myworkdayjobs.com", tenant: "intel", site: "External" },
  { name: "Micron", host: "micron.wd1.myworkdayjobs.com", tenant: "micron", site: "External" },
  { name: "Autodesk", host: "autodesk.wd1.myworkdayjobs.com", tenant: "autodesk", site: "Ext" },
  { name: "eBay", host: "ebay.wd5.myworkdayjobs.com", tenant: "ebay", site: "apply" },
  { name: "PayPal", host: "paypal.wd1.myworkdayjobs.com", tenant: "paypal", site: "jobs" },
  { name: "Zoom", host: "zoom.wd5.myworkdayjobs.com", tenant: "zoom", site: "Zoom" },
  { name: "BlackRock", host: "blackrock.wd1.myworkdayjobs.com", tenant: "blackrock", site: "BlackRock_Professional" },
  { name: "Workday", host: "workday.wd5.myworkdayjobs.com", tenant: "workday", site: "Workday" },
];

// Oracle Cloud (Fusion) Recruiting boards — the candidate REST API is public
// (no key). Like Workday, the post date is day-resolution (`PostedDate` is a
// bare date), so these surface only at the 24h+ window positions. Add a company
// with its {host, siteNumber} from the careers-site network calls.
// (iCIMS was evaluated and left out: its career portals are HTML/SPA with no
// public JSON API — the REST API requires customer credentials.)
export const ORACLE = [
  { name: "Oracle", host: "eeho.fa.us2.oraclecloud.com", siteNumber: "CX_1" },
];

// Free aggregator APIs — no key, updated continuously, good for volume/freshness.
export const AGGREGATORS = [
  { kind: "remotive", url: "https://remotive.com/api/remote-jobs?category=software-dev&limit=100" },
  { kind: "arbeitnow", url: "https://www.arbeitnow.com/api/job-board-api" },
];
