import { describe, it, expect } from "vitest";
import { normCompany, normTitle, fuzzyKey } from "../lib/match.js";

describe("normCompany", () => {
  it("lowercases and strips punctuation + legal suffixes", () => {
    expect(normCompany("Stripe, Inc.")).toBe("stripe");
    expect(normCompany("Acme LLC")).toBe("acme");
    expect(normCompany("Foo-Bar Corp")).toBe("foobar");
  });

  it("matches an ATS token to its prettified display name", () => {
    // pretty("scaleai") -> "Scaleai"; both must normalize to the same key.
    expect(normCompany("scaleai")).toBe(normCompany("Scaleai"));
    expect(normCompany("jpmc")).toBe("jpmc");
  });
});

describe("normTitle", () => {
  it("drops parentheticals and folds punctuation", () => {
    expect(normTitle("Software Engineer (Remote)")).toBe("software engineer");
    expect(normTitle("Software Engineer - Backend")).toBe("software engineer backend");
  });

  it("keeps post-comma qualifiers distinct", () => {
    expect(normTitle("Software Engineer, Backend")).not.toBe(normTitle("Software Engineer, Frontend"));
  });
});

describe("fuzzyKey", () => {
  it("matches same company+title across different location/source", () => {
    const a = { company: "Stripe, Inc.", title: "Software Engineer (Remote)" };
    const b = { company: "stripe", title: "Software Engineer" };
    expect(fuzzyKey(a)).toBe(fuzzyKey(b));
  });

  it("separates different companies with the same title", () => {
    expect(fuzzyKey({ company: "Stripe", title: "SWE" })).not.toBe(
      fuzzyKey({ company: "Ramp", title: "SWE" })
    );
  });
});
