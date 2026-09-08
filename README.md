# JobNotifier

A live tech & AI job feed. It pulls **real postings** from company job boards and
free aggregators, classifies them, and shows only roles **posted in the last 24
hours** — in a Gruvbox Dark, emoji-free UI.

Built with Next.js (App Router). No API keys, no database, deploys to Vercel as-is.

## How it works

```
Browser  ──► /api/jobs  (JSON) ─┐
RSS reader ─► /api/feed (RSS)  ─┴─► getCachedJobs (90s cache, stale-while-revalidate)
                                        │
                                        ▼  fetchAllJobs — one adapter per ATS (lib/adapters.js)
                 ├─ Greenhouse boards API   (company careers data, per company)
                 ├─ Lever postings API      (company careers data, per company)
                 ├─ Ashby job-board API     (company careers data, per company)
                 ├─ Workday CXS API         (big sponsors off the public boards)
                 ├─ Oracle Cloud CE API     (Fusion Recruiting, public JSON)
                 ├─ Remotive API            (free remote-jobs aggregator)
                 └─ Arbeitnow API           (free job-board aggregator)
                                        │
          normalize → classify role/position → detect country/work-type → tag H-1B
                                        │
          dedupe (exact id, then cross-source) → keep trailing window → sort newest-first
```

All fetching happens **server-side**, so there are no CORS problems and a slow or
failing source never breaks the page (each is wrapped in `Promise.allSettled`
with an 8s timeout). Results are cached in memory for 90s; the 24h window is
applied *after* the cache, relative to each request, so "last 24h from load or
Sync" stays accurate.

### Why these sources

Greenhouse / Lever / Ashby expose a company's own job board as public JSON — the
same data the company's careers page renders. That's the most reliable way to get
postings **directly from the company** without a brittle HTML scraper that gets
blocked. The two aggregators add volume and guarantee the feed stays fresh.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

