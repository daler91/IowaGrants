import axios from "axios";
import * as cheerio from "cheerio";
import { IOWA_LOCATIONS } from "@/lib/ai/categorizer";

/**
 * Clean HTML content to plain text. Designed for sanitizing rich-text fields
 * from databases like Airtable that may contain iframes, tracking scripts,
 * navigation remnants, and other non-content HTML.
 */
export function cleanHtmlToText(html: string, maxLength = 2000): string {
  if (!html) return "";

  // If it doesn't look like HTML, just clean whitespace and return
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.replaceAll(/\s+/g, " ").trim().slice(0, maxLength);
  }

  const $ = cheerio.load(html);

  // Remove non-content elements entirely
  $("script, style, iframe, noscript, nav, footer, header, svg").remove();

  // Convert block elements to newlines before stripping tags
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote").each((_, el) => {
    $(el).prepend("\n");
    $(el).append("\n");
  });

  const text = $.text();

  return text
    .replaceAll("\r\n", "\n")
    .replaceAll(/[ \t]+/g, " ")        // collapse horizontal whitespace
    .replaceAll("\n ", "\n")           // trim leading spaces on lines
    .replaceAll(" \n", "\n")           // trim trailing spaces on lines
    .replaceAll(/\n{3,}/g, "\n\n")     // max 2 consecutive newlines
    .trim()
    .slice(0, maxLength);
}

/**
 * Extract a deadline date from HTML content by searching for common patterns.
 */
export function extractDeadline(html: string): Date | undefined {
  const text = html.replaceAll(/<[^>]+>/g, " ").replaceAll(/\s+/g, " ");

  // Find deadline label positions, then extract dates after them
  const labelPattern = /(?:deadline|due date|closes?|closing date|expiration|expires?|submit by|applications? due|apply by)[:\s]*/gi;
  const dateFormats = [
    /([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ];

  let labelMatch;
  while ((labelMatch = labelPattern.exec(text)) !== null) {
    const after = text.slice(labelMatch.index + labelMatch[0].length);
    for (const fmt of dateFormats) {
      const dateMatch = fmt.exec(after);
      if (dateMatch?.[1]) {
        const parsed = new Date(dateMatch[1]);
        if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= new Date().getFullYear() - 1 && parsed.getFullYear() <= new Date().getFullYear() + 10) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

/**
 * Validate a deadline date — returns undefined if the date is invalid or has
 * an unreasonable year (e.g. year 50315 from bad scraper data).
 */
export function validateDeadline(date: Date | undefined): Date | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year < currentYear - 1 || year > currentYear + 10) return undefined;
  return date;
}

/**
 * Normalize a grant title for deduplication comparison.
 * Lowercases, strips punctuation/extra whitespace, removes common prefixes.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * Fetch a page and extract text content + deadline.
 * Used by web scrapers to visit individual grant pages.
 */
export async function fetchPageDetails(
  url: string
): Promise<{ description: string; deadline?: Date } | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
      },
      timeout: 10000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);

    // Remove nav, footer, scripts
    $("nav, footer, script, style, header").remove();

    const bodyText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 1000);

    const deadline = extractDeadline(response.data);

    return {
      description: bodyText || "",
      deadline,
    };
  } catch {
    return null;
  }
}

const NON_IOWA_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

const NATIONWIDE_INDICATORS = [
  "nationwide", "all states", "50 states", "any state", "all us",
  "united states", "national", "across the country", "every state",
  "all 50", "open to all",
];

/**
 * Returns true if the text indicates a grant restricted to a specific non-Iowa state.
 * Returns false for nationwide grants or grants that don't restrict by state.
 */
export function isExcludedByStateRestriction(text: string): boolean {
  const lower = text.toLowerCase();

  // If nationwide indicators are present, it's not state-restricted
  if (NATIONWIDE_INDICATORS.some((ind) => lower.includes(ind))) {
    return false;
  }

  for (const state of NON_IOWA_STATES) {
    const s = state.toLowerCase();
    const restrictionPatterns = [
      `${s} only`,
      `${s} businesses only`,
      `${s} residents only`,
      `restricted to ${s}`,
      `available only in ${s}`,
      `must be located in ${s}`,
      `open to ${s} residents`,
      `eligible applicants must be in ${s}`,
      `available to ${s}`,
      `exclusively for ${s}`,
      `limited to ${s}`,
    ];

    if (restrictionPatterns.some((p) => lower.includes(p))) {
      return true;
    }
  }

  return false;
}

/**
 * Detect the geographic scope of a grant from its text content.
 * Returns location tags like ["Nationwide"], ["Iowa", "Des Moines"], etc.
 */
