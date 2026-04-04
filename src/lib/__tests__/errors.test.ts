import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../errors";

describe("getErrorMessage", () => {
  it("should extract message from Error instances", () => {
    expect(getErrorMessage(new Error("test error"))).toBe("test error");
  });

  it("should return string errors as-is", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  it("should return 'Unknown error' for non-Error, non-string values", () => {
    expect(getErrorMessage(42)).toBe("Unknown error");
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage(undefined)).toBe("Unknown error");
    expect(getErrorMessage({ foo: "bar" })).toBe("Unknown error");
  });
});
