import { describe, it, expect } from "vitest";
import {
  withinWindow,
  workdayPostedAt,
  oraclePostedAt,
  normalize,
  hashId,
  WINDOW_HOURS,
} from "../lib/fetchers.js";
import { PER_COMPANY_CAP } from "../lib/config.js";

const HOUR = 3600 * 1000;

describe("withinWindow", () => {
  const now = 1_700_000_000_000; // fixed reference point

  it("keeps only postings inside the trailing window", () => {
    const jobs = [
      { company: "A", postedAt: now - 1 * HOUR }, // 1h ago -> in
      { company: "B", postedAt: now - 30 * HOUR }, // 30h ago -> out (24h window)
    ];
    const out = withinWindow(jobs, now);
    expect(out.map((j) => j.company)).toEqual(["A"]);
  });

  it("respects a custom window width", () => {
    const jobs = [{ company: "B", postedAt: now - 30 * HOUR }];
    expect(withinWindow(jobs, now, 48)).toHaveLength(1);
    expect(withinWindow(jobs, now, WINDOW_HOURS)).toHaveLength(0);
  });

  it("enforces the per-company cap (config PER_COMPANY_CAP)", () => {
    const jobs = Array.from({ length: PER_COMPANY_CAP + 5 }, (_, i) => ({
      company: "Acme",
      postedAt: now - (i + 1) * 60 * 1000, // all within the last (cap+5) minutes
    }));
    expect(withinWindow(jobs, now)).toHaveLength(PER_COMPANY_CAP);
  });

  it("drops future-dated jobs beyond the +5min skew guard", () => {
    const jobs = [
      { company: "A", postedAt: now + 10 * 60 * 1000 }, // +10min -> dropped
      { company: "B", postedAt: now + 2 * 60 * 1000 }, // +2min -> within skew, kept
    ];
    const out = withinWindow(jobs, now);
    expect(out.map((j) => j.company)).toEqual(["B"]);
  });

  it("sorts newest-first", () => {
    const jobs = [
      { company: "old", postedAt: now - 5 * HOUR },
      { company: "new", postedAt: now - 1 * HOUR },
    ];
    expect(withinWindow(jobs, now).map((j) => j.company)).toEqual(["new", "old"]);
  });
});

describe("workdayPostedAt", () => {
  const now = 1_700_000_000_000;

  it("maps 'today' to ~23h ago", () => {
    expect(workdayPostedAt("Posted Today", now)).toBe(now - 23 * HOUR);
  });

  it("maps 'yesterday' to ~47h ago", () => {
    expect(workdayPostedAt("Posted Yesterday", now)).toBe(now - 47 * HOUR);
  });

  it("maps 'N days ago' to at least 2 days back", () => {
    expect(workdayPostedAt("Posted 3 Days Ago", now)).toBe(now - 3 * 24 * HOUR);
    // "1 day ago" is floored to 2 days so it never looks fresher than yesterday
    expect(workdayPostedAt("Posted 1 Day Ago", now)).toBe(now - 2 * 24 * HOUR);
  });

  it("returns 0 (dropped) for an unknown string", () => {
    expect(workdayPostedAt("", now)).toBe(0);
    expect(workdayPostedAt("who knows", now)).toBe(0);
  });
});

describe("oraclePostedAt", () => {
  // Noon UTC so day-floor math is unambiguous regardless of the host timezone.
  const now = Date.parse("2026-09-05T12:00:00Z");

  it("maps a same-day date to ~23h ago", () => {
    expect(oraclePostedAt("2026-09-05", now)).toBe(now - 23 * HOUR);
  });

  it("maps a yesterday date to ~47h ago", () => {
    expect(oraclePostedAt("2026-09-04", now)).toBe(now - 47 * HOUR);
  });

  it("drops postings older than 30 days", () => {
    expect(oraclePostedAt("2026-07-01", now)).toBe(0);
  });

  it("clamps future-dated postings to ~23h ago", () => {
    expect(oraclePostedAt("2026-09-10", now)).toBe(now - 23 * HOUR);
  });

  it("returns 0 for an unparseable date", () => {
    expect(oraclePostedAt("not a date", now)).toBe(0);
  });
});

describe("normalize", () => {
  const base = {
    company: "Acme",
    title: "Software Engineer",
    location: "New York, NY",
    postedAt: 1_700_000_000_000,
    source: "Test",
  };

  it("gives distinct ids to same company+title+location but different uid", () => {
    const a = normalize({ ...base, uid: "req-1" });
    const b = normalize({ ...base, uid: "req-2" });
    expect(a.id).not.toBe(b.id);
  });

  it("gives identical ids when uid is also identical", () => {
    const a = normalize({ ...base, uid: "req-1" });
    const b = normalize({ ...base, uid: "req-1" });
    expect(a.id).toBe(b.id);
  });

  it("propagates precision, defaulting to 'exact'", () => {
    expect(normalize(base).precision).toBe("exact");
    expect(normalize({ ...base, precision: "day" }).precision).toBe("day");
  });

  it("tags sponsorship: 'verified' for a known H-1B filer, 'listed' otherwise", () => {
    expect(normalize({ ...base, company: "Nvidia" }).sponsorship).toBe("verified");
    expect(normalize({ ...base, company: "Acme" }).sponsorship).toBe("listed");
  });

  it("returns null for a non-tech / senior title (null role)", () => {
    expect(normalize({ ...base, title: "Senior Software Engineer" })).toBeNull();
    expect(normalize({ ...base, title: "Account Executive" })).toBeNull();
  });

  it("returns null when title or postedAt is missing", () => {
    expect(normalize({ ...base, title: undefined })).toBeNull();
    expect(normalize({ ...base, postedAt: undefined })).toBeNull();
  });

  it("trims the title and defaults an empty location", () => {
    const j = normalize({ ...base, title: "  Software Engineer  ", location: "" });
    expect(j.title).toBe("Software Engineer");
    expect(j.location).toBe("Not specified");
  });
});

describe("hashId", () => {
  it("is deterministic and case-insensitive", () => {
    expect(hashId("Acme", "SWE")).toBe(hashId("acme", "swe"));
  });

  it("differs when inputs differ", () => {
    expect(hashId("Acme", "SWE", "req-1")).not.toBe(hashId("Acme", "SWE", "req-2"));
  });
});
