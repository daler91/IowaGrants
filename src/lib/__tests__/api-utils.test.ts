import { describe, it, expect } from "vitest";
import { parsePagination, parseOptionalInt } from "../api-utils";

describe("parsePagination", () => {
  it("should return defaults when no params provided", () => {
    const params = new URLSearchParams();
    const result = parsePagination(params);
    expect(result).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("should parse page and limit from params", () => {
    const params = new URLSearchParams({ page: "3", limit: "50" });
    const result = parsePagination(params);
    expect(result).toEqual({ page: 3, limit: 50, skip: 100 });
  });

  it("should clamp page to minimum of 1", () => {
    const params = new URLSearchParams({ page: "-5" });
    expect(parsePagination(params).page).toBe(1);
  });

  it("should clamp limit to max 100", () => {
    const params = new URLSearchParams({ limit: "500" });
    expect(parsePagination(params).limit).toBe(100);
  });

  it("should clamp limit to minimum of 1", () => {
    const params = new URLSearchParams({ limit: "0" });
    expect(parsePagination(params).limit).toBe(1);
  });

  it("should use custom defaults", () => {
    const params = new URLSearchParams();
    const result = parsePagination(params, { page: 2, limit: 50 });
    expect(result).toEqual({ page: 2, limit: 50, skip: 50 });
  });
});

describe("parseOptionalInt", () => {
  it("should return undefined for missing params", () => {
    const params = new URLSearchParams();
    expect(parseOptionalInt(params, "foo")).toBeUndefined();
  });

  it("should parse valid integers", () => {
    const params = new URLSearchParams({ amount: "5000" });
    expect(parseOptionalInt(params, "amount")).toBe(5000);
  });

  it("should return undefined for non-numeric values", () => {
    const params = new URLSearchParams({ amount: "abc" });
    expect(parseOptionalInt(params, "amount")).toBeUndefined();
  });
});
