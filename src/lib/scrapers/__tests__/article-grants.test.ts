import { describe, it, expect } from "vitest";
import { extractAmountFromText } from "../article-grants";

describe("extractAmountFromText", () => {
  it("extracts a simple grant amount", () => {
    expect(extractAmountFromText("Awards up to $50,000 to eligible businesses")).toBe("$50,000");
  });

  it("extracts a range amount", () => {
    expect(extractAmountFromText("Grants of $5,000 to $50,000 available")).toBe("$5,000 to $50,000");
  });

  it("skips revenue requirement and finds actual grant amount", () => {
    expect(
      extractAmountFromText(
        "Must have $50,000 in annual revenue. Awards up to $10,000 for qualifying businesses."
      )
    ).toBe("$10,000");
  });

  it("returns undefined when only revenue/requirement amounts exist", () => {
    expect(
      extractAmountFromText("Requires minimum $100,000 revenue to qualify for the program")
    ).toBeUndefined();
  });

  it("skips income threshold and finds grant amount", () => {
    expect(
      extractAmountFromText(
        "Grant of $25,000 for businesses earning $500,000 or more annually"
      )
    ).toBe("$25,000");
  });

  it("skips fee amounts", () => {
    expect(
      extractAmountFromText("Application fee of $200. Grant provides $15,000 in funding.")
    ).toBe("$15,000");
  });

  it("prefers amount with positive context over neutral", () => {
    expect(
      extractAmountFromText(
        "Based in cities with $1,000,000 budgets. Grant award of $25,000."
      )
    ).toBe("$25,000");
  });

  it("returns first clean match when no positive context", () => {
    expect(extractAmountFromText("Provides $10,000 for small businesses")).toBe("$10,000");
  });

  it("returns undefined for empty string", () => {
    expect(extractAmountFromText("")).toBeUndefined();
  });

  it("returns undefined for text with no dollar amounts", () => {
    expect(extractAmountFromText("This program offers grants to small businesses")).toBeUndefined();
  });

  it("skips salary amounts", () => {
    expect(
      extractAmountFromText("Average salary of $60,000. Grant award up to $5,000.")
    ).toBe("$5,000");
  });

  it("skips investment amounts", () => {
    expect(
      extractAmountFromText("Company raised $2,000,000 in investment. Offers $10,000 grants.")
    ).toBe("$10,000");
  });
});
