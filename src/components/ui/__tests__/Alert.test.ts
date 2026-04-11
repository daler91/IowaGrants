import { describe, it, expect } from "vitest";
import { alertContainerClass, alertRole } from "../Alert";

describe("alertContainerClass", () => {
  it("uses success tokens for success variant", () => {
    const cls = alertContainerClass("success");
    expect(cls).toContain("bg-[var(--success-bg)]");
    expect(cls).toContain("border-[var(--success-border)]");
    expect(cls).toContain("text-[var(--success-fg)]");
  });

  it("uses danger tokens for error variant", () => {
    const cls = alertContainerClass("error");
    expect(cls).toContain("bg-[var(--danger-bg)]");
    expect(cls).toContain("text-[var(--danger-fg)]");
  });

  it("uses warning tokens for warning variant", () => {
    const cls = alertContainerClass("warning");
    expect(cls).toContain("bg-[var(--warning-bg)]");
  });

  it("uses info tokens for info variant", () => {
    const cls = alertContainerClass("info");
    expect(cls).toContain("bg-[var(--info-bg)]");
  });

  it("appends extra classes", () => {
    const cls = alertContainerClass("info", "mb-4");
    expect(cls).toContain("mb-4");
  });
});

describe("alertRole", () => {
  it("uses assertive 'alert' role for error + warning", () => {
    expect(alertRole("error")).toBe("alert");
    expect(alertRole("warning")).toBe("alert");
  });

  it("uses polite 'status' role for success + info", () => {
    expect(alertRole("success")).toBe("status");
    expect(alertRole("info")).toBe("status");
  });
});
