import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("env", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache so env.ts re-reads process.env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw for missing required env vars", async () => {
    delete process.env.DATABASE_URL;
    // Dynamic import to get fresh module
    const { env } = await import("../env");
    expect(() => env.DATABASE_URL).toThrow("Missing required environment variable: DATABASE_URL");
  });

  it("should return value for set required env vars", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    const { env } = await import("../env");
    expect(env.DATABASE_URL).toBe("postgresql://test");
  });

  it("should return undefined for unset optional env vars", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { env } = await import("../env");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("should return value for set optional env vars", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { env } = await import("../env");
    expect(env.ANTHROPIC_API_KEY).toBe("test-key");
  });

  it("isProduction should reflect NODE_ENV", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { env } = await import("../env");
    expect(env.isProduction).toBe(true);
  });
});
