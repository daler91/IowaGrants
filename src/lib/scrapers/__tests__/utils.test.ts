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
  isNonApplicationContent,
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

  it("extracts deadline from flowing text: 'applications are due by'", () => {
    const html = "<p>Applications are due by March 15, 2026 for consideration.</p>";
    const result = extractDeadline(html);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(2); // March
    expect(result!.getDate()).toBe(15);
  });

  it("extracts deadline from flowing text: 'must be submitted by'", () => {
    const html = "<p>All applications must be submitted by June 30, 2026.</p>";
    const result = extractDeadline(html);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(5); // June
  });

  it("extracts deadline from flowing text: 'apply by'", () => {
    const result = extractDeadline("Apply by December 1, 2026 to be considered.");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(11); // December
  });

  it("extracts deadline from flowing text: 'open through'", () => {
    const result = extractDeadline("Applications open through April 2026.");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(3); // April
  });

  it("extracts deadline from flowing text: 'closes on'", () => {
    const result = extractDeadline("<p>This grant closes on September 15, 2026.</p>");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(8); // September
  });

  it("extracts abbreviated month names", () => {
    const result = extractDeadline("<p>Deadline: Mar. 15, 2026</p>");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMonth()).toBe(2); // March
  });

  it("extracts day-before-month format", () => {
    const result = extractDeadline("<p>Deadline: 15 March, 2026</p>");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(15);
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

describe("isNonApplicationContent", () => {
  it("filters awardee announcements without application info", () => {
    const result = isNonApplicationContent(
      "Iowa farms, businesses receive Choose Iowa grants",
      "DES MOINES, Iowa (IOWA CAPITAL DISPATCH) – Iowa Secretary of Agriculture Mike Naig announced Monday that 30 farmers, small businesses and organizations across the state received funding from the Choose Iowa-Value Added Grants Program administered by the Iowa Department of Agriculture and Land Stewardship.",
      "https://iowacapitaldispatch.com/2026/03/31/iowa-farms-businesses-receive-choose-iowa-grants/"
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toContain("Awardee");
  });

  it("filters grants awarded to recipients", () => {
    const result = isNonApplicationContent(
      "City announces grant winners for downtown revitalization",
      "The city has awarded $500,000 in grants to 15 local businesses for downtown improvements. Recipients were selected from a pool of 50 applicants.",
      "https://example.com/news/grant-winners"
    );
    expect(result.excluded).toBe(true);
  });

  it("filters press releases about past funding", () => {
    const result = isNonApplicationContent(
      "USDA announces $10 million in rural development grants",
      "USDA announced today that $10 million has been distributed to rural communities across Iowa. The funding was awarded to 25 organizations.",
      "https://usda.gov/press-releases/rural-grants-2026"
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toContain("Press release");
  });

  it("filters closed/expired programs", () => {
    const result = isNonApplicationContent(
      "Small Business Innovation Grant",
      "This grant program has ended. Applications are no longer being accepted. Thank you for your interest.",
      "https://example.com/grants/innovation"
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toContain("Closed");
  });

  it("does NOT filter legitimate grant applications", () => {
    const result = isNonApplicationContent(
      "Small Business Innovation Research (SBIR) Grant",
      "The SBIR program provides funding to small businesses to engage in R&D. Eligible applicants may apply for up to $250,000. Application deadline is June 30, 2026.",
      "https://example.com/grants/sbir-2026"
    );
    expect(result.excluded).toBe(false);
  });

  it("does NOT filter grants that mention past recipients AND have application info", () => {
    const result = isNonApplicationContent(
      "Amber Grant for Women",
      "The Amber Grant awards $10,000 monthly to women-owned businesses. Past recipients include XYZ Corp who received grant funding in 2025. Apply now for the next cycle. Application deadline is the last day of each month.",
      "https://ambergrant.com/apply"
    );
    expect(result.excluded).toBe(false);
  });

  it("does NOT filter grants from federal API sources", () => {
    const result = isNonApplicationContent(
      "Community Development Block Grant",
      "This funding opportunity provides grants to communities for economic development.",
      "https://sam.gov/opportunities/12345"
    );
    expect(result.excluded).toBe(false);
  });

  it("filters 'applications closed' content", () => {
    const result = isNonApplicationContent(
      "Downtown Improvement Grant",
      "Applications are closed for the 2026 cycle. All funds have been allocated.",
      "https://example.com/grants/downtown"
    );
    expect(result.excluded).toBe(true);
  });

  it("filters content with 'no longer accepting' language", () => {
    const result = isNonApplicationContent(
      "Equipment Purchase Grant",
      "We are no longer accepting applications for this program.",
      "https://example.com/grants/equipment"
    );
    expect(result.excluded).toBe(true);
  });

  it("does NOT filter closed programs that mention an upcoming application cycle", () => {
    const result = isNonApplicationContent(
      "Downtown Improvement Grant",
      "Applications closed for 2025 cycle. The next cycle opens May 2026. Apply now for the upcoming round. Eligibility requirements remain the same.",
      "https://example.com/grants/downtown"
    );
    expect(result.excluded).toBe(false);
  });
});
