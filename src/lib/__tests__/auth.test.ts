import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken, UnauthorizedError } from "../auth";

beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars!!";
});

describe("auth", () => {
  describe("hashPassword / verifyPassword", () => {
    it("should hash and verify a password correctly", async () => {
      const password = "test-password-12345";
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it("should reject wrong password", async () => {
      const hash = await hashPassword("correct-password");
      expect(await verifyPassword("wrong-password", hash)).toBe(false);
    });
  });

  describe("signToken / verifyToken", () => {
    it("should sign and verify a JWT token", async () => {
      const payload = { sub: "user-123", email: "test@example.com", tokenVersion: 1 };
      const token = await signToken(payload);
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

      const verified = await verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe("user-123");
      expect(verified?.email).toBe("test@example.com");
      expect(verified?.tokenVersion).toBe(1);
    });

    it("should return null for invalid token", async () => {
      const result = await verifyToken("invalid.token.here");
      expect(result).toBeNull();
    });

    it("should return null for empty token", async () => {
      const result = await verifyToken("");
      expect(result).toBeNull();
    });
  });

  describe("UnauthorizedError", () => {
    it("should be an instance of Error", () => {
      const err = new UnauthorizedError();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("UnauthorizedError");
      expect(err.message).toBe("Unauthorized");
    });
  });
});
