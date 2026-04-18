import { describe, it, expect } from "vitest";
import { redactPII } from "../pdf-parser";

describe("redactPII", () => {
  it("returns empty input unchanged", () => {
    expect(redactPII("")).toBe("");
  });

  it("passes through text without SSN", () => {
    expect(redactPII("no sensitive data here")).toBe("no sensitive data here");
  });

  it("redacts a bare SSN", () => {
    expect(redactPII("123-45-6789")).toBe("[REDACTED-SSN]");
  });

  it("redacts SSN surrounded by words", () => {
    expect(redactPII("SSN: 123-45-6789 on file")).toBe("SSN: [REDACTED-SSN] on file");
  });

  it("redacts multiple SSNs", () => {
    expect(redactPII("a 111-22-3333 b 444-55-6666")).toBe("a [REDACTED-SSN] b [REDACTED-SSN]");
  });

  it("does not match digit-runs longer than an SSN pattern", () => {
    expect(redactPII("phone 1234-56-7890")).toBe("phone 1234-56-7890");
    expect(redactPII("code 123-45-67890")).toBe("code 123-45-67890");
  });

  it("requires both dashes", () => {
    expect(redactPII("123456789")).toBe("123456789");
    expect(redactPII("123-456789")).toBe("123-456789");
  });
});
