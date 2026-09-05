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
  date, so these are day-resolution too (24h+ only). Seeded with Oracle itself.
  Find host/siteNumber in a company's careers-site network calls.
- `AGGREGATORS` — free JSON endpoints.

**iCIMS is not supported:** its career portals are HTML/SPA with no public JSON
feed, and its REST API needs per-customer credentials — fetching it would mean
brittle HTML scraping, so it was left out on purpose.

The list currently holds ~123 companies (≈61 Greenhouse, ≈8 Lever, ≈42 Ashby,
12 Workday) plus 2 aggregators — every one vetted for a live board **and** recent
H-1B filings. There is no hard limit; adding more is just more entries. With
~60 Greenhouse boards read at `?content=true`, a cold fetch pulls a lot of data
(a few seconds); results are cached 90s so it only happens on a cache miss.

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

**Sources are H-1B-gated.** Every company in `lib/sources.js` was vetted to have
a live ATS board **and** recent H-1B/LCA filings (2024+) in the DOL disclosure
data (h1bdata.info, the data behind the USCIS H-1B Employer Data Hub). Recent
filings are used to weed out programs that appear paused.

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
