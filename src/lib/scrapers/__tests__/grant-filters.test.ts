import { describe, it, expect } from "vitest";
import {
  isExcludedByStateRestriction,
  detectLocationScope,
  isExcludedByEligibility,
  isNonGrantProgram,
  isNonApplicationContent,
} from "../grant-filters";

describe("isExcludedByStateRestriction", () => {
  it("should exclude grants restricted to other states", () => {
    expect(isExcludedByStateRestriction("California only")).toBe(true);
    expect(isExcludedByStateRestriction("Must be located in Texas")).toBe(true);
  });

  it("should not exclude nationwide grants", () => {
    expect(isExcludedByStateRestriction("Available nationwide")).toBe(false);
    expect(isExcludedByStateRestriction("Open to all states")).toBe(false);
  });

  it("should not exclude Iowa grants", () => {
    expect(isExcludedByStateRestriction("Iowa small business grant")).toBe(false);
  });
});

describe("detectLocationScope", () => {
  it("should detect Iowa-specific grants", () => {
    expect(detectLocationScope("Iowa small business development")).toContain("Iowa");
  });

  it("should detect nationwide grants", () => {
    expect(detectLocationScope("Available nationwide to all businesses")).toContain("Nationwide");
  });

  it("should default to Nationwide when no state mentioned", () => {
    expect(detectLocationScope("Small business grant program")).toEqual(["Nationwide"]);
  });
});

describe("isExcludedByEligibility", () => {
  it("should exclude nonprofit-only grants", () => {
    expect(isExcludedByEligibility("nonprofits only")).toBe(true);
    expect(isExcludedByEligibility("must be a 501(c)(3) organization")).toBe(true); // matches "must be a 501(c)" pattern
    expect(isExcludedByEligibility("501(c)(3) only")).toBe(true);
  });

  it("should exclude government-only grants", () => {
    expect(isExcludedByEligibility("government agencies only")).toBe(true);
    expect(isExcludedByEligibility("tribal governments only")).toBe(true);
  });

  it("should not exclude general business grants", () => {
    expect(isExcludedByEligibility("Open to small businesses in Iowa")).toBe(false);
  });
});

describe("isNonGrantProgram", () => {
  it("should flag loan programs", () => {
    expect(isNonGrantProgram("State revolving loan fund")).toBe(true);
    expect(isNonGrantProgram("Low-interest loan for small businesses")).toBe(true);
  });

  it("should not flag actual grants", () => {
    expect(isNonGrantProgram("USDA Rural Business Development Grant")).toBe(false);
  });
});

describe("isNonApplicationContent", () => {
  it("should flag closed programs", () => {
    const result = isNonApplicationContent(
      "Business Grant Program",
      "Applications are closed for 2025.",
      "https://example.com/grant"
    );
    expect(result.excluded).toBe(true);
  });

  it("should not flag open applications", () => {
    const result = isNonApplicationContent(
      "Rural Business Grant",
      "Apply now for funding. Applications due March 2026.",
      "https://example.com/grant"
    );
    expect(result.excluded).toBe(false);
  });

  it("should flag awardee announcements", () => {
    const result = isNonApplicationContent(
      "Grant Recipients Announced",
      "30 farmers received grants from the Choose Iowa program",
      "https://example.com/news/grant-recipients"
    );
    expect(result.excluded).toBe(true);
  });
});
