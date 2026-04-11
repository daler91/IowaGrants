import { describe, it, expect } from "vitest";
import { parseSortParams, buildOrderBy, isDefaultSort } from "../grant-sort";

function params(input: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  Object.entries(input).forEach(([k, v]) => p.set(k, v));
  return p;
}

describe("parseSortParams", () => {
  it("defaults to deadline asc when no params", () => {
    const result = parseSortParams(params({}));
    expect(result.sort).toBe("deadline");
    expect(result.dir).toBe("asc");
    expect(result.orderBy).toEqual([
      { deadline: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });

  it("parses rollingFirst and places nulls first", () => {
    const result = parseSortParams(params({ sort: "rollingFirst" }));
    expect(result.orderBy[0]).toEqual({ deadline: { sort: "asc", nulls: "first" } });
  });

  it("parses amount with default desc direction", () => {
    const result = parseSortParams(params({ sort: "amount" }));
    expect(result.dir).toBe("desc");
    expect(result.orderBy[0]).toEqual({ amountMax: { sort: "desc", nulls: "last" } });
  });

  it("honors explicit dir=asc on amount", () => {
    const result = parseSortParams(params({ sort: "amount", dir: "asc" }));
    expect(result.dir).toBe("asc");
    expect(result.orderBy[0]).toEqual({ amountMax: { sort: "asc", nulls: "last" } });
  });

  it("parses recent with default desc direction", () => {
    const result = parseSortParams(params({ sort: "recent" }));
    expect(result.dir).toBe("desc");
    expect(result.orderBy).toEqual([{ createdAt: "desc" }]);
  });

  it("parses title with default asc direction", () => {
    const result = parseSortParams(params({ sort: "title" }));
    expect(result.dir).toBe("asc");
    expect(result.orderBy).toEqual([{ title: "asc" }]);
  });

  it("falls back to default on unknown sort", () => {
    const result = parseSortParams(params({ sort: "mystery" }));
    expect(result.sort).toBe("deadline");
    expect(result.dir).toBe("asc");
  });

  it("falls back to default dir on unknown dir value", () => {
    const result = parseSortParams(params({ sort: "amount", dir: "sideways" }));
    expect(result.dir).toBe("desc");
  });
});

describe("buildOrderBy", () => {
  it("deadline + dir desc still places nulls last", () => {
    expect(buildOrderBy("deadline", "desc")[0]).toEqual({
      deadline: { sort: "desc", nulls: "last" },
    });
  });
});

describe("isDefaultSort", () => {
  it("is true for undefined/undefined", () => {
    expect(isDefaultSort(undefined, undefined)).toBe(true);
  });

  it("is true for deadline/asc", () => {
    expect(isDefaultSort("deadline", "asc")).toBe(true);
  });

  it("is false for amount/desc", () => {
    expect(isDefaultSort("amount", "desc")).toBe(false);
  });

  it("is false for deadline/desc", () => {
    expect(isDefaultSort("deadline", "desc")).toBe(false);
  });
});
