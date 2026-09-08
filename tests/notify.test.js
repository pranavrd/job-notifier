import { describe, it, expect } from "vitest";
import { notificationWindow, parseNotifyQuery, selectJobs, ptHour } from "../lib/notify.js";
import { renderDigest } from "../lib/email.js";

// Fixed instants. September 2026 is PDT (UTC-7), so PT = UTC - 7h.
const at = (iso) => new Date(iso);

describe("ptHour", () => {
  it("converts UTC to the Pacific hour", () => {
    expect(ptHour(at("2026-09-07T16:00:00Z"))).toBe(9); // 16:00Z - 7 = 09:00 PT
    expect(ptHour(at("2026-09-07T14:00:00Z"))).toBe(7);
  });
});

describe("notificationWindow", () => {
  it("7AM catch-up looks back 10h (since the 9PM slot)", () => {
    const w = notificationWindow(at("2026-09-07T14:00:00Z")); // 07:00 PT
    expect(w).toMatchObject({ ptHour: 7, hours: 10, isCatchup: true });
  });

  it("9AM looks back 2h (since 7AM)", () => {
    expect(notificationWindow(at("2026-09-07T16:00:00Z"))).toMatchObject({ ptHour: 9, hours: 2 });
  });

  it("mid-day slots look back 1h", () => {
    expect(notificationWindow(at("2026-09-07T17:00:00Z"))).toMatchObject({ ptHour: 10, hours: 1 });
    expect(notificationWindow(at("2026-09-08T04:00:00Z"))).toMatchObject({ ptHour: 21, hours: 1 }); // 21:00 PT
  });

  it("returns null outside scheduled hours", () => {
    expect(notificationWindow(at("2026-09-07T13:00:00Z"))).toBeNull(); // 06:00 PT
    expect(notificationWindow(at("2026-09-07T15:00:00Z"))).toBeNull(); // 08:00 PT (no 8AM slot)
    expect(notificationWindow(at("2026-09-08T05:00:00Z"))).toBeNull(); // 22:00 PT
  });
});

describe("parseNotifyQuery", () => {
  it("resolves canonical facets case-insensitively", () => {
    expect(parseNotifyQuery("role=ai/ml&country=usa&work=remote")).toEqual({
      role: "AI/ML",
      country: "USA",
      work: "Remote",
    });
  });

  it("ignores unknown values and empty input", () => {
    expect(parseNotifyQuery("role=wizard")).toEqual({ role: null, country: null, work: null });
    expect(parseNotifyQuery("")).toEqual({ role: null, country: null, work: null });
    expect(parseNotifyQuery(undefined)).toEqual({ role: null, country: null, work: null });
  });
});

describe("selectJobs", () => {
  const now = 1_700_000_000_000;
  const HOUR = 3600 * 1000;
  const base = { role: "Software", country: "USA", workType: "Remote", precision: "exact" };

  it("keeps exact-precision roles inside the window, drops day-resolution", () => {
    const jobs = [
      { ...base, id: "1", postedAt: now - 0.5 * HOUR },                 // in
      { ...base, id: "2", postedAt: now - 5 * HOUR },                   // out (1h window)
      { ...base, id: "3", precision: "day", postedAt: now - 0.2 * HOUR }, // excluded (day)
    ];
    expect(selectJobs(jobs, { now, hours: 1 }).map((j) => j.id)).toEqual(["1"]);
  });

  it("applies facet filters", () => {
    const jobs = [
      { ...base, id: "a", postedAt: now - 0.1 * HOUR, role: "AI/ML" },
      { ...base, id: "b", postedAt: now - 0.1 * HOUR, role: "Software" },
    ];
    expect(selectJobs(jobs, { now, hours: 1, role: "AI/ML" }).map((j) => j.id)).toEqual(["a"]);
  });

  it("sorts newest-first and honors the cap", () => {
    const jobs = [
      { ...base, id: "old", postedAt: now - 0.9 * HOUR },
      { ...base, id: "new", postedAt: now - 0.1 * HOUR },
    ];
    expect(selectJobs(jobs, { now, hours: 1 }).map((j) => j.id)).toEqual(["new", "old"]);
    expect(selectJobs(jobs, { now, hours: 1, cap: 1 })).toHaveLength(1);
  });
});

describe("renderDigest", () => {
  const jobs = [
    { title: "Software Engineer", company: "Kong", location: "Remote", role: "Software", position: "Full-Time", workType: "Remote", source: "Ashby", url: "https://x/1", sponsorship: "verified" },
    { title: "Backend Engineer", company: "Acme", location: "NYC", role: "Backend", position: "Full-Time", workType: "Onsite", source: "Greenhouse", url: "https://x/2", sponsorship: "listed" },
  ];

  it("puts the count + window in the subject", () => {
    const { subject } = renderDigest(jobs, { windowLabel: "the last hour" });
    expect(subject).toBe("JobNotifier — 2 new roles (the last hour)");
  });

  it("singularizes one role", () => {
    expect(renderDigest([jobs[0]], { windowLabel: "the last hour" }).subject).toContain("1 new role (");
  });

  it("shows the H-1B tag only for verified roles", () => {
    const { html } = renderDigest(jobs, { windowLabel: "x" });
    expect(html).toContain("Software Engineer");
    // Count the badge markup specifically (the footer legend also says "H-1B").
    expect((html.match(/>H-1B<\/span>/g) || []).length).toBe(1); // only Kong
  });

  it("escapes HTML in untrusted fields", () => {
    const { html } = renderDigest(
      [{ ...jobs[1], title: "<script>x</script> Engineer" }],
      { windowLabel: "x" }
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
