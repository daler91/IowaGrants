import { describe, it, expect } from "vitest";
import { isErrorPage, isActualGrantPage } from "../page-utils";

describe("isErrorPage", () => {
  it("should detect 404 pages", () => {
    expect(isErrorPage("Page not found. The URL you requested does not exist.")).toBe(true);
    expect(isErrorPage("404 Error - This page doesn't exist")).toBe(true);
  });

  it("should detect server error pages", () => {
    expect(isErrorPage("500 Internal Server Error")).toBe(true);
    expect(isErrorPage("503 Service Unavailable")).toBe(true);
  });

  it("should detect very short/empty pages", () => {
    expect(isErrorPage("   ")).toBe(true);
    expect(isErrorPage("OK")).toBe(true);
  });

  it("should not flag real content", () => {
    expect(isErrorPage("The Rural Business Development Grant provides funding of up to $50,000 for small businesses in Iowa.")).toBe(false);
  });
});

describe("isActualGrantPage", () => {
  it("should reject generic homepages", () => {
    expect(isActualGrantPage("https://example.com/business", "Business", "Welcome to our site")).toBe(false);
    expect(isActualGrantPage("https://example.com/grants", "Grants", "Browse our programs")).toBe(false);
  });

  it("should accept pages with grant-specific content", () => {
    expect(isActualGrantPage(
      "https://example.com/grants/rural-development",
      "Rural Development Grant",
      "Award amount: $50,000. Eligible applicants must submit their application by the deadline."
    )).toBe(true);
  });

  it("should reject pages without grant signals", () => {
    expect(isActualGrantPage(
      "https://example.com/about/team",
      "Our Team",
      "Meet our dedicated team of professionals who work every day."
    )).toBe(false);
  });
});
