import { describe, it, expect } from "vitest";
import { filterOptions } from "../Combobox";

describe("filterOptions", () => {
  const all = ["Iowa", "Des Moines", "Cedar Rapids", "Ames", "Iowa City"];

  it("returns all options (capped by limit) when query is empty", () => {
    expect(filterOptions(all, "")).toEqual(all);
    expect(filterOptions(all, "", 3)).toEqual(["Iowa", "Des Moines", "Cedar Rapids"]);
  });

  it("trims whitespace in the query", () => {
    expect(filterOptions(all, "  iowa  ")).toEqual(["Iowa", "Iowa City"]);
  });

  it("is case-insensitive", () => {
    expect(filterOptions(all, "DES")).toEqual(["Des Moines"]);
    expect(filterOptions(all, "des")).toEqual(["Des Moines"]);
  });

  it("matches substrings, not just prefixes", () => {
    expect(filterOptions(all, "rapids")).toEqual(["Cedar Rapids"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterOptions(all, "xyz")).toEqual([]);
  });

  it("applies the limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => `opt-${i}`);
    expect(filterOptions(many, "opt", 10)).toHaveLength(10);
  });
});
