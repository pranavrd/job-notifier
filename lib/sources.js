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
//   2. it clears the sponsorship gate — the company EITHER has a name-verified
//      recent H-1B/LCA filing (2024+) in the DOL disclosure data (h1bdata.info,
//      the same data behind the USCIS H-1B Employer Data Hub; recent filings weed
//      out paused programs), OR its own job postings state it sponsors work visas
//      (available now, or on a case-by-case basis). Postings that say sponsorship
//      is NOT available, with no recent filing, are excluded.
// The YC-harvest blocks below were sourced by scanning Y Combinator's currently-
// hiring list (yc-oss/api) for companies with a live ATS board, then applying that
// same sponsorship gate (posting text scanned for sponsorship language; filings
// matched on normalized employer name to avoid generic-name false positives).
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
  // --- YC-harvest adds: currently-hiring Y Combinator companies (yc-oss/api) that
  //     expose a live Greenhouse board, gated on sponsorship — each either has a
  //     name-verified recent (2024+) H-1B/LCA filing OR states in its own postings
  //     that it sponsors work visas. (Wellfound & workatastartup themselves have no
  //     usable public jobs API — see the note below — so we reach their startups here.)
  "radar", "algolia", "checkr", "ginkgobioworks", "qventus", "tempo", "xendit",
  "humaninterest", "sendbird", "billiontoone", "novacredit", "maymobility", "kalshi",
  "prolific", "recidiviz", "gather", "raven", "axle", "reflex", "flex", "navierai",
  "momentic", "axiom", "burnt", "clara", "dispatch", "pulse",
];

export const LEVER = [
  "spotify", "gopuff", "ro", "chownow", "swordhealth",
  // added — H-1B sponsors with recent filings + a live Lever board
  "outreach", "wealthfront", "sysdig",
  // --- YC-harvest adds (Lever): sponsorship-gated, same rule as above.
  "mashgin", "thunkable", "snappr", "captivateiq", "canarytechnologies", "culdesac",
  "porter", "gridware", "bolster", "prosper", "newton", "multiplylabs",
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
  // --- YC-harvest adds (Ashby): sponsorship-gated, same rule as above. Ashby is where
  //     most YC startups' boards live, so this is the bulk of the harvest.
  "rescale", "influxdata", "cambly", "eightsleep", "gecko-robotics", "classdojo", "mednet",
  "prelim", "titan", "overview", "middesk", "ashby", "bunkerhillhealth", "atlas", "trm-labs",
  "vorticity", "accord", "paragon", "roboflow", "blissway", "notabene", "flint", "taktile",
  "fieldguide", "axle-health", "vapi", "phoenix", "flutterflow", "odys-aviation", "tavus",
  "kodex", "aleph", "zensors", "stepful", "nash", "sieve", "sphere", "mintlify", "eventual",
  "realitydefender", "chariot", "ekho", "aiprise", "knowtex", "cambio", "latent", "tennr",
  "vooma", "pylon", "vector", "automat", "hockeystack", "twenty", "electricair", "campfire",
  "fleetworks", "sola", "sweep", "pure", "reducto", "garage", "pointone", "furtherai",
  "artisan", "raindrop", "circleback", "sagecare", "kastle", "saturn", "david-ai",
  "simple-ai", "mosaic", "solidroad", "auctor", "flai", "diligencesquared", "asimov",
  "ycombinator", "spellbrush", "ello", "legionhealth", "arq", "mach9", "agave", "stream",
  "artie", "casca", "solveintelligence", "retell-ai", "claimsorted", "thundercompute",
  "ctgt", "hud", "sim", "sygaldry-technologies", "dedalus-labs", "halluminate", "interfere",
  "stilta", "pax-historia",
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
// with its {host, siteNumber}: open its careers page, find the
// `https://<host>/hcmUI/CandidateExperience/en/sites/<siteNumber>/...` URL, and
// confirm `https://<host>/hcmRestApi/resources/latest/recruitingCEJobRequisitions
// ?finder=findReqs;siteNumber=<siteNumber>` returns jobs.
// Every company below is a verified H-1B sponsor (DOL disclosure data, h1bdata.info)
// whose live host/siteNumber was confirmed against the public REST API. There is no
// central directory of Oracle customers, so this list is curated, not harvested.
// (Nokia's & Computershare's newest postings skew non-US; the country filter sorts
// them out. ADI is a heavy sponsor but its Oracle host surfaces only EMEA/non-tech
// roles, so it was left out.)
// Evaluated and left out (no usable public, dated jobs JSON):
//   - iCIMS: career portals are HTML/SPA; REST API needs customer credentials.
//   - Wellfound (wellfound.com): /graphql and /sitemap sit behind a Cloudflare
//     "Security Check" (403); only a brittle SPA scrape is possible.
//   - workatastartup.com (YC): no JSON jobs API; the HTML page bot-walls
//     (200 -> 406) and job details require login. We instead reach YC startups
//     directly through their own Greenhouse/Lever/Ashby boards (harvest above).
export const ORACLE = [
  { name: "Oracle", host: "eeho.fa.us2.oraclecloud.com", siteNumber: "CX_1" },
  { name: "Texas Instruments", host: "edbz.fa.us2.oraclecloud.com", siteNumber: "CX" },
  { name: "JPMorgan Chase", host: "jpmc.fa.oraclecloud.com", siteNumber: "CX_1001" },
  { name: "Nokia", host: "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com", siteNumber: "CX_1" },
  { name: "Coherent", host: "hcwp.fa.us2.oraclecloud.com", siteNumber: "CX_1" },
  { name: "Cantor Fitzgerald", host: "hdow.fa.us6.oraclecloud.com", siteNumber: "CX_1003" },
  { name: "Vertiv", host: "egup.fa.us2.oraclecloud.com", siteNumber: "CX" },
  { name: "Computershare", host: "fa-evdq-saasfaprod1.fa.ocs.oraclecloud.com", siteNumber: "computersharecareers" },
];

// Free aggregator APIs — no key, updated continuously, good for volume/freshness.
export const AGGREGATORS = [
  { kind: "remotive", url: "https://remotive.com/api/remote-jobs?category=software-dev&limit=100" },
  { kind: "arbeitnow", url: "https://www.arbeitnow.com/api/job-board-api" },
];
