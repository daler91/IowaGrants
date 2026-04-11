import { describe, it, expect } from "vitest";
import { computeActiveChips, formatAmountChip, removeChipFromFilters } from "../ActiveFilterChips";
import type { GrantFilters } from "@/lib/types";

// Shorthand factory — makes tests read cleanly.
function filters(overrides: Partial<GrantFilters> = {}): GrantFilters {
  return { status: ["OPEN", "FORECASTED"], page: 1, limit: 20, ...overrides };
}

describe("computeActiveChips", () => {
  it("returns no chips for the default state", () => {
    expect(computeActiveChips(filters(), "")).toEqual([]);
  });

  it("renders a search chip when search is non-empty", () => {
    const chips = computeActiveChips(filters(), "sba");
    expect(chips).toHaveLength(1);
    expect(chips[0].dimension).toBe("search");
    expect(chips[0].label).toBe(`"sba"`);
  });

  it("renders one chip per grantType value with human labels", () => {
    const chips = computeActiveChips(
      filters({ grantType: ["FEDERAL" as never, "STATE" as never] }),
      "",
    );
    expect(chips.map((c) => c.label)).toEqual(["Federal", "State"]);
    expect(chips.every((c) => c.dimension === "grantType")).toBe(true);
  });

  it("renders demographic chips with human labels", () => {
    const chips = computeActiveChips(filters({ gender: ["WOMEN" as never] }), "");
    expect(chips[0].label).toBe("Women-Owned");
  });

  it("suppresses chips for the default status filter", () => {
    expect(computeActiveChips(filters({ status: ["OPEN", "FORECASTED"] }), "")).toEqual([]);
  });

  it("renders chips for a non-default status", () => {
    const chips = computeActiveChips(filters({ status: ["CLOSED"] }), "");
    expect(chips).toHaveLength(1);
    expect(chips[0].dimension).toBe("status");
    expect(chips[0].label).toBe("Closed");
  });

  it("renders a location chip with the raw location string", () => {
    const chips = computeActiveChips(filters({ location: "Des Moines" }), "");
    expect(chips[0].dimension).toBe("location");
    expect(chips[0].label).toBe("Des Moines");
  });

  it("renders eligibleExpense chips with human labels", () => {
    const chips = computeActiveChips(filters({ eligibleExpense: ["EQUIPMENT"] }), "");
    expect(chips[0].label).toBe("Equipment Purchases");
  });

  it("combines multiple dimensions in a stable order", () => {
    const chips = computeActiveChips(
      filters({
        grantType: ["FEDERAL" as never],
        gender: ["WOMEN" as never],
        location: "Iowa",
      }),
      "solar",
    );
    expect(chips.map((c) => c.dimension)).toEqual(["search", "grantType", "gender", "location"]);
  });
});

describe("removeChipFromFilters", () => {
  it("clears a location filter", () => {
    const next = removeChipFromFilters(filters({ location: "Iowa" }), {
      key: "location:Iowa",
      label: "Iowa",
      dimension: "location",
    });
    expect(next.location).toBeUndefined();
    expect(next.page).toBe(1);
  });

  it("removes one value from a multi-valued dimension", () => {
    const next = removeChipFromFilters(
      filters({ grantType: ["FEDERAL" as never, "STATE" as never] }),
      {
        key: "grantType:FEDERAL",
        label: "Federal",
        dimension: "grantType",
        value: "FEDERAL",
      },
    );
    expect(next.grantType).toEqual(["STATE"]);
  });

  it("sets the dimension to undefined when the last value is removed", () => {
    const next = removeChipFromFilters(filters({ gender: ["WOMEN" as never] }), {
      key: "gender:WOMEN",
      label: "Women-Owned",
      dimension: "gender",
      value: "WOMEN",
    });
    expect(next.gender).toBeUndefined();
  });

  it("returns filters unchanged when asked to remove search (caller handles it)", () => {
    const f = filters();
    const next = removeChipFromFilters(f, {
      key: "search",
      label: '"sba"',
      dimension: "search",
    });
    expect(next).toBe(f);
  });

  it("clears both amountMin and amountMax when the amount chip is removed", () => {
    const next = removeChipFromFilters(filters({ amountMin: 10000, amountMax: 50000 }), {
      key: "amount:10000-50000",
      label: "Amount: $10k–$50k",
      dimension: "amount",
    });
    expect(next.amountMin).toBeUndefined();
    expect(next.amountMax).toBeUndefined();
  });

  it("clears the industry filter", () => {
    const next = removeChipFromFilters(filters({ industry: "Tech" }), {
      key: "industry:Tech",
      label: "Tech",
      dimension: "industry",
    });
    expect(next.industry).toBeUndefined();
  });
});

describe("formatAmountChip", () => {
  it("uses 'k' suffix for 4–6 figure amounts", () => {
    expect(formatAmountChip(10000, undefined)).toBe("Amount: $10k+");
    expect(formatAmountChip(50000, undefined)).toBe("Amount: $50k+");
  });

  it("uses 'M' suffix for 7+ figure amounts", () => {
    expect(formatAmountChip(1_000_000, undefined)).toBe("Amount: $1M+");
    expect(formatAmountChip(2_500_000, undefined)).toBe("Amount: $2.5M+");
  });

  it("renders a range when both bounds are set", () => {
    expect(formatAmountChip(10000, 50000)).toBe("Amount: $10k–$50k");
  });

  it("renders an 'up to' label when only max is set", () => {
    expect(formatAmountChip(undefined, 25000)).toBe("Amount: up to $25k");
  });
});

describe("amount chip integration", () => {
  it("renders an amount chip when amountMin is set", () => {
    const chips = computeActiveChips(filters({ amountMin: 10000 }), "");
    expect(chips).toHaveLength(1);
    expect(chips[0].dimension).toBe("amount");
    expect(chips[0].label).toBe("Amount: $10k+");
  });

  it("renders an amount chip when both bounds are set", () => {
    const chips = computeActiveChips(filters({ amountMin: 1000, amountMax: 10000 }), "");
    expect(chips[0].label).toBe("Amount: $1k–$10k");
  });

  it("renders an industry chip", () => {
    const chips = computeActiveChips(filters({ industry: "Healthcare" }), "");
    expect(chips.map((c) => c.dimension)).toEqual(["industry"]);
    expect(chips[0].label).toBe("Healthcare");
  });
});
