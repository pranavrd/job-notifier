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

- `GREENHOUSE`, `LEVER`, `ASHBY` — arrays of company **board tokens**. Add a
  company by finding its token (e.g. `boards.greenhouse.io/<token>`,
  `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`) and dropping it in the
  right list. Wrong tokens are skipped safely.
- `AGGREGATORS` — free JSON endpoints.

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
