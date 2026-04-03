import { describe, it, expect } from "vitest";
import {
  cleanHtmlToText,
  extractDeadline,
  normalizeTitle,
  isExcludedByStateRestriction,
  detectLocationScope,
  isActualGrantPage,
  isGenericHomepage,
  isNonGrantProgram,
} from "../utils";

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("Small Business Grant - 2024!")).toBe(
      "small business grant 2024"
    );
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  Iowa   Grant  ")).toBe("iowa grant");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

describe("cleanHtmlToText", () => {
  it("strips HTML tags and returns plain text", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    const result = cleanHtmlToText(html);
    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<strong>");
  });

  it("removes script and style tags entirely", () => {
    const html = '<p>Content</p><script>alert("xss")</script><style>.x{}</style>';
    const result = cleanHtmlToText(html);
    expect(result).toContain("Content");
    expect(result).not.toContain("alert");
    expect(result).not.toContain(".x");
  });

  it("returns non-HTML text as-is (cleaned)", () => {
    expect(cleanHtmlToText("  plain text  ")).toBe("plain text");
  });

  it("truncates to maxLength", () => {
    const result = cleanHtmlToText("a".repeat(3000), 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("handles empty input", () => {
    expect(cleanHtmlToText("")).toBe("");
  });
});

describe("extractDeadline", () => {
  it("extracts date after 'deadline' label", () => {
    const html = "<p>Application deadline: January 15, 2026</p>";
    const result = extractDeadline(html);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(0); // January
    expect(result!.getDate()).toBe(15);
  });

  it("extracts date with 'closes' label", () => {
    const html = "<span>This opportunity closes 03/31/2026</span>";
    const result = extractDeadline(html);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(2); // March
  });

  it("extracts ISO format dates", () => {
    const html = "<p>Due date: 2026-06-30</p>";
    const result = extractDeadline(html);
    expect(result).toBeInstanceOf(Date);
  });

  it("returns undefined when no deadline found", () => {
    expect(extractDeadline("<p>No date here</p>")).toBeUndefined();
  });

  it("rejects very old dates", () => {
    const html = "<p>Deadline: January 1, 2020</p>";
    expect(extractDeadline(html)).toBeUndefined();
  });
});

describe("isExcludedByStateRestriction", () => {
  it("excludes grants restricted to non-Iowa states", () => {
    expect(isExcludedByStateRestriction("California only")).toBe(true);
    expect(isExcludedByStateRestriction("restricted to Texas")).toBe(true);
    expect(isExcludedByStateRestriction("New York businesses only")).toBe(true);
  });

  it("does not exclude nationwide grants", () => {
    expect(isExcludedByStateRestriction("Available nationwide")).toBe(false);
    expect(isExcludedByStateRestriction("Open to all states")).toBe(false);
    expect(isExcludedByStateRestriction("All 50 states eligible")).toBe(false);
  });

  it("does not exclude Iowa-related text", () => {
    expect(isExcludedByStateRestriction("Iowa small business grant")).toBe(false);
  });

  it("does not exclude generic text without state restrictions", () => {
    expect(isExcludedByStateRestriction("Small business equipment grant")).toBe(false);
  });
});

describe("detectLocationScope", () => {
  it("detects Iowa mentions", () => {
    const result = detectLocationScope("Iowa small business program");
    expect(result).toContain("Iowa");
  });

  it("detects specific Iowa cities", () => {
    const result = detectLocationScope("Grant for businesses in Des Moines, Iowa");
    expect(result).toContain("Iowa");
    expect(result).toContain("Des Moines");
  });

  it("detects nationwide grants", () => {
    const result = detectLocationScope("Available nationwide for all states");
    expect(result).toContain("Nationwide");
  });

  it("defaults to Nationwide when no state mentioned", () => {
    const result = detectLocationScope("Small business equipment grant");
    expect(result).toContain("Nationwide");
  });

  it("includes both Nationwide and Iowa for nationwide grants mentioning Iowa", () => {
    const result = detectLocationScope("Nationwide grant, especially in Iowa");
    expect(result).toContain("Nationwide");
    expect(result).toContain("Iowa");
  });
});

describe("isActualGrantPage", () => {
  it("accepts pages with grant signals", () => {
    expect(
      isActualGrantPage(
        "https://example.com/grants/small-business-2024",
        "Small Business Innovation Grant",
        "Award amount: $50,000. Deadline: March 2026. How to apply..."
      )
    ).toBe(true);
  });

  it("rejects generic homepage URLs", () => {
    expect(
      isActualGrantPage(
        "https://example.com/business",
        "Business Resources",
        "Welcome to our site"
      )
    ).toBe(false);
  });

  it("rejects pages with generic titles", () => {
    expect(
      isActualGrantPage(
        "https://example.com/category/grants",
        "Grants",
        "Browse our grants catalog"
      )
    ).toBe(false);
  });

  it("rejects pages without grant-specific content", () => {
    expect(
      isActualGrantPage(
        "https://example.com/programs/something",
        "Something Program",
        "This is a general information page about our organization and mission"
      )
    ).toBe(false);
  });
});

describe("isGenericHomepage", () => {
  it("detects root URLs as homepages", () => {
    expect(isGenericHomepage("https://example.com/")).toBe(true);
    expect(isGenericHomepage("https://example.com")).toBe(true);
  });

  it("detects generic single-segment paths", () => {
    expect(isGenericHomepage("https://example.com/about")).toBe(true);
    expect(isGenericHomepage("https://example.com/contact")).toBe(true);
    expect(isGenericHomepage("https://example.com/grants")).toBe(true);
  });

  it("allows specific multi-segment paths", () => {
    expect(isGenericHomepage("https://example.com/grants/small-business-2024")).toBe(false);
  });

  it("handles invalid URLs gracefully", () => {
    expect(isGenericHomepage("not a url")).toBe(false);
  });
});

describe("isNonGrantProgram", () => {
  it("detects loan programs", () => {
    expect(isNonGrantProgram("Small Business Loan Program")).toBe(true);
    expect(isNonGrantProgram("Low-interest loan for equipment")).toBe(true);
  });

  it("detects revolving funds", () => {
    expect(
      isNonGrantProgram(
        "Water Quality Iowa Finance Authority State Revolving Fund to provide low-cost funds"
      )
    ).toBe(true);
    expect(isNonGrantProgram("Clean Water Revolving Loan Fund")).toBe(true);
  });

  it("does not filter actual grant programs", () => {
    expect(isNonGrantProgram("Small Business Innovation Grant")).toBe(false);
    expect(isNonGrantProgram("Equipment funding for startups")).toBe(false);
    expect(isNonGrantProgram("Federal grant for clean water projects")).toBe(false);
  });

  it("does not false-positive on 'fund' or 'funding' alone", () => {
    expect(isNonGrantProgram("Community Development Fund grant")).toBe(false);
    expect(isNonGrantProgram("Funding opportunity for Iowa businesses")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isNonGrantProgram("STATE REVOLVING FUND")).toBe(true);
    expect(isNonGrantProgram("Loan Program for Agriculture")).toBe(true);
  });
});