export function detectLocationScope(text: string): string[] {
  const lower = text.toLowerCase();

  const mentionsIowa = lower.includes("iowa");
  const isNationwide = NATIONWIDE_INDICATORS.some((ind) => lower.includes(ind));

  const iowaLocations = IOWA_LOCATIONS.filter((loc) => text.includes(loc));

  if (mentionsIowa && !isNationwide) {
    return iowaLocations.length > 0
      ? ["Iowa", ...iowaLocations]
      : ["Iowa"];
  }

  if (isNationwide) {
    const locs: string[] = ["Nationwide"];
    if (mentionsIowa) locs.push("Iowa");
    if (iowaLocations.length > 0) locs.push(...iowaLocations);
    return locs;
  }

  // No specific state mentioned — assume accessible nationwide
  return ["Nationwide"];
}

/**
 * Returns true if the text indicates a grant is restricted to entity types
 * that are NOT small businesses (e.g., nonprofits only, government agencies only).
 */
export function isExcludedByEligibility(text: string): boolean {
  const lower = text.toLowerCase();

  const NON_SMALL_BIZ_PATTERNS = [
    "nonprofits only",
    "nonprofit organizations only",
    "non-profit organizations only",
    "501(c)(3) only",
    "501(c)(3) organizations only",
    "501c3 only",
    "tax-exempt organizations only",
    "tax-exempt only",
    "government agencies only",
    "state agencies only",
    "federal agencies only",
    "municipalities only",
    "municipal governments only",
    "tribal governments only",
    "tribal nations only",
    "universities only",
    "colleges only",
    "educational institutions only",
    "academic institutions only",
    "hospitals only",
    "health departments only",
    "public health agencies only",
    "must be a nonprofit",
    "must be a 501(c)",
    "must be a non-profit",
    "applicant must be a nonprofit",
    "applicants must be nonprofit",
    "limited to nonprofit",
    "limited to non-profit",
    "limited to government",
    "restricted to nonprofit",
    "restricted to non-profit",
    "restricted to government",
    "open to nonprofits only",
    "open to non-profits only",
    "available to nonprofits only",
    "eligible applicants include state",
    "eligible applicants include tribal",
    "only open to 501(c)",
    "only available to nonprofit",
    "not available to for-profit",
    "not eligible for for-profit",
    "for-profit businesses are not eligible",
    "for-profit organizations are not eligible",
    "ineligible.*for-profit",
  ];

  // Check direct string patterns
  for (const pattern of NON_SMALL_BIZ_PATTERNS) {
    if (pattern.includes("*")) {
      // Treat as simple regex
      const regex = new RegExp(pattern.replaceAll("*", ".*"), "i");
      if (regex.test(lower)) return true;
    } else if (lower.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a scraped URL/page represents an actual grant program
 * rather than a generic landing/category page.
 */
export function isActualGrantPage(url: string, title: string, pageText: string): boolean {
  // Reject very short/generic URL paths (e.g., /business, /programs)
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length <= 1) {
      const genericPaths = ["business", "programs", "grants", "funding", "resources", "services", "about", "help"];
      if (segments.length === 0 || genericPaths.includes(segments[0].toLowerCase())) {
        return false;
      }
    }
  } catch {
    // If URL parsing fails, continue with other checks
  }

  // Reject very generic titles
  const genericTitles = [
    "business", "programs", "grants", "funding", "financial assistance",
    "resources", "services", "home", "about", "contact", "help",
    "small business", "entrepreneurs",
  ];
  if (genericTitles.includes(title.toLowerCase().trim())) {
    return false;
  }

  // Require at least one grant-specific content signal in the page text
  const lower = pageText.toLowerCase();
  const grantSignals = [
    /\$[\d,]+/,                          // Dollar amounts like $5,000
    /deadline/i,
    /eligib/i,                           // eligible, eligibility
    /how to apply/i,
    /application/i,
    /award amount/i,
    /grant program/i,
    /funding opportunity/i,
    /apply now/i,
    /submit.*application/i,
  ];

  return grantSignals.some((pattern) => pattern.test(lower));
}

/**
 * Check if a URL is a generic landing page / homepage rather than a
 * specific grant page. Returns true if the URL looks like a homepage.
 */
export function isGenericHomepage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");

    // Root path = homepage
    if (pathname === "" || pathname === "/") return true;

    const segments = pathname.split("/").filter(Boolean);

    // Single-segment generic paths
    if (segments.length === 1) {
      const generic = [
        "about", "contact", "home", "index", "main", "welcome",
        "business", "programs", "grants", "funding", "resources",
        "services", "help", "support", "faq", "blog", "news",
        "partners", "sponsors", "donate", "join", "membership",
      ];
      if (generic.includes(segments[0].toLowerCase())) return true;
    }

    return false;
  } catch {
    return false;
  }
}
