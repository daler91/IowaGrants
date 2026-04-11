import { describe, it, expect } from "vitest";
import {
  badgeClass,
  typeBadgeVariant,
  statusBadgeVariant,
  demographicBadgeVariant,
  stageBadgeVariant,
} from "../Badge";

describe("badgeClass", () => {
  it("uses type-federal tokens", () => {
    const cls = badgeClass("type-federal");
    expect(cls).toContain("bg-[var(--type-federal-bg)]");
    expect(cls).toContain("text-[var(--type-federal-fg)]");
  });

  it("uses rolling tokens", () => {
    expect(badgeClass("rolling")).toContain("bg-[var(--badge-rolling-bg)]");
  });

  it("applies sm size by default", () => {
    expect(badgeClass("neutral")).toContain("px-2 py-0.5 text-xs");
  });

  it("applies md size when requested", () => {
    expect(badgeClass("neutral", "md")).toContain("px-3 py-1 text-sm");
  });
});

describe("typeBadgeVariant", () => {
  it("maps FEDERAL/STATE/LOCAL/PRIVATE to type variants", () => {
    expect(typeBadgeVariant("FEDERAL")).toBe("type-federal");
    expect(typeBadgeVariant("STATE")).toBe("type-state");
    expect(typeBadgeVariant("LOCAL")).toBe("type-local");
    expect(typeBadgeVariant("PRIVATE")).toBe("type-private");
  });

  it("falls back to neutral for unknown", () => {
    expect(typeBadgeVariant("MYSTERY")).toBe("neutral");
  });
});

describe("statusBadgeVariant", () => {
  it("maps known statuses", () => {
    expect(statusBadgeVariant("OPEN")).toBe("status-open");
    expect(statusBadgeVariant("CLOSED")).toBe("status-closed");
    expect(statusBadgeVariant("FORECASTED")).toBe("status-forecasted");
  });

  it("falls back to neutral for unknown", () => {
    expect(statusBadgeVariant("DRAFT")).toBe("neutral");
  });
});

describe("demographicBadgeVariant", () => {
  it("maps WOMEN/VETERAN/MINORITY", () => {
    expect(demographicBadgeVariant("WOMEN")).toBe("women");
    expect(demographicBadgeVariant("VETERAN")).toBe("veteran");
    expect(demographicBadgeVariant("MINORITY")).toBe("minority");
  });

  it("returns null for GENERAL/ANY", () => {
    expect(demographicBadgeVariant("GENERAL")).toBeNull();
    expect(demographicBadgeVariant("ANY")).toBeNull();
  });
});

describe("stageBadgeVariant", () => {
  it("maps STARTUP/EXISTING", () => {
    expect(stageBadgeVariant("STARTUP")).toBe("startup");
    expect(stageBadgeVariant("EXISTING")).toBe("existing");
  });

  it("returns null for BOTH", () => {
    expect(stageBadgeVariant("BOTH")).toBeNull();
  });
});
