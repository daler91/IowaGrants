import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUS_FILTER,
  DEFAULT_LIMIT,
  getDefaultFilters,
  isDefaultStatus,
} from "../filter-defaults";

describe("getDefaultFilters", () => {
  it("returns status as Open + Forecasted", () => {
    expect(getDefaultFilters().status).toEqual(["OPEN", "FORECASTED"]);
  });

  it("returns default limit + page 1", () => {
    const defaults = getDefaultFilters();
    expect(defaults.limit).toBe(DEFAULT_LIMIT);
    expect(defaults.page).toBe(1);
  });

  it("returns a fresh array so callers cannot mutate the shared default", () => {
    const a = getDefaultFilters();
    const b = getDefaultFilters();
    expect(a.status).not.toBe(b.status);
    expect(a.status).not.toBe(DEFAULT_STATUS_FILTER);
  });
});

describe("isDefaultStatus", () => {
  it("returns true for [OPEN, FORECASTED]", () => {
    expect(isDefaultStatus(["OPEN", "FORECASTED"])).toBe(true);
  });

  it("returns true for [FORECASTED, OPEN] (order-insensitive)", () => {
    expect(isDefaultStatus(["FORECASTED", "OPEN"])).toBe(true);
  });

  it("returns false for undefined / empty / null", () => {
    expect(isDefaultStatus(undefined)).toBe(false);
    expect(isDefaultStatus([])).toBe(false);
  });

  it("returns false when user added CLOSED", () => {
    expect(isDefaultStatus(["OPEN", "FORECASTED", "CLOSED"])).toBe(false);
  });

  it("returns false when user picked only OPEN", () => {
    expect(isDefaultStatus(["OPEN"])).toBe(false);
  });

  it("returns false when user picked only CLOSED", () => {
    expect(isDefaultStatus(["CLOSED"])).toBe(false);
  });
});
