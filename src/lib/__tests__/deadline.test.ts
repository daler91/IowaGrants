import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  formatDeadlineShort,
  formatDeadlineLong,
  isDeadlinePassed,
  isDeadlineUrgent,
} from "../deadline";

describe("deadline formatters", () => {
  beforeAll(() => {
    // Pin "now" so diff calculations are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T12:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns 'No deadline' for null/undefined/invalid", () => {
    expect(formatDeadlineShort(null)).toBe("No deadline");
    expect(formatDeadlineShort(undefined)).toBe("No deadline");
    expect(formatDeadlineShort("not-a-date")).toBe("No deadline");
    expect(formatDeadlineLong(null)).toBe("No deadline specified");
  });

  it("short form returns calendar date for far-future deadlines", () => {
    expect(formatDeadlineShort("2026-12-15T17:00:00Z")).toBe("Dec 15, 2026");
  });

  it("short form shows 'Nd left' for deadlines within 30 days", () => {
    // 10 days after 2026-04-05
    expect(formatDeadlineShort("2026-04-15T12:00:00Z")).toMatch(/^10d left - /);
  });

  it("short form shows 'Closed' for past deadlines", () => {
    expect(formatDeadlineShort("2026-01-01T12:00:00Z")).toMatch(/^Closed /);
  });

  it("card and detail page render the same calendar day for UTC-midnight values", () => {
    // Regression guard: a deadline stored as UTC midnight must resolve to the
    // same day on both the client-formatted card and the server-formatted
    // detail page. Because both helpers pin to America/Chicago, this is
    // consistent regardless of where it renders.
    const iso = "2026-07-01T05:00:00Z"; // 00:00 Iowa-local (CDT, UTC-5)
    const short = formatDeadlineShort(iso);
    const long = formatDeadlineLong(iso);
    expect(short).toContain("Jul 1, 2026");
    expect(long).toContain("July 1, 2026");
    expect(long).toContain("Wednesday");
  });

  it("string and Date inputs produce identical output", () => {
    const iso = "2026-11-20T15:00:00Z";
    expect(formatDeadlineShort(iso)).toBe(formatDeadlineShort(new Date(iso)));
    expect(formatDeadlineLong(iso)).toBe(formatDeadlineLong(new Date(iso)));
  });

  it("isDeadlinePassed reflects past vs future", () => {
    expect(isDeadlinePassed("2026-01-01T00:00:00Z")).toBe(true);
    expect(isDeadlinePassed("2026-12-31T00:00:00Z")).toBe(false);
    expect(isDeadlinePassed(null)).toBe(false);
  });

  it("isDeadlineUrgent is true only when deadline is within 7 days and future", () => {
    expect(isDeadlineUrgent("2026-04-09T12:00:00Z")).toBe(true); // 4 days out
    expect(isDeadlineUrgent("2026-05-01T12:00:00Z")).toBe(false); // > 7 days
    expect(isDeadlineUrgent("2026-04-01T12:00:00Z")).toBe(false); // past
    expect(isDeadlineUrgent(null)).toBe(false);
  });
});