```bash
npm run build && npm start   # production build
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it at [vercel.com/new](https://vercel.com/new) — it auto-detects Next.js.
3. Deploy. No environment variables required for the app + RSS feed. The email
   digest is opt-in — add the `RESEND_API_KEY` / `NOTIFY_TO` / `CRON_SECRET` vars
   from the [Email digests](#email-digests-push) table to turn it on.

(Or `npm i -g vercel && vercel` from this folder.)

## Configure the feed

The **sources** live in [`lib/sources.js`](lib/sources.js); the **tunables**
(window, caps, timeout, cache TTL, filter buckets) live in
[`lib/config.js`](lib/config.js) and are shared by every layer.

- `GREENHOUSE`, `LEVER`, `ASHBY` — arrays of company **board tokens** (exact
  post dates). Add a company by finding its token (e.g. `boards.greenhouse.io/<token>`,
  `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`) and dropping it in the
  right list. Wrong tokens are skipped safely.
- `WORKDAY` — `{name, host, tenant, site}` configs for companies that use
  Workday instead of a public board (Nvidia, Salesforce, Intel, Adobe, …). This
  is how the feed reaches big H-1B sponsors that have no Greenhouse/Lever/Ashby
  board. Workday exposes only a **relative** post date, so these roles are
  day-resolution and surface only at the 24h/36h/48h window positions.
- `ORACLE` — `{name, host, siteNumber}` configs for Oracle Cloud (Fusion)
  Recruiting boards, whose candidate REST API is public. `PostedDate` is a bare
  date, so these are day-resolution too (24h+ only). There's no central directory
  of Oracle customers, so this list is hand-curated: each is a verified H-1B
  sponsor (Texas Instruments, JPMorgan Chase, Nokia, Coherent, Cantor Fitzgerald,
  Vertiv, Computershare, Oracle). Find a new one's host/siteNumber in the
  `.../hcmUI/CandidateExperience/en/sites/<siteNumber>/...` URL on its careers page.
- `AGGREGATORS` — free JSON endpoints.

**Not supported (no usable public, dated jobs JSON):** **iCIMS** (HTML/SPA portals;
REST API needs per-customer credentials), **Wellfound** (`/graphql` and `/sitemap`
behind a Cloudflare "Security Check", 403), and **workatastartup.com** (no JSON
jobs API; the HTML page bot-walls 200→406 and job details require login). Rather
than scrape those front-doors, the feed reaches the startups behind them **directly
through their own Greenhouse/Lever/Ashby boards** — see the YC harvest below.

**YC harvest.** Most Y Combinator / Wellfound startups run a public ATS board under
the hood. The `GREENHOUSE`/`LEVER`/`ASHBY` lists include a large block sourced by
scanning YC's currently-hiring companies (`yc-oss/api`) for a live board, then
applying the sponsorship gate (below).

The list currently holds ~270 companies (≈88 Greenhouse, ≈20 Lever, ≈142 Ashby,
12 Workday, 8 Oracle Cloud) plus 2 aggregators — every one vetted for a live board
**and** the sponsorship gate. There is no hard limit; adding more is just more
entries. With ~88 Greenhouse boards read at `?content=true`, a cold fetch pulls a
lot of data (~7s for all ~272 sources in parallel); results are cached 90s so it
only happens on a cache miss.

Classification rules (the 5 role buckets and 6 position types) live in
[`lib/classify.js`](lib/classify.js).

## The filters (and how they map to the data)

| Filter | Values |
| --- | --- |
| **Country** | All · Canada · USA · Cross-Border · International (detected from location) |
| **Work type** | All · Remote · Hybrid · Onsite |
| **Position** | All · Internship · Full-Time · New Grad · Contract · Co-op |
| **Roles** | All · Software · AI/ML · Backend · Cloud · Other |

`Other` deliberately captures **Full-Stack, Forward-Deployed (FDE), and Agentic-AI**
titles. Position type prefers the ATS's structured field (Lever `commitment`,
Ashby `employmentType`) and falls back to parsing the title.

**Window slider:** a slider (1h · 2h · 3h · 6h · 12h · 24h · 36h · 48h, default
24h) sets how far back "posted" reaches, relative to page load / last Sync. The
API returns the full 48h superset and the browser narrows it instantly — no
refetch when you drag the slider.

**Sources are sponsorship-gated.** Every company in `lib/sources.js` has a live ATS
board **and** clears a sponsorship gate: it EITHER has a name-verified recent
H-1B/LCA filing (2024+) in the DOL disclosure data (h1bdata.info, the data behind
the USCIS H-1B Employer Data Hub — recent filings weed out paused programs), OR its
own postings state it sponsors work visas (now, or case-by-case). Companies whose
postings say sponsorship is *not* available, with no recent filing, are excluded.
Filings are matched on normalized employer name so a generically-named startup
(e.g. "Atlas") isn't credited with an unrelated big filer's petitions.

**Seniority filter:** this board targets early-career / individual-contributor
roles, so titles marked Senior / Staff / Principal / Lead / Manager / Director /
VP / Architect (and similar) are dropped in `lib/classify.js`. Mid-levels like
"Software Engineer II" are kept.

## Per-card actions

Each card has three actions (stored per-browser in `localStorage`, no accounts):

- **Applied** (check) — moves the role **out of the feed** into the **Applications**
  tab (un-applying there returns it to the feed).
- **Hide** (eye) — removes the role for **30 days**, then it can resurface.
- **Report** (flag) — hides that role **and the whole company, permanently**.

Each Hide / Report shows an **Undo** in the toast.

## Notifications

Two ways to get told about new roles — one zero-config (RSS), one push (email).

### RSS (zero config)

Subscribe once and your reader tells you about new matching roles — no accounts,
no secrets, no cron, no database.

- **Feed endpoint:** `/api/feed` emits the current feed as RSS 2.0. It's
  filterable via query params that map to the same buckets as the UI:
  `/api/feed?window=24&role=AI/ML&country=USA&work=Remote`. Unknown values are
  ignored (a hand-typed URL still returns a feed). Item `guid`s are the stable
  job `id`, so a reader shows each posting once and flags genuinely new ones.
- **Subscribe button:** the nav's **Subscribe** button builds a feed URL that
  mirrors your *current* filters and copies it to the clipboard (falling back to
  opening it) — set the filters you care about, then paste the URL into your
  reader.
- **Auto-discovery:** the page advertises `/api/feed` via a `<link
  rel="alternate" type="application/rss+xml">`, so readers pointed at the site
  find it automatically.

### Email digests (push)

An hourly email digest via [Resend](https://resend.com), scheduled by Vercel
Cron. The cron route [`/api/cron/notify`](app/api/cron/notify/route.js) fires
every hour and **self-gates on Pacific time** (`lib/notify.js`): it sends at 7AM
plus hourly 9AM–9PM PT. Each send covers the span *since the previous slot* (7AM
catch-up = 10h of overnight postings; 9AM = 2h; the rest = 1h), computed from the
clock — **no datastore** is needed to avoid repeats. Only `precision:"exact"`
roles are emailed (Workday/Oracle day-resolution roles can't be pinned to an
hour; they still appear in the app and RSS). Empty windows send nothing.

Setup (all in Vercel → Project → Settings → Environment Variables):

| Var | Required | What |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | From your Resend dashboard. |
| `NOTIFY_TO` | yes | Recipient address. |
| `NOTIFY_FROM` | no | Sender; defaults to `JobNotifier <onboarding@resend.dev>` (Resend's test sender only delivers to your own account email — verify a domain in Resend to send elsewhere). |
| `NOTIFY_QUERY` | no | Scope the digest, e.g. `role=AI/ML&country=USA&work=Remote`. |
| `CRON_SECRET` | recommended | Vercel sends it as a Bearer token on cron runs; when set, the route rejects requests without it. |

The cron is declared in [`vercel.json`](vercel.json). **Plan note:** hourly cron
needs Vercel **Pro** — on **Hobby**, cron runs at most once per day, so change the
schedule to a single daily run (e.g. `"schedule": "0 14 * * *"` for the 7AM PT /
14:00 UTC catch-up) and it degrades to one daily digest. Test without waiting for
the clock: `GET /api/cron/notify?dry=1&force=1&hours=48` renders the digest (count
+ subject) without sending; drop `dry=1` to actually send.

> **Future:** replace the polling digest with instant alerts the moment a new
> sponsored role is posted. Deferred pending a design pass — it needs per-job
> "already notified" state (a datastore) and a tighter trigger, which is a
> different shape from the storage-free hourly window here.

**H-1B badge.** Cards for name-verified recent H-1B/LCA filers show a small
green **H-1B** tag (the WORKDAY + ORACLE lists and the board tokens tagged in
`lib/sources.js`, mapped in [`lib/sponsors.js`](lib/sponsors.js)). Every other
company in the feed still cleared the sponsorship gate — the badge just marks the
ones whose filings were individually verified, so it never over-promises.

## Reuse

The feed is built around one small, stable data contract, so the fetch/normalize
layer is reusable on its own (a CLI, a cron job, a Slack bot) without the Next.js
UI. Types are documented as JSDoc `@typedef`s in [`lib/types.js`](lib/types.js) —
no runtime code, just hints editors and `tsc --checkJs` pick up.

### The normalized Job contract

Every source is reduced by `normalize()` in [`lib/fetchers.js`](lib/fetchers.js)
to the same shape:

```js
{
  id,        // stable hash of company + title + location (+ req uid); also the dedupe key
  company,   // display name
  title,     // trimmed
  url,       // absolute apply/posting URL
  location,  // free-text, "Not specified" if missing
  country,   // "USA" | "Canada" | "Cross-Border" | "International"
  workType,  // "Remote" | "Hybrid" | "Onsite"
  role,      // "Software" | "AI/ML" | "Backend" | "Cloud" | "Other"
  position,  // "Internship" | "Full-Time" | "New Grad" | "Contract" | "Co-op"
  source,    // "Greenhouse" | "Lever" | "Ashby" | "Workday" | "Oracle Cloud" | "Remotive" | "Arbeitnow"
  postedAt,  // epoch ms
  precision, // "exact" | "day"
  sponsorship, // "verified" (name-verified recent H-1B/LCA filer) | "listed" (gate-cleared)
}
```

**`precision`** is the freshness contract. `"exact"` means a real per-posting
timestamp (Greenhouse `first_published`, Lever `createdAt`, Ashby `publishedAt`,
aggregator publish dates). `"day"` means the source only exposes a relative or
bare date (Workday, Oracle Cloud), so `postedAt` is floored to ~23h and the role
surfaces only at the 24h / 36h / 48h window positions — never in the sub-24h
slider, where its freshness can't be verified. `normalize()` drops anything with
no title, no `postedAt`, or a non-tech/AI title (returns `null`).

`fetchAllJobs()` returns `{ jobs, sourcesOk, sourcesTotal, sources }` (the last
is a per-source health array, surfaced by `/api/jobs?debug=1`); `withinWindow(jobs,
now, hours, cap, perCompany)` applies the trailing window, newest-first sort, and
the per-company / overall caps. Both the JSON API and the RSS feed go through
`getCachedJobs()`, a 90s in-memory cache with stale-while-revalidate, so the two
endpoints share one upstream fan-out.

### Where the knobs live

All tunables and shared vocabularies are defined once in
[`lib/config.js`](lib/config.js) and imported by the server, the client, and the
sibling tools — so the window sizes, caps, timeout, and the role/position/country
filter buckets can never drift between them. Change a cap or add a filter bucket
there and every layer follows.

### Adding a new ATS

Every source family is expressed as one **adapter** in
[`lib/adapters.js`](lib/adapters.js) with a uniform contract:

```js
{
  id,               // stable key, e.g. "greenhouse"
  configs,          // the array of per-board configs from lib/sources.js
  label(config),    // per-task id for the sources[] health report
  async list(config),          // fetch → array of raw postings
  normalize(raw, config, ctx), // map one raw posting via normalize()
}
```

The orchestrator in `lib/fetchers.js` iterates `ADAPTERS × configs`, so a brand
new ATS is one adapter object appended to `ADAPTERS` — no orchestrator changes.
The mapping/dedupe core is in [`lib/normalize.js`](lib/normalize.js) (pure, no
network), so it can be unit-tested and reused without the fetch layer.

### Cross-source dedup

Jobs are deduped in two passes. `dedupeExact` drops repeats of the same `id`
(company + title + location [+ req uid]). `dedupeCrossSource` then removes
**aggregator echoes** — the same role that a company's own board already carries
but Remotive/Arbeitnow also re-list (they differ in location text and url, so the
exact pass misses them). It's conservative: every company-board posting is kept
(so a company's distinct same-title reqs on its own board all survive), and only
redundant aggregator copies are dropped.

### Add a company

All config is in [`lib/sources.js`](lib/sources.js) (see also "Configure the
feed" above for how to find each value):

- **Greenhouse / Lever / Ashby** — arrays of string **board tokens**. Drop the
  token into `GREENHOUSE`, `LEVER`, or `ASHBY`. These give exact post dates.
- **Workday** — push a `{ name, host, tenant, site }` object onto `WORKDAY`.
- **Oracle Cloud** — push a `{ name, host, siteNumber }` object onto `ORACLE`.
- **Aggregators** — push a `{ kind, url }` object onto `AGGREGATORS` (`kind` is
  `"remotive"` or `"arbeitnow"`).

No other file needs touching — the orchestrator in `lib/fetchers.js` iterates
each list. Bad tokens/hosts fail their one fetch and are dropped; the feed keeps
going.

### Sibling tools

Two headless tools reuse the same fetch/normalize layer (no server, no browser):

- **CLI feed** — print the current feed to your terminal:

  ```bash
  node bin/aggregate.mjs --window 24 --role AI/ML --country USA
  node bin/aggregate.mjs --window 48 --json        # machine-readable
  ```

  `--window` (hours), `--role`, and `--country` map to the same values as the UI
  filters; `--json` emits the raw normalized `Job[]` for piping.

- **Source health check** — verify every configured board still returns jobs:

  ```bash
  node scripts/vet.mjs
  ```

  Hits each source once and reports which are live, empty, or failing — run it
  after editing `lib/sources.js` to catch dead tokens/hosts before they ship.

- **RSS feed** — subscribe to the live feed (or a filtered slice) from any reader:

  ```
  /api/feed?window=24&role=AI/ML&country=USA&work=Remote
  ```

  Same fetch/normalize/window layer, rendered as RSS 2.0 (see "Notifications"
  above). No server of your own needed — it's a route in this app.

### Shipped from the roadmap

The coupled refactors that were previously deferred now live in the tree:

- **Single source-of-truth config** — [`lib/config.js`](lib/config.js) holds
  every tunable (window, caps, timeout, cache TTL) and the filter vocabularies;
  the server, the client, and the sibling tools all import from it.
- **Full ATS adapter interface** — [`lib/adapters.js`](lib/adapters.js): each
  ATS is one adapter object; the orchestrator iterates `ADAPTERS × configs`.
- **Cross-source dedup** — `dedupeCrossSource` in
  [`lib/normalize.js`](lib/normalize.js) drops aggregator echoes of roles the
  company's own board already carries.
- **H-1B enrichment** — the `sponsorship` field on every job, shown as the H-1B
  card badge ([`lib/sponsors.js`](lib/sponsors.js)).
- **Notifications** — RSS feed *and* the hourly email digest above.

### Still deferred

- **Instant email alerts** — the current digest polls on a schedule. Sending the
  moment a sponsored role is posted needs per-job "already notified" state (a
  datastore) and a tighter trigger — a different shape from the storage-free
  hourly window. Deferred pending a design pass.
- **Slack / webhook push** — the same digest content POSTed to a Slack incoming
  webhook instead of email; small add-on to the cron route once wanted.
- **Fuzzier dedup** — cross-source dedup is deliberately conservative (exact
  company + title). Token-overlap / edit-distance matching would collapse more
  near-duplicates, at the risk of merging genuinely distinct reqs.

## Notes & limitations

- **24h window is strict and honest.** Every source uses a true post date
  (Greenhouse via `first_published`, read with `?content=true`; Lever `createdAt`;
  Ashby `publishedAt`; aggregators their publish dates). A genuine "posted in the
  last 24h" tech feed is naturally small — expect tens, not hundreds — because
  most postings older than a day are excluded. Add companies in `lib/sources.js`
  to raise volume. Each company is also capped (12 roles) so one big board can't
  dominate.
- Country/work-type are heuristic from free-text locations.
- Applied / hidden / reported lists live per-browser in `localStorage` (no accounts).
