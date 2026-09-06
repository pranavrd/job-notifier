// Shared type definitions for JobNotifier — documentation only.
//
// This file contains ZERO runtime code: it is a set of JSDoc `@typedef`s that
// editors and tooling (VS Code, tsserver, `tsc --checkJs`) pick up to give
// autocomplete and type hints across the codebase. Nothing imports it at
// runtime; import the types with `@type {import("./types.js").Job}` etc.
//
// The normalized job shape is produced by `normalize()` in lib/fetchers.js.
// Enum string values below mirror lib/classify.js exactly.

// ---- Enums -----------------------------------------------------------------

/**
 * Role bucket the UI filters on (see `ROLES` in lib/classify.js). "Other"
 * intentionally captures Full-Stack, Forward-Deployed (FDE) and Agentic-AI.
 * @typedef {"Software" | "AI/ML" | "Backend" | "Cloud" | "Other"} Role
 */

/**
 * Position type (see `POSITIONS` in lib/classify.js). Prefers the ATS's
 * structured field (Lever `commitment`, Ashby `employmentType`) and falls back
 * to parsing the title; defaults to "Full-Time".
 * @typedef {"Internship" | "Full-Time" | "New Grad" | "Contract" | "Co-op"} Position
 */

/**
 * Country channel, heuristically detected from the free-text location
 * (see `detectCountry` in lib/classify.js).
 * @typedef {"USA" | "Canada" | "Cross-Border" | "International"} Country
 */

/**
 * Work type, heuristically detected from location/title/remote flag
 * (see `detectWorkType` in lib/classify.js).
 * @typedef {"Remote" | "Hybrid" | "Onsite"} WorkType
 */

/**
 * Human-readable source label set by each fetcher in lib/fetchers.js.
 * @typedef {"Greenhouse" | "Lever" | "Ashby" | "Workday" | "Oracle Cloud" | "Remotive" | "Arbeitnow"} Source
 */

/**
 * Post-date resolution. "exact" = a real timestamp from the ATS; "day" =
 * day-resolution only (Workday/Oracle expose a relative or bare date, so these
 * are floored to ~23h and surface only at the 24h+ window positions).
 * @typedef {"exact" | "day"} Precision
 */

// ---- Normalized job --------------------------------------------------------

/**
 * A single normalized posting — the one shape the rest of the app consumes.
 * Produced by `normalize()` in lib/fetchers.js; returns `null` (and is dropped)
 * when there is no title, no `postedAt`, or the title isn't a tech/AI role.
 *
 * @typedef {Object} Job
 * @property {string}    id        Stable hash of company + title + location (+ a per-req uid for Workday/Oracle to avoid collisions). Also the dedupe key.
 * @property {string}    company   Display name (ATS token prettified, or the config `name`); "Unknown" if missing.
 * @property {string}    title     Trimmed job title.
 * @property {string}    url       Absolute apply/posting URL; "#" if missing.
 * @property {string}    location  Free-text location; "Not specified" if missing.
 * @property {Country}   country   Detected country channel.
 * @property {WorkType}  workType  Detected work type.
 * @property {Role}      role      Detected role bucket.
 * @property {Position}  position  Detected position type.
 * @property {Source}    source    Which fetcher produced it.
 * @property {number}    postedAt  Post time as epoch milliseconds.
 * @property {Precision} precision Timestamp resolution ("exact" | "day").
 */

// ---- Source configs (lib/sources.js) ---------------------------------------

/**
 * Greenhouse / Lever / Ashby are configured as arrays of string board tokens.
 * A token is the slug in the board URL — e.g. `boards.greenhouse.io/<token>`,
 * `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`. Invalid tokens are
 * skipped safely at fetch time.
 * @typedef {string} BoardToken
 */

/**
 * A Workday board config (WORKDAY in lib/sources.js). Reaches big H-1B sponsors
 * with no public Greenhouse/Lever/Ashby board. Day-resolution post dates.
 * @typedef {Object} WorkdaySource
 * @property {string} name    Display name used as the job's company.
 * @property {string} host    Workday host, e.g. "nvidia.wd5.myworkdayjobs.com".
 * @property {string} tenant  Workday tenant, e.g. "nvidia".
 * @property {string} site    Career-site id, e.g. "NVIDIAExternalCareerSite".
 */

/**
 * An Oracle Cloud (Fusion Recruiting) board config (ORACLE in lib/sources.js).
 * The candidate REST API is public; post dates are day-resolution.
 * @typedef {Object} OracleSource
 * @property {string} name        Display name used as the job's company.
 * @property {string} host        Oracle host, e.g. "eeho.fa.us2.oraclecloud.com".
 * @property {string} siteNumber  Site id from the `.../sites/<siteNumber>/...` URL.
 */

/**
 * A free aggregator endpoint (AGGREGATORS in lib/sources.js).
 * @typedef {Object} AggregatorSource
 * @property {"remotive" | "arbeitnow"} kind  Which aggregator fetcher to use.
 * @property {string}                   url   Full JSON endpoint URL.
 */

/**
 * The shape of a successful fetch pass (return of `fetchAllJobs` in
 * lib/fetchers.js).
 * @typedef {Object} FetchResult
 * @property {Job[]}  jobs         Deduped normalized jobs (unfiltered by window).
 * @property {number} sourcesOk    Count of sources that fetched successfully.
 * @property {number} sourcesTotal Total sources attempted.
 */

export {};
