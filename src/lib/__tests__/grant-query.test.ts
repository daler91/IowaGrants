import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildGrantWhere } from "../grant-query";

// Pin "now" so deadline comparisons are deterministic
const FAKE_NOW = new Date("2026-04-05T12:00:00Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe("buildGrantWhere status filter", () => {
  it("returns no status filter when status param is absent", () => {
    const where = buildGrantWhere(params({}));
    expect(where.status).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });

  it("filters OPEN: requires status=OPEN and deadline not passed", () => {
    const where = buildGrantWhere(params({ status: "OPEN" }));
    // Should use AND to add the status clause
    expect(where.AND).toBeDefined();
    const clause = Array.isArray(where.AND) ? where.AND[0] : where.AND;
    expect(clause).toMatchObject({
      status: "OPEN",
      OR: [{ deadline: null }, { deadline: { gte: expect.any(Date) } }],
    });
  });

  it("filters CLOSED: includes DB CLOSED and past-deadline OPEN grants", () => {
    const where = buildGrantWhere(params({ status: "CLOSED" }));
    expect(where.AND).toBeDefined();
    const andArray = Array.isArray(where.AND) ? where.AND : [where.AND];
    // Should have an OR with two clauses: explicit CLOSED and past-deadline OPEN
    const orClause = andArray[0] as { OR: unknown[] };
    expect(orClause.OR).toHaveLength(2);
    expect(orClause.OR).toContainEqual({ status: "CLOSED" });
    expect(orClause.OR).toContainEqual({
      status: "OPEN",
      deadline: { lt: expect.any(Date) },
    });
  });

  it("filters FORECASTED: just matches DB status", () => {
    const where = buildGrantWhere(params({ status: "FORECASTED" }));
    expect(where.AND).toBeDefined();
    const clause = Array.isArray(where.AND) ? where.AND[0] : where.AND;
    expect(clause).toMatchObject({ status: "FORECASTED" });
  });

  it("handles combined OPEN,CLOSED filter", () => {
    const where = buildGrantWhere(params({ status: "OPEN,CLOSED" }));
    expect(where.AND).toBeDefined();
    const andArray = Array.isArray(where.AND) ? where.AND : [where.AND];
    const orClause = andArray[0] as { OR: unknown[] };
    // OPEN clause + CLOSED clause + past-deadline OPEN clause = 3
    expect(orClause.OR).toHaveLength(3);
  });

  it("coexists with search filter (no OR collision)", () => {
    const where = buildGrantWhere(params({ search: "test", status: "OPEN" }));
    // search uses where.OR
    expect(where.OR).toBeDefined();
    expect(where.OR).toHaveLength(2);
    // status uses where.AND
    expect(where.AND).toBeDefined();
  });
});
