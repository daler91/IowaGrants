import { describe, it, expect } from "vitest";
import { categorizeGrant, categorizeAll } from "../categorizer";
import type { GrantData } from "@/lib/types";

function makeGrant(overrides: Partial<GrantData> = {}): GrantData {
  return {
    title: "Test Grant",
    description: "A test grant program",
    sourceUrl: "https://example.com/grant",
    sourceName: "test",
    grantType: "STATE",
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: [],
    categories: [],
    eligibleExpenses: [],
    ...overrides,
  };
}

describe("categorizeGrant", () => {
  it("does not mutate the input object", () => {
    const original = makeGrant({ description: "Grant for women entrepreneurs" });
    const originalGender = original.gender;
    const result = categorizeGrant(original);
    expect(original.gender).toBe(originalGender);
    expect(result).not.toBe(original);
  });

  it("detects women-focused grants", () => {
    const grant = makeGrant({ title: "Women-Owned Business Grant" });
    const result = categorizeGrant(grant);
    expect(result.gender).toBe("WOMEN");
  });

  it("detects veteran-focused grants", () => {
    const grant = makeGrant({ description: "For veteran-owned businesses" });
    const result = categorizeGrant(grant);
    expect(result.gender).toBe("VETERAN");
  });

  it("detects minority-focused grants", () => {
    const grant = makeGrant({ description: "For minority entrepreneurs" });
    const result = categorizeGrant(grant);
    expect(result.gender).toBe("MINORITY");
  });

  it("preserves existing non-default gender", () => {
    const grant = makeGrant({ gender: "WOMEN", description: "For veteran businesses" });
    const result = categorizeGrant(grant);
    expect(result.gender).toBe("WOMEN");
  });

  it("detects startup stage", () => {
    const grant = makeGrant({ description: "For startup businesses and new entrepreneurs" });
    const result = categorizeGrant(grant);
    expect(result.businessStage).toBe("STARTUP");
  });

  it("detects existing business stage", () => {
    const grant = makeGrant({ description: "For established business expansion" });
    const result = categorizeGrant(grant);
    expect(result.businessStage).toBe("EXISTING");
  });

  it("keeps BOTH when both startup and existing keywords present", () => {
    const grant = makeGrant({ description: "For startup and established business expansion" });
    const result = categorizeGrant(grant);
    expect(result.businessStage).toBe("BOTH");
  });

  it("detects eligible expenses", () => {
    const grant = makeGrant({ description: "Funding for equipment purchases and technology upgrades" });
    const result = categorizeGrant(grant);
    expect(result.eligibleExpenses).toContain("EQUIPMENT");
    expect(result.eligibleExpenses).toContain("TECHNOLOGY");
  });

  it("preserves existing eligible expenses", () => {
    const grant = makeGrant({
      description: "Funding for equipment purchases",
      eligibleExpenses: ["WORKING_CAPITAL"],
    });
    const result = categorizeGrant(grant);
    expect(result.eligibleExpenses).toEqual(["WORKING_CAPITAL"]);
  });

  it("detects industries", () => {
    const grant = makeGrant({ description: "Agriculture and farming innovation grant" });
    const result = categorizeGrant(grant);
    expect(result.industries).toContain("Agriculture");
  });

  it("enriches Iowa locations from text", () => {
    const grant = makeGrant({
      description: "Available in Des Moines and Cedar Rapids",
      locations: ["Iowa"],
    });
    const result = categorizeGrant(grant);
    expect(result.locations).toContain("Des Moines");
    expect(result.locations).toContain("Cedar Rapids");
  });

  it("refines grant type to FEDERAL when federal keywords present", () => {
    const grant = makeGrant({
      description: "SBA federal grant program",
      grantType: "PRIVATE",
    });
    const result = categorizeGrant(grant);
    expect(result.grantType).toBe("FEDERAL");
  });

  it("does not change FEDERAL or LOCAL grant types", () => {
    const grant = makeGrant({ grantType: "FEDERAL", description: "Some state program" });
    const result = categorizeGrant(grant);
    expect(result.grantType).toBe("FEDERAL");
  });
});

describe("categorizeAll", () => {
  it("categorizes all grants in array", () => {
    const grants = [
      makeGrant({ title: "Women Grant" }),
      makeGrant({ title: "Veteran Grant", description: "For veterans" }),
    ];
    const results = categorizeAll(grants);
    expect(results).toHaveLength(2);
    expect(results[1].gender).toBe("VETERAN");
  });

  it("returns empty array for empty input", () => {
    expect(categorizeAll([])).toEqual([]);
  });
});
