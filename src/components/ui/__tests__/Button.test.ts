import { describe, it, expect } from "vitest";
import { buttonClass } from "../Button";

describe("buttonClass", () => {
  it("defaults to primary/md", () => {
    const cls = buttonClass();
    expect(cls).toContain("bg-[var(--primary)]");
    expect(cls).toContain("px-4 py-2");
  });

  it("returns danger variant classes", () => {
    const cls = buttonClass("danger");
    expect(cls).toContain("bg-[var(--danger)]");
    expect(cls).toContain("hover:bg-[var(--danger-hover)]");
  });

  it("returns secondary variant with border", () => {
    const cls = buttonClass("secondary");
    expect(cls).toContain("border-[var(--border)]");
    expect(cls).toContain("bg-[var(--card)]");
  });

  it("returns ghost variant without background by default", () => {
    const cls = buttonClass("ghost");
    expect(cls).toContain("hover:bg-[var(--surface-hover)]");
    expect(cls).not.toContain("bg-[var(--danger)]");
  });

  it("applies small size", () => {
    const cls = buttonClass("primary", "sm");
    expect(cls).toContain("px-3 py-1.5");
    expect(cls).not.toContain("px-4 py-2");
  });

  it("appends extra classes", () => {
    const cls = buttonClass("primary", "md", "w-full");
    expect(cls).toContain("w-full");
  });

  it("includes focus-visible ring using token", () => {
    const cls = buttonClass();
    expect(cls).toContain("focus-visible:ring-[var(--focus-ring)]");
  });
});
