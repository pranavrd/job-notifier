import { describe, it, expect } from "vitest";
import { dedupeExact, dedupeCrossSource } from "../lib/fetchers.js";
import { sponsorshipFor } from "../lib/sponsors.js";

describe("dedupeExact", () => {
  it("drops repeats of the same id, keeping the first", () => {
    const jobs = [
      { id: "a", source: "Greenhouse" },
      { id: "a", source: "Remotive" },
      { id: "b", source: "Ashby" },
    ];
    expect(dedupeExact(jobs).map((j) => j.id)).toEqual(["a", "b"]);
  });
});

describe("dedupeCrossSource", () => {
  it("drops an aggregator echo of a role already on a company board", () => {
    const jobs = [
      { id: "1", company: "Stripe", title: "Software Engineer", location: "SF", source: "Greenhouse" },
      { id: "2", company: "Stripe, Inc.", title: "Software Engineer (Remote)", location: "Remote", source: "Remotive" },
    ];
    const out = dedupeCrossSource(jobs);
    expect(out.map((j) => j.id)).toEqual(["1"]); // board posting kept, aggregator echo dropped
  });

  it("keeps a company's distinct same-title reqs from its own board", () => {
    const jobs = [
      { id: "1", company: "Stripe", title: "Software Engineer", location: "SF", source: "Greenhouse" },
      { id: "2", company: "Stripe", title: "Software Engineer", location: "NYC", source: "Greenhouse" },
    ];
    // Same source → not collapsed; both distinct reqs survive.
    expect(dedupeCrossSource(jobs)).toHaveLength(2);
  });

  it("collapses the same role duplicated across two aggregators", () => {
    const jobs = [
      { id: "1", company: "Acme", title: "Backend Engineer", location: "Remote", source: "Remotive" },
      { id: "2", company: "Acme", title: "Backend Engineer", location: "Anywhere", source: "Arbeitnow" },
    ];
    expect(dedupeCrossSource(jobs)).toHaveLength(1);
  });

  it("keeps an aggregator role that no board carries", () => {
    const jobs = [
      { id: "1", company: "Beta", title: "Frontend Engineer", location: "Remote", source: "Remotive" },
      { id: "2", company: "Gamma", title: "Software Engineer", location: "SF", source: "Greenhouse" },
    ];
    expect(dedupeCrossSource(jobs)).toHaveLength(2);
  });
});

describe("sponsorshipFor", () => {
  it("returns 'verified' for a curated H-1B filer (Workday/Oracle/tagged token)", () => {
    expect(sponsorshipFor("Nvidia")).toBe("verified"); // WORKDAY
    expect(sponsorshipFor("Texas Instruments")).toBe("verified"); // ORACLE
    expect(sponsorshipFor("Scaleai")).toBe("verified"); // H1B_TOKENS (prettified token)
  });

  it("returns 'listed' for a gate-cleared company without an inline filing basis", () => {
    expect(sponsorshipFor("Anthropic")).toBe("listed");
    expect(sponsorshipFor("Some Random Startup")).toBe("listed");
  });
});
