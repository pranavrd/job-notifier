"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ---- filter vocabularies (drive the whole feed) ------------------------- */
const COUNTRIES = ["all", "Canada", "USA", "Cross-Border", "International"];
const COUNTRY_LABEL = { Canada: "CA", USA: "US", "Cross-Border": "US/CA", International: "INTL" };
const WORKTYPES = ["all", "Remote", "Hybrid", "Onsite"];
const POSITIONS = ["all", "Internship", "Full-Time", "New Grad", "Contract", "Co-op"];
const ROLES = ["all", "Software", "AI/ML", "Backend", "Cloud", "Other"];
const STATUSES = ["Unsaved", "Saved", "Applied", "Interviewing", "Offer", "Rejected"];
const POS_COLOR = {
  Internship: "var(--aqua)",
  "Full-Time": "var(--blue)",
  "New Grad": "var(--yellow)",
  Contract: "var(--purple)",
  "Co-op": "var(--orange)",
};

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
  const [pipeline, setPipeline] = useState("all");
  const [sort, setSort] = useState("new");
  const [q, setQ] = useState("");
  const [view, setView] = useState("feed");
  const [shown, setShown] = useState(18);

  const [statuses, setStatuses] = useState({});
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  useEffect(() => {
    setStatuses(LS.get("jn_status", {}));
    const p = LS.get("jn_prefs", null);
    if (p) {
      setCountry(p.country ?? "all"); setWork(p.work ?? "all");
      setPosition(p.position ?? "all"); setRole(p.role ?? "all");
      setPipeline(p.pipeline ?? "all"); setSort(p.sort ?? "new");
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
    load(true).then(() => {
      setSyncing(false);
      flash("Synced — showing roles from the last 24 hours");
    });
  }

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function setStatus(id, val) {
    const next = { ...statuses, [id]: val };
    setStatuses(next); LS.set("jn_status", next);
  }
  function savePrefs() {
    LS.set("jn_prefs", { country, work, position, role, pipeline, sort });
    flash("Preferences saved to this browser");
  }

  const trackedCount = useMemo(
    () => Object.values(statuses).filter((s) => s && s !== "Unsaved").length,
    [statuses]
  );

  // Enforce the 24h window on the client too, relative to the load/sync time.
  const windowJobs = useMemo(() => {
    const cutoff = refTime - 24 * 3600 * 1000;
    return jobs.filter((j) => j.postedAt >= cutoff);
  }, [jobs, refTime]);

  // Facet counts for the channel cards (respect everything except country).
  const facetBase = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return windowJobs.filter((j) => {
      if (work !== "all" && j.workType !== work) return false;
      if (position !== "all" && j.position !== position) return false;
      if (role !== "all" && j.role !== role) return false;
      if (ql) {
        const hay = `${j.company} ${j.title} ${j.location} ${j.role} ${j.position}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [windowJobs, work, position, role, q]);

  const counts = useMemo(() => ({
    all: facetBase.length,
    Canada: facetBase.filter((j) => j.country === "Canada").length,
    USA: facetBase.filter((j) => j.country === "USA").length,
    "Cross-Border": facetBase.filter((j) => j.country === "Cross-Border").length,
  }), [facetBase]);

  const list = useMemo(() => {
    let out = facetBase.filter((j) => {
      if (country !== "all" && j.country !== country) return false;
      if (pipeline !== "all" && (statuses[j.id] || "Unsaved") !== pipeline) return false;
      if (view === "apps" && (statuses[j.id] || "Unsaved") === "Unsaved") return false;
      return true;
    });
    if (sort === "new") out = [...out].sort((a, b) => b.postedAt - a.postedAt);
    else if (sort === "company") out = [...out].sort((a, b) => a.company.localeCompare(b.company));
    else if (sort === "title") out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    return out;
  }, [facetBase, country, pipeline, view, sort, statuses]);

  const visible = list.slice(0, shown);
  useEffect(() => { setShown(18); }, [country, work, position, role, pipeline, q, view]);

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
            Job Feed <span className="badge">{windowJobs.length}</span>
          </button>
          <button className={`nbtn ${view === "apps" ? "on" : ""}`} onClick={() => setView("apps")}>
            Applications <span className="badge">{trackedCount}</span>
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
          <select className="ctl" value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
            <option value="all">Pipeline: all</option>
            {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
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
            : <><b>{list.length}</b> {view === "apps" ? "tracked" : "matching"} {list.length === 1 ? "role" : "roles"} · posted in the last 24h</>}
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
          No {view === "apps" ? "tracked roles" : "roles posted in the last 24 hours"} match these filters.
          <div className="empty-sub">The window is strict — press Sync to check again, or widen a filter.</div>
        </div>
      ) : (
        <>
          <section className="grid">
            {visible.map((j) => (
              <JobCard key={j.id} job={j} status={statuses[j.id] || "Unsaved"}
                onStatus={(v) => setStatus(j.id, v)} />
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

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
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

function JobCard({ job, status, onStatus }) {
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
        <select className="statussel" data-s={status} value={status} onChange={(e) => onStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === "Unsaved" ? "Set status" : s}</option>)}
        </select>
        <a className="apply" href={job.url} target="_blank" rel="noopener noreferrer">
          Apply <Icon d={I.ext} size={12} />
        </a>
      </div>
    </article>
  );
}
