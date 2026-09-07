// H-1B sponsorship signal, surfaced per card.
//
// Every company in lib/sources.js already cleared the offline SPONSORSHIP GATE
// (see the header there): it either has a name-verified recent (2024+) H-1B/LCA
// filing in the DOL disclosure data, OR its own postings state it sponsors work
// visas (now or case-by-case). That gate decides inclusion; this module decides
// what the card shows about WHY a company is in the feed:
//
//   "verified" — a name-verified recent H-1B/LCA filer. These are the companies
//                I confirmed against DOL data (h1bdata.info): the WORKDAY and
//                ORACLE lists (curated as verified sponsors) plus the board
//                tokens tagged "H-1B sponsors with recent filings" in sources.js.
//   "listed"   — cleared the gate by other means (its postings say it sponsors,
//                or case-by-case) and/or wasn't individually filing-verified.
//                Still a sponsorship-gated company, just not badged H-1B.
//
// This is intentionally conservative: a company is only badged "verified" when
// I actually checked its filings, so the badge never over-promises.

import { normCompany } from "./match.js";
import { WORKDAY, ORACLE } from "./sources.js";

// Board tokens confirmed as recent H-1B/LCA filers (the "added — H-1B sponsors
// with recent filings" blocks across GREENHOUSE/LEVER/ASHBY in sources.js).
// normCompany(token) === normCompany(pretty(token)) for these single-word
// tokens, so matching a job's display company against this set just works.
const H1B_TOKENS = [
  // Greenhouse
  "zscaler", "verkada", "rubrik", "scaleai", "mercury", "amplitude", "newrelic",
  "webflow", "lattice", "udemy", "apolloio", "imbue", "duolingo", "current",
  "tanium", "alloy", "postman", "salesloft", "nextdoor", "cresta", "dataiku",
  "assemblyai",
  // Lever
  "outreach", "wealthfront", "sysdig",
  // Ashby
  "cursor", "fireworks", "character", "thumbtack", "neon", "cerebras", "vanta",
  "kong", "temporal", "anyscale", "miro", "fullstory", "abridge", "airbyte",
  "sardine", "render", "unit", "drata",
];

// WORKDAY + ORACLE companies are curated as verified H-1B sponsors (see the
// headers on those lists in sources.js), so fold their display names in too.
const VERIFIED = new Set(
  [
    ...H1B_TOKENS,
    ...WORKDAY.map((w) => w.name),
    ...ORACLE.map((o) => o.name),
  ].map(normCompany)
);

/**
 * Sponsorship basis for a display company name.
 * @param {string} company
 * @returns {"verified" | "listed"}
 */
export function sponsorshipFor(company) {
  return VERIFIED.has(normCompany(company)) ? "verified" : "listed";
}
