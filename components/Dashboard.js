"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ---- filter vocabularies (drive the whole feed) ------------------------- */
const COUNTRIES = ["all", "Canada", "USA", "Cross-Border", "International"];
const COUNTRY_LABEL = { Canada: "CA", USA: "US", "Cross-Border": "US/CA", International: "INTL" };
const WORKTYPES = ["all", "Remote", "Hybrid", "Onsite"];
const POSITIONS = ["all", "Internship", "Full-Time", "New Grad", "Contract", "Co-op"];
const ROLES = ["all", "Software", "AI/ML", "Backend", "Cloud", "Other"];
const POS_COLOR = {
  Internship: "var(--aqua)",
  "Full-Time": "var(--blue)",
  "New Grad": "var(--yellow)",
  Contract: "var(--purple)",
  "Co-op": "var(--orange)",
};

const HIDE_DAYS = 30;
const HIDE_MS = HIDE_DAYS * 24 * 3600 * 1000;
const companyKey = (c) => (c || "").trim().toLowerCase();

const AVATAR = ["--orange", "--yellow", "--aqua", "--blue", "--purple", "--green", "--red"];
function avatarVar(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(${AVATAR[h % AVATAR.length]})`;
}
function relTime(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---- small monochrome icons (no emoji) ---------------------------------- */
const I = {
  search: "M11 4a7 7 0 1 0 4.9 12l4.3 4.3M11 4a7 7 0 0 1 4.9 12",
  pin: "M12 21s-6-5-6-10a6 6 0 0 1 12 0c0 5-6 10-6 10z",
  ext: "M7 17 17 7M9 7h8v8",
  sync: "M20 11a8 8 0 1 0-2 5.3M20 5v6h-6",
  check: "M20 6 9 17l-5-5",
  eyeoff: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7M2 2l20 20",
  flag: "M5 22V4M5 4h13l-2 4 2 4H5",
};
function Icon({ d, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ sourcesOk: 0, sourcesTotal: 0, totalTracked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refTime, setRefTime] = useState(Date.now());
  const [syncing, setSyncing] = useState(false);

  const [country, setCountry] = useState("all");
  const [work, setWork] = useState("all");
  const [position, setPosition] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("new");
  const [q, setQ] = useState("");
  const [view, setView] = useState("feed");
  const [shown, setShown] = useState(18);

  // Per-viewer persisted lists.
  const [applied, setApplied] = useState({});        // id -> true
  const [hidden, setHidden] = useState({});          // id -> hideUntil (ms)
  const [reportedJobs, setReportedJobs] = useState({});     // id -> true
  const [reportedCos, setReportedCos] = useState({});       // companyKey -> true

  const [toast, setToast] = useState(null);          // { msg, undo }
  const toastTimer = useRef(null);

  useEffect(() => {
    setApplied(LS.get("jn_applied", {}));
    setHidden(LS.get("jn_hidden", {}));
    setReportedJobs(LS.get("jn_reported_jobs", {}));
    setReportedCos(LS.get("jn_reported_cos", {}));
    const p = LS.get("jn_prefs", null);
    if (p) {
      setCountry(p.country ?? "all"); setWork(p.work ?? "all");
      setPosition(p.position ?? "all"); setRole(p.role ?? "all"); setSort(p.sort ?? "new");
    }
    load(false);
  }, []);

  async function load(fresh) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/jobs${fresh ? "?fresh=1" : ""}`);
      const data = await res.json();
      if (data.error && !(data.jobs || []).length) throw new Error(data.error);
      setJobs(data.jobs || []);
      setMeta({ sourcesOk: data.sourcesOk || 0, sourcesTotal: data.sourcesTotal || 0, totalTracked: data.totalTracked || 0 });
      setRefTime(data.fetchedAt || Date.now());
    } catch (e) {
      setError(e.message || "Could not load jobs");
    } finally {
      setLoading(false);
    }
  }

  function sync() {
    setSyncing(true);
    load(true).then(() => { setSyncing(false); flash("Synced — roles from the last 24 hours"); });
  }

  function flash(msg, undo = null) {
    setToast({ msg, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 5000 : 2600);
  }

  function savePrefs() {
    LS.set("jn_prefs", { country, work, position, role, sort });
    flash("Preferences saved to this browser");
  }

  /* ---- per-card actions ---- */
  function toggleApplied(job) {
    setApplied((prev) => {
      const next = { ...prev };
      const wasApplied = !!next[job.id];
      if (wasApplied) delete next[job.id]; else next[job.id] = true;
      LS.set("jn_applied", next);
      flash(wasApplied ? "Moved back to the feed" : "Marked applied — moved to Applications");
      return next;
    });
  }
  function hideJob(job) {
    setHidden((prev) => {
      const next = { ...prev, [job.id]: Date.now() + HIDE_MS };
      LS.set("jn_hidden", next);
      return next;
    });
    flash(`Hidden for ${HIDE_DAYS} days`, () => {
      setHidden((prev) => { const n = { ...prev }; delete n[job.id]; LS.set("jn_hidden", n); return n; });
    });
  }
  function reportJob(job) {
    const key = companyKey(job.company);
    setReportedJobs((prev) => { const n = { ...prev, [job.id]: true }; LS.set("jn_reported_jobs", n); return n; });
    setReportedCos((prev) => { const n = { ...prev, [key]: true }; LS.set("jn_reported_cos", n); return n; });
    flash(`Reported — ${job.company} hidden for good`, () => {
      setReportedJobs((prev) => { const n = { ...prev }; delete n[job.id]; LS.set("jn_reported_jobs", n); return n; });
      setReportedCos((prev) => { const n = { ...prev }; delete n[key]; LS.set("jn_reported_cos", n); return n; });
    });
  }

  const appliedCount = useMemo(() => Object.keys(applied).length, [applied]);

  // 24h window relative to load/sync time.
  const windowJobs = useMemo(() => {
    const cutoff = refTime - 24 * 3600 * 1000;
    return jobs.filter((j) => j.postedAt >= cutoff);
  }, [jobs, refTime]);

  // The working feed drops anything applied (it moves to Applications), hidden
  // (still within its month), or reported (job or whole company).
  const liveJobs = useMemo(() => {
    const now = Date.now();
    return windowJobs.filter((j) =>
      !applied[j.id] && !reportedCos[companyKey(j.company)] && !reportedJobs[j.id] && !(hidden[j.id] > now)
    );
  }, [windowJobs, applied, hidden, reportedJobs, reportedCos]);

  const applyFacets = (arr) => {
    const ql = q.trim().toLowerCase();
    return arr.filter((j) => {
      if (work !== "all" && j.workType !== work) return false;
      if (position !== "all" && j.position !== position) return false;
      if (role !== "all" && j.role !== role) return false;
      if (country !== "all" && j.country !== country) return false;
      if (ql) {
        const hay = `${j.company} ${j.title} ${j.location} ${j.role} ${j.position}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  };

  // Channel counts (feed context, minus country so each card shows its own tally).
  const counts = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const base = liveJobs.filter((j) => {
      if (work !== "all" && j.workType !== work) return false;
      if (position !== "all" && j.position !== position) return false;
      if (role !== "all" && j.role !== role) return false;
      if (ql) {
        const hay = `${j.company} ${j.title} ${j.location} ${j.role} ${j.position}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    return {
      all: base.length,
      Canada: base.filter((j) => j.country === "Canada").length,
      USA: base.filter((j) => j.country === "USA").length,
      "Cross-Border": base.filter((j) => j.country === "Cross-Border").length,
    };
  }, [liveJobs, work, position, role, q]);

  const list = useMemo(() => {
    const source = view === "apps"
      ? windowJobs.filter((j) => applied[j.id] && !reportedCos[companyKey(j.company)] && !reportedJobs[j.id])
      : liveJobs;
    let out = applyFacets(source);
    if (sort === "new") out = [...out].sort((a, b) => b.postedAt - a.postedAt);
    else if (sort === "company") out = [...out].sort((a, b) => a.company.localeCompare(b.company));
    else if (sort === "title") out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    return out;
  }, [view, liveJobs, windowJobs, applied, reportedCos, reportedJobs, country, work, position, role, q, sort]);

  const visible = list.slice(0, shown);
  useEffect(() => { setShown(18); }, [country, work, position, role, q, view]);

  return (
    <div className="wrap">
      {/* header */}
      <header className="nav">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bg-hard)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
          </div>
          <div>
            <h1>JobNotifier <span className="ver">v2</span></h1>
            <p><span className="dot" /> Live tech &amp; AI roles · last 24 hours</p>
          </div>
        </div>
        <nav className="navbtns">
          <button className={`nbtn ${view === "feed" ? "on" : ""}`} onClick={() => setView("feed")}>
            Job Feed <span className="badge">{liveJobs.length}</span>
          </button>
          <button className={`nbtn ${view === "apps" ? "on" : ""}`} onClick={() => setView("apps")}>
            Applications <span className="badge">{appliedCount}</span>
          </button>
          <button className="nbtn" onClick={sync} disabled={syncing}>
            <span className={syncing ? "spin" : ""} style={{ display: "inline-flex" }}><Icon d={I.sync} size={14} /></span>
            {syncing ? "Syncing" : "Sync"}
          </button>
          <span className="user"><span className="uava">A</span>Alex</span>
        </nav>
      </header>

      {/* channel cards */}
      <section className="stats">
        <StatCard label="All Jobs" value={counts.all} sub="last 24h" tone="--orange"
          active={country === "all"} onClick={() => setCountry("all")} />
        <StatCard label="Canada" value={counts.Canada} sub="Toronto · Waterloo · Remote CA" tone="--aqua"
          active={country === "Canada"} onClick={() => setCountry("Canada")} />
        <StatCard label="USA" value={counts.USA} sub="SF · NYC · Seattle · Remote US" tone="--blue"
          active={country === "USA"} onClick={() => setCountry("USA")} />
        <StatCard label="Cross-Border" value={counts["Cross-Border"]} sub="Dual-eligible roles" tone="--purple"
          active={country === "Cross-Border"} onClick={() => setCountry("Cross-Border")} />
      </section>

      {/* controls */}
      <section className="panel">
        <div className="searchrow">
          <label className="search">
            <Icon d={I.search} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by company, role title, city, or tech stack" />
          </label>
          <button className="ctl save" onClick={savePrefs}>Save preferences</button>
          <select className="ctl" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Newest first</option>
            <option value="company">Company (A-Z)</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </div>

        <div className="filters">
          <FilterRow label="Country" items={COUNTRIES} value={country} onChange={setCountry}
            render={(v) => v === "all" ? "All countries" : v} />
          <FilterRow label="Work type" items={WORKTYPES} value={work} onChange={setWork}
            render={(v) => v === "all" ? "All" : v} />
          <FilterRow label="Position" items={POSITIONS} value={position} onChange={setPosition}
            render={(v) => v === "all" ? "All types" : v} accent />
          <FilterRow label="Roles" items={ROLES} value={role} onChange={setRole}
            render={(v) => v === "all" ? "All roles" : v} />
        </div>
      </section>

      {/* result summary */}
      <div className="resultbar">
        <div className="count">
          {loading ? "Fetching live roles…"
            : <><b>{list.length}</b> {view === "apps" ? "applied" : "matching"} {list.length === 1 ? "role" : "roles"}{view === "apps" ? "" : " · posted in the last 24h"}</>}
        </div>
        <div className="meta">
          {meta.sourcesOk}/{meta.sourcesTotal} sources live · {meta.totalTracked} scanned · synced {relTime(refTime)}
        </div>
      </div>

      {/* grid */}
      {error ? (
        <div className="empty">Couldn’t reach the job sources.<br /><button className="ctl" onClick={sync} style={{ marginTop: 14 }}>Try again</button></div>
      ) : loading && !jobs.length ? (
        <div className="grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card skel" />)}</div>
      ) : !list.length ? (
        <div className="empty">
          {view === "apps"
            ? "No applications yet. Mark roles Applied to track them here."
            : "No roles posted in the last 24 hours match these filters."}
          <div className="empty-sub">
            {view === "apps" ? "The check button on a card adds it here." : "The window is strict — press Sync to check again, or widen a filter."}
          </div>
        </div>
      ) : (
        <>
          <section className="grid">
            {visible.map((j) => (
              <JobCard key={j.id} job={j} applied={!!applied[j.id]}
                onApplied={() => toggleApplied(j)} onHide={() => hideJob(j)} onReport={() => reportJob(j)} />
            ))}
          </section>
          {list.length > shown && (
            <button className="more" onClick={() => setShown((n) => n + 18)}>
              Load more ({list.length - shown} remaining)
            </button>
          )}
        </>
      )}

      <footer className="foot">
        Real postings from company job boards (Greenhouse · Lever · Ashby) and free aggregators (Remotive · Arbeitnow).
      </footer>

      {toast && (
        <div className="toast show">
          <span>{toast.msg}</span>
          {toast.undo && <button className="undo" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}

/* ---- subcomponents ------------------------------------------------------- */
function StatCard({ label, value, sub, tone, active, onClick }) {
  return (
    <button className={`stat ${active ? "sel" : ""}`} onClick={onClick} style={{ "--tone": `var(${tone})` }}>
      <div className="stat-label">{label}</div>
      <div className="stat-num">{value}</div>
      <div className="stat-sub">{sub}</div>
    </button>
  );
}

function FilterRow({ label, items, value, onChange, render, accent }) {
  return (
    <div className={`frow ${accent ? "accent" : ""}`}>
      <span className="flabel">{label}</span>
      <div className="pills">
        {items.map((v) => (
          <button key={v} className={`pill ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
            {render(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

function JobCard({ job, applied, onApplied, onHide, onReport }) {
  return (
    <article className="card">
      <div className="chead">
        <div className="cava" style={{ background: avatarVar(job.company) }}>{job.company[0]}</div>
        <div className="cco">
          <div className="cname">{job.company}</div>
          <div className="cmeta">
            <span className="ctag">{COUNTRY_LABEL[job.country] || job.country}</span>
            <span className="crole">{job.role}</span>
            <span className="csrc">{job.source}</span>
          </div>
        </div>
        <span className="cpos" style={{ color: POS_COLOR[job.position] || "var(--fg3)", borderColor: POS_COLOR[job.position] || "var(--border)" }}>
          {job.position}
        </span>
      </div>

      <h3 className="ctitle">{job.title}</h3>

      <div className="crow">
        <Icon d={I.pin} size={13} />
        <span className="cloc">{job.location}</span>
        <span className="cage">{relTime(job.postedAt)}</span>
      </div>

      <div className="cfoot">
        <a className="apply" href={job.url} target="_blank" rel="noopener noreferrer">
          Apply <Icon d={I.ext} size={12} />
        </a>
        <div className="actions">
          <button className={`abtn applied ${applied ? "on" : ""}`} onClick={onApplied}
            aria-label={applied ? "Applied — click to unmark" : "Mark as applied"}
            title={applied ? "Applied (click to unmark)" : "Mark as applied"}>
            <Icon d={I.check} size={15} />
          </button>
          <button className="abtn hide" onClick={onHide}
            aria-label="Hide for a month" title="Hide this role for 30 days">
            <Icon d={I.eyeoff} size={15} />
          </button>
          <button className="abtn report" onClick={onReport}
            aria-label="Report and hide company forever" title="Report — never show this job or company again">
            <Icon d={I.flag} size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
