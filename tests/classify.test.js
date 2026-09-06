import { describe, it, expect } from "vitest";
import {
  classifyRole,
  classifyPosition,
  detectCountry,
  detectWorkType,
} from "../lib/classify.js";

describe("classifyRole", () => {
  it("drops senior / lead / manager / architect titles", () => {
    expect(classifyRole("Senior Software Engineer")).toBeNull();
    expect(classifyRole("Staff Software Engineer")).toBeNull();
    expect(classifyRole("Principal Engineer")).toBeNull();
    expect(classifyRole("Engineering Manager")).toBeNull();
    expect(classifyRole("Software Architect")).toBeNull();
  });

  it("drops non-tech roles even when they say 'engineer'", () => {
    expect(classifyRole("Account Executive")).toBeNull();
    expect(classifyRole("Sales Engineer")).toBeNull();
    expect(classifyRole("Product Manager")).toBeNull();
    expect(classifyRole("Mechanical Engineer")).toBeNull();
  });

  it("returns null when there is no tech signal at all", () => {
    expect(classifyRole("Data Analyst")).toBeNull();
    expect(classifyRole("")).toBeNull();
  });

  it("maps AI/ML titles", () => {
    expect(classifyRole("Machine Learning Engineer")).toBe("AI/ML");
    expect(classifyRole("Data Scientist")).toBe("AI/ML");
    expect(classifyRole("Applied Scientist")).toBe("AI/ML");
  });

  it("maps Cloud titles", () => {
    expect(classifyRole("DevOps Engineer")).toBe("Cloud");
    expect(classifyRole("Site Reliability Engineer")).toBe("Cloud");
    expect(classifyRole("Infrastructure Engineer")).toBe("Cloud");
  });

  it("maps Backend titles", () => {
    expect(classifyRole("Backend Engineer")).toBe("Backend");
    expect(classifyRole("Distributed Systems Engineer")).toBe("Backend");
  });

  it("maps Software titles", () => {
    expect(classifyRole("Software Engineer")).toBe("Software");
    expect(classifyRole("Frontend Developer")).toBe("Software");
    expect(classifyRole("iOS Engineer")).toBe("Software");
  });

  it("routes full-stack / FDE / agentic to Other", () => {
    expect(classifyRole("Full-Stack Engineer")).toBe("Other");
    expect(classifyRole("Forward Deployed Engineer")).toBe("Other");
    expect(classifyRole("Agentic AI Engineer")).toBe("Other");
  });
});

describe("classifyPosition", () => {
  it("defaults to Full-Time", () => {
    expect(classifyPosition("Software Engineer")).toBe("Full-Time");
  });

  it("detects Internship", () => {
    expect(classifyPosition("Software Engineer Intern")).toBe("Internship");
    expect(classifyPosition("Summer Internship, Backend")).toBe("Internship");
  });

  it("detects New Grad / early career", () => {
    expect(classifyPosition("New Grad Software Engineer")).toBe("New Grad");
    expect(classifyPosition("Entry-Level Developer")).toBe("New Grad");
  });

  it("detects Contract", () => {
    expect(classifyPosition("Contract Software Developer")).toBe("Contract");
    expect(classifyPosition("Software Engineer", "part-time")).toBe("Contract");
  });

  it("detects Co-op", () => {
    expect(classifyPosition("Software Engineering Co-op")).toBe("Co-op");
    expect(classifyPosition("Engineering Coop")).toBe("Co-op");
  });
});

describe("detectCountry", () => {
  it("detects USA", () => {
    expect(detectCountry("San Francisco, CA")).toBe("USA");
    expect(detectCountry("New York, NY")).toBe("USA");
  });

  it("detects Canada", () => {
    expect(detectCountry("Toronto, ON")).toBe("Canada");
    expect(detectCountry("Vancouver, BC")).toBe("Canada");
  });

  it("detects Cross-Border when both are present", () => {
    expect(detectCountry("Toronto or New York")).toBe("Cross-Border");
  });

  it("falls back to International", () => {
    expect(detectCountry("London, UK")).toBe("International");
    expect(detectCountry("")).toBe("International");
  });
});

describe("detectWorkType", () => {
  it("detects Remote from the flag or the text", () => {
    expect(detectWorkType("Seattle, WA", "Software Engineer", true)).toBe("Remote");
    expect(detectWorkType("Remote - US", "Software Engineer")).toBe("Remote");
  });

  it("detects Hybrid", () => {
    expect(detectWorkType("Hybrid - Seattle", "Software Engineer")).toBe("Hybrid");
  });

  it("defaults to Onsite", () => {
    expect(detectWorkType("Seattle, WA", "Software Engineer")).toBe("Onsite");
  });
});
