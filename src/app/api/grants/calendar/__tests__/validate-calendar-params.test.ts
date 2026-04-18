import { describe, it, expect } from "vitest";
import { validateCalendarParams } from "../route";

describe("validateCalendarParams", () => {
  it("accepts valid year/month", () => {
    expect(validateCalendarParams("2026", "4")).toEqual({ year: 2026, month: 4 });
  });

  it("falls back to now when params are missing", () => {
    const now = new Date();
    const result = validateCalendarParams(null, null);
    expect(result).toEqual({ year: now.getFullYear(), month: now.getMonth() + 1 });
  });

  it("rejects month 0 and 13", () => {
    expect(validateCalendarParams("2026", "0")).toEqual({
      error: "Invalid year or month parameter",
    });
    expect(validateCalendarParams("2026", "13")).toEqual({
      error: "Invalid year or month parameter",
    });
  });

  it("rejects year below MIN_CALENDAR_YEAR", () => {
    expect(validateCalendarParams("1999", "1")).toEqual({
      error: "Invalid year or month parameter",
    });
  });

  it("rejects year above MAX_CALENDAR_YEAR", () => {
    expect(validateCalendarParams("2500", "1")).toEqual({
      error: "Invalid year or month parameter",
    });
    expect(validateCalendarParams("2101", "1")).toEqual({
      error: "Invalid year or month parameter",
    });
  });

  it("rejects non-numeric params", () => {
    expect(validateCalendarParams("abc", "4")).toEqual({
      error: "Invalid year or month parameter",
    });
  });

  it("accepts boundaries", () => {
    expect(validateCalendarParams("2000", "1")).toEqual({ year: 2000, month: 1 });
    expect(validateCalendarParams("2100", "12")).toEqual({ year: 2100, month: 12 });
  });
});
