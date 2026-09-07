# JobNotifier

A live tech & AI job feed. It pulls **real postings** from company job boards and
free aggregators, classifies them, and shows only roles **posted in the last 24
hours** — in a Gruvbox Dark, emoji-free UI.

Built with Next.js (App Router). No API keys, no database, deploys to Vercel as-is.

## How it works

```
Browser ──► /api/jobs (Next route, server-side)
                 │
                 ├─ Greenhouse boards API   (company careers data, per company)
                 ├─ Lever postings API      (company careers data, per company)
                 ├─ Ashby job-board API     (company careers data, per company)
                 ├─ Workday CXS API         (big sponsors off the public boards)
                 ├─ Oracle Cloud CE API     (Fusion Recruiting, public JSON)
                 ├─ Remotive API            (free remote-jobs aggregator)
                 └─ Arbeitnow API           (free job-board aggregator)
                 │
          normalize → classify role/position → detect country/work-type
                 │
          keep only postings from the trailing 24h → dedupe → sort newest-first
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
3. Deploy. No environment variables required.

(Or `npm i -g vercel && vercel` from this folder.)

## Configure the feed

Everything lives in [`lib/sources.js`](lib/sources.js):

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
}
```

**`precision`** is the freshness contract. `"exact"` means a real per-posting
timestamp (Greenhouse `first_published`, Lever `createdAt`, Ashby `publishedAt`,
aggregator publish dates). `"day"` means the source only exposes a relative or
bare date (Workday, Oracle Cloud), so `postedAt` is floored to ~23h and the role
surfaces only at the 24h / 36h / 48h window positions — never in the sub-24h
slider, where its freshness can't be verified. `normalize()` drops anything with
no title, no `postedAt`, or a non-tech/AI title (returns `null`).

`fetchAllJobs()` returns `{ jobs, sourcesOk, sourcesTotal }`; `withinWindow(jobs,
now, hours, cap, perCompany)` applies the trailing window, newest-first sort, and
the per-company / overall caps.

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

### Deferred / roadmap

Coupled refactors intentionally left out to keep this pass small:

- **Single source-of-truth config** — one module that both the app and the
  sibling tools import for sources + tunables (window, caps, timeout), instead of
  the current split between `lib/sources.js` and `lib/fetchers.js`.
- **Full ATS adapter interface** — a uniform `{ id, list(config), normalize(raw) }`
  contract so a new ATS is one adapter file, not another `from*` function wired
  into the orchestrator.
- **Notifications** — push/email/Slack on new matching postings (the reason the
  repo is named *JobNotifier*).
- **Cross-source dedup** — the same role listed on a company board *and* an
  aggregator is currently deduped only by `id` (company + title + location);
  fuzzier matching would collapse more true duplicates.
- **H-1B enrichment** — surface the sponsorship signal per card (it's used today
  only as an offline inclusion gate, not shown in the feed).

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
