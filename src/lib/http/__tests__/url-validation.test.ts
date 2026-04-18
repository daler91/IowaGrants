import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "../url-validation";
import { grantUpdateSchema, loginSchema } from "../schemas";

describe("validateExternalUrl", () => {
  it("accepts https URLs", () => {
    expect(validateExternalUrl("https://example.com/grants")).toEqual({
      ok: true,
      url: "https://example.com/grants",
    });
  });

  it("accepts http URLs", () => {
    expect(validateExternalUrl("http://example.com/").ok).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(validateExternalUrl("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "invalid_protocol",
    });
  });

  it("rejects data: URLs", () => {
    expect(validateExternalUrl("data:text/html,<script>alert(1)</script>").ok).toBe(false);
  });

  it("rejects file: URLs", () => {
    expect(validateExternalUrl("file:///etc/passwd").ok).toBe(false);
  });

  it("rejects cloud metadata IPs", () => {
    expect(validateExternalUrl("http://169.254.169.254/latest/meta-data")).toEqual({
      ok: false,
      reason: "blocked_host",
    });
  });

  it("rejects localhost / loopback IPs", () => {
    expect(validateExternalUrl("http://127.0.0.1:3000/").ok).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(validateExternalUrl("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects malformed URLs", () => {
    expect(validateExternalUrl("not a url").ok).toBe(false);
  });

  it("rejects oversize URLs", () => {
    const huge = "https://example.com/" + "a".repeat(3000);
    expect(validateExternalUrl(huge)).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("grantUpdateSchema URL fields", () => {
  it("accepts an http(s) sourceUrl", () => {
    const result = grantUpdateSchema.safeParse({ sourceUrl: "https://iowa.gov/grant/1" });
    expect(result.success).toBe(true);
  });

  it("rejects javascript: sourceUrl", () => {
    const result = grantUpdateSchema.safeParse({ sourceUrl: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects cloud metadata sourceUrl", () => {
    const result = grantUpdateSchema.safeParse({
      sourceUrl: "http://169.254.169.254/latest/meta-data",
    });
    expect(result.success).toBe(false);
  });

  it("allows pdfUrl null and rejects javascript: pdfUrl", () => {
    expect(grantUpdateSchema.safeParse({ pdfUrl: null }).success).toBe(true);
    expect(grantUpdateSchema.safeParse({ pdfUrl: "javascript:void(0)" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a valid email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "12charspassword" }).success,
    ).toBe(false);
  });

  it("requires a 12+ char password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
  });

  it("accepts a good email + long password", () => {
    expect(
      loginSchema.safeParse({ email: "admin@example.com", password: "validpassword123" }).success,
    ).toBe(true);
  });
});
