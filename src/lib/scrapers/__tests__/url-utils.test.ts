import { describe, it, expect } from "vitest";
import { isSafeUrl, sanitizeUrl, isGenericHomepage } from "../url-utils";

describe("isSafeUrl", () => {
  it("should allow normal HTTP/HTTPS URLs", () => {
    expect(isSafeUrl("https://example.com/grants")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("should block private IPs", () => {
    expect(isSafeUrl("http://10.0.0.1")).toBe(false);
    expect(isSafeUrl("http://192.168.1.1")).toBe(false);
    expect(isSafeUrl("http://127.0.0.1")).toBe(false);
    expect(isSafeUrl("http://172.16.0.1")).toBe(false);
  });

  it("should block cloud metadata endpoints", () => {
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeUrl("http://metadata.google.internal")).toBe(false);
  });

  it("should block IPv6 loopback and link-local addresses", () => {
    expect(isSafeUrl("http://[::1]")).toBe(false);
    expect(isSafeUrl("http://[::1]:8080/admin")).toBe(false);
  });

  it("should block IPv4-mapped IPv6 addresses", () => {
    expect(isSafeUrl("http://[::ffff:127.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:10.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:192.168.1.1]")).toBe(false);
  });

  it("should block IPv6 link-local addresses", () => {
    expect(isSafeUrl("http://[fe80::1]")).toBe(false);
  });

  it("should block non-HTTP protocols", () => {
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("should return false for invalid URLs", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });
});

describe("sanitizeUrl", () => {
  it("should return http/https URLs unchanged", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
    expect(sanitizeUrl("http://example.com/path")).toBe("http://example.com/path");
  });

  it("should return null for dangerous protocols", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("data:text/html,<h1>hi</h1>")).toBeNull();
  });

  it("should return null for invalid URLs", () => {
    expect(sanitizeUrl("not-a-url")).toBeNull();
  });
});

describe("isGenericHomepage", () => {
  it("should identify root URLs as homepages", () => {
    expect(isGenericHomepage("https://example.com/")).toBe(true);
    expect(isGenericHomepage("https://example.com")).toBe(true);
  });

  it("should identify generic single-segment paths", () => {
    expect(isGenericHomepage("https://example.com/about")).toBe(true);
    expect(isGenericHomepage("https://example.com/grants")).toBe(true);
    expect(isGenericHomepage("https://example.com/business")).toBe(true);
  });

  it("should not flag specific grant pages", () => {
    expect(isGenericHomepage("https://example.com/grants/rural-business-development")).toBe(false);
    expect(isGenericHomepage("https://example.com/programs/sbir-2025")).toBe(false);
  });
});
