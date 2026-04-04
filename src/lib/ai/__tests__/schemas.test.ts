import { describe, it, expect } from "vitest";
import { ValidationResultSchema, ValidationResultArraySchema, ParsedGrantSchema } from "../schemas";

describe("ValidationResultSchema", () => {
  it("should accept valid validation result", () => {
    const valid = {
      index: 0,
      is_real_grant: true,
      small_biz_eligible: true,
      content_type: "grant_application",
      confidence: "HIGH",
      reason: "This is a real grant program",
    };
    expect(() => ValidationResultSchema.parse(valid)).not.toThrow();
  });

  it("should reject invalid content_type", () => {
    const invalid = {
      index: 0,
      is_real_grant: true,
      small_biz_eligible: true,
      content_type: "invalid_type",
      confidence: "HIGH",
      reason: "test",
    };
    expect(() => ValidationResultSchema.parse(invalid)).toThrow();
  });

  it("should reject missing fields", () => {
    expect(() => ValidationResultSchema.parse({})).toThrow();
    expect(() => ValidationResultSchema.parse({ index: 0 })).toThrow();
  });
});

describe("ValidationResultArraySchema", () => {
  it("should accept array of valid results", () => {
    const valid = [
      {
        index: 0,
        is_real_grant: true,
        small_biz_eligible: true,
        content_type: "grant_application",
        confidence: "HIGH",
        reason: "Real grant",
      },
      {
        index: 1,
        is_real_grant: false,
        small_biz_eligible: false,
        content_type: "news_article",
        confidence: "MEDIUM",
        reason: "News article about grants",
      },
    ];
    const result = ValidationResultArraySchema.parse(valid);
    expect(result).toHaveLength(2);
  });

  it("should reject non-array input", () => {
    expect(() => ValidationResultArraySchema.parse("not an array")).toThrow();
  });
});

describe("ParsedGrantSchema", () => {
  it("should accept valid parsed grant", () => {
    const valid = {
      title: "Test Grant",
      description: "A test grant program",
      amountMin: 5000,
      amountMax: 50000,
      deadline: "2026-06-15",
      eligibility: "Small businesses in Iowa",
      grantType: "STATE",
      businessStage: "BOTH",
      gender: "ANY",
      locations: ["Iowa"],
      industries: ["Agriculture"],
      eligibleExpenses: ["Equipment"],
      categories: ["Business Development"],
    };
    expect(() => ParsedGrantSchema.parse(valid)).not.toThrow();
  });

  it("should accept null amounts and deadline", () => {
    const valid = {
      title: "Test Grant",
      description: "A test grant",
      amountMin: null,
      amountMax: null,
      deadline: null,
      eligibility: null,
      grantType: "FEDERAL",
      businessStage: "STARTUP",
      gender: "ANY",
      locations: [],
      industries: [],
      eligibleExpenses: [],
      categories: [],
    };
    expect(() => ParsedGrantSchema.parse(valid)).not.toThrow();
  });

  it("should reject missing required fields", () => {
    expect(() => ParsedGrantSchema.parse({})).toThrow();
    expect(() => ParsedGrantSchema.parse({ title: "test" })).toThrow();
  });

  it("should reject wrong types", () => {
    const invalid = {
      title: 123, // should be string
      description: "test",
      amountMin: null,
      amountMax: null,
      deadline: null,
      eligibility: null,
      grantType: "STATE",
      businessStage: "BOTH",
      gender: "ANY",
      locations: [],
      industries: [],
      eligibleExpenses: [],
      categories: [],
    };
    expect(() => ParsedGrantSchema.parse(invalid)).toThrow();
  });
});
