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

    // Extract the main content area HTML and clean it properly
    const contentHtml = $("main, article, .content, .entry-content, body")
      .first()
      .html() || "";

    const description = cleanHtmlToText(contentHtml, 1000);

    // Reject error/404 pages
    if (isErrorPage(description)) {
      console.log(`[fetchPageDetails] Skipping error page: ${url}`);
      return null;
    }

    const deadline = extractDeadline(response.data);

    return {
      description: description || "",
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
 * Returns true if the text indicates a loan program or other non-grant
 * funding mechanism (e.g., revolving funds, low-interest loans).
 */
export function isNonGrantProgram(text: string): boolean {
  const lower = text.toLowerCase();

  const NON_GRANT_PATTERNS = [
    "loan program",
    "loan application",
    "loan repayment",
    "loan forgiveness program",
    "revolving fund",
    "revolving loan",
    "state revolving fund",
    "low-cost funds",
    "low-interest loan",
    "loan interest rate",
    "loan-based",
    "not a grant",
    "this is a loan",
    "repayable loan",
    "loan disbursement",
    "loan servicing",
  ];

  for (const pattern of NON_GRANT_PATTERNS) {
    if (lower.includes(pattern)) return true;
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
 * Returns true if the page text looks like an error page (404, 500, etc.)
 * or contains too little content to be a real grant listing.
 */
export function isErrorPage(text: string): boolean {
  const lower = text.toLowerCase();

  const ERROR_PATTERNS = [
    "page not found",
    "404 error",
    "404 not found",
    "we couldn't find that page",
    "this page doesn't exist",
    "this page is no longer available",
    "no longer available",
    "page has been removed",
    "page has moved",
    "page may have been moved",
    "500 internal server error",
    "internal server error",
    "503 service unavailable",
    "403 forbidden",
    "access denied",
    "uh oh! it looks like what you're searching for is not there anymore",
    "the page you are looking for cannot be found",
    "this page could not be found",
  ];

  if (ERROR_PATTERNS.some((p) => lower.includes(p))) return true;

  // Too short to be a real grant page
  const cleaned = text.replaceAll(/\s+/g, " ").trim();
  if (cleaned.length < 50) return true;

  return false;
}

/**
 * Parse grant dollar amounts from text, handling magnitude suffixes
 * like $12.68M, $50K, and ranges like "$5,000 to $50,000".
 * Returns null if no valid amount found or amount is suspiciously low (<$100).
 */
export function parseGrantAmount(text: string): { raw: string; min: number; max: number } | null {
  // Match dollar amounts with optional magnitude suffixes
  const amountPattern = /\$\s*([\d,]+(?:\.\d+)?)\s*([KkMmBb](?:illion|illion)?|[Kk]|[Mm]illion|[Bb]illion)?/g;

  const amounts: Array<{ value: number; raw: string }> = [];
  let match;

  while ((match = amountPattern.exec(text)) !== null) {
    const numStr = match[1].replaceAll(",", "");
    let value = Number.parseFloat(numStr);
    const suffix = match[2]?.toLowerCase();

    if (suffix) {
      if (suffix.startsWith("k")) value *= 1_000;
      else if (suffix.startsWith("m")) value *= 1_000_000;
      else if (suffix.startsWith("b")) value *= 1_000_000_000;
    }

    // Reject amounts below $100 (likely parsing errors like "$12.68" from "$12.68M" text)
    if (value < 100 && !suffix) continue;

    amounts.push({ value, raw: match[0].trim() });
  }

  if (amounts.length === 0) return null;

  // Check for range patterns in original text
  const rangePattern = /\$\s*[\d,]+(?:\.\d+)?\s*[KkMmBb]?\w*\s*(?:to|-|–|—)\s*\$\s*[\d,]+(?:\.\d+)?\s*[KkMmBb]?\w*/;
  const hasRange = rangePattern.test(text);

  if (hasRange && amounts.length >= 2) {
    const sorted = [...amounts].sort((a, b) => a.value - b.value);
    return {
      raw: `$${sorted[0].value.toLocaleString()} - $${sorted[sorted.length - 1].value.toLocaleString()}`,
      min: sorted[0].value,
      max: sorted[sorted.length - 1].value,
    };
  }

  // Single amount
  const best = amounts[0];
  return { raw: best.raw, min: best.value, max: best.value };
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

// Patterns that indicate an application opportunity is present
// Patterns that indicate an OPEN application opportunity — these must be specific
// enough to not match closed-program language (e.g., "applications closed" should
// NOT trigger "application" as a signal)
const APPLICATION_SIGNAL_PATTERNS = [
  /\bapply\s+(?:now|here|today|online|at)\b/i,
  /\bhow\s+to\s+apply\b/i,
  /\bsubmit\s+your\b/i,
  /\beligibility\s+requirements\b/i,
  /\beligible\s+applicants\b/i,
  /\bwho\s+can\s+apply\b/i,
  /\bapplication\s+deadline\b/i,
  /\bapply\s+by\b/i,
  /\bapplications?\s+due\b/i,
  /\bapplications?\s+(?:are\s+)?(?:now\s+)?(?:open|being\s+accepted|accepted)\b/i,
  /\brequest\s+for\s+(?:proposals|applications)\b/i,
  /\b(?:rfp|rfa|nofo)\b/i,
  /\bnotice\s+of\s+funding\b/i,
  /\bnext\s+cycle\s+opens?\b/i,
  /\bupcoming\s+(?:round|cycle|deadline)\b/i,
];

// Patterns that indicate awardee/recipient announcements (past awards, not open applications)
const AWARDEE_PATTERNS = [
  /\breceives?\s+(?:\$[\d,]+\s+)?grants?\b/i,
  /\breceived\s+(?:\$[\d,]+\s+)?(?:in\s+)?(?:grant|funding)\b/i,
  /\bawarded\s+(?:\$[\d,]+\s+)?(?:in\s+)?grants?\b/i,
  /\bgrants?\s+awarded\s+to\b/i,
  /\bgrant\s+recipients?\b/i,
  /\bgrant\s+awardees?\b/i,
  /\bselected\s+to\s+receive\b/i,
  /\bchosen\s+to\s+receive\b/i,
  /\bannounces?\s+grant\s+(?:winners?|recipients?)\b/i,
  /\bgrants?\s+distributed\s+to\b/i,
  /\breceived\s+funding\s+from\b/i,
  /\bawarded\s+funding\b/i,
];

// Patterns that indicate press releases or news about past funding
const PRESS_RELEASE_PATTERNS = [
  /\bannounced\s+(?:today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bpress\s+release\b/i,
  /\bnews\s+release\b/i,
  /\bhas\s+funded\b/i,
  /\bwere\s+awarded\b/i,
  /\bdistributed\s+\$[\d,]+/i,
  /\bhas\s+awarded\b/i,
  /\bhas\s+distributed\b/i,
];

// URL path segments that suggest news/press content
const NEWS_URL_SEGMENTS = [
  "/press-release", "/press-releases", "/pressrelease",
  "/newsroom", "/news-room", "/media-center",
  "/news/", "/blog/",
];

// Patterns that indicate a closed or expired program
const CLOSED_PROGRAM_PATTERNS = [
  /\bapplications?\s+(?:are\s+)?closed\b/i,
  /\bno\s+longer\s+accepting\b/i,
  /\bprogram\s+has\s+ended\b/i,
  /\bfunding\s+(?:has\s+been\s+)?exhausted\b/i,
  /\ball\s+funds\s+have\s+been\b/i,
  /\bprogram\s+is\s+closed\b/i,
  /\bdeadline\s+has\s+passed\b/i,
  /\bapplications?\s+are\s+no\s+longer\b/i,
  /\bthis\s+grant\s+(?:program\s+)?is\s+no\s+longer\b/i,
];

/**
 * Returns true if the content looks grant-related but is NOT an open application.
 * Catches awardee announcements, press releases about past funding, and closed programs.
 * Designed to be conservative — only excludes when confidence is high.
 */
export function isNonApplicationContent(
  title: string,
  description: string,
  url: string,
): { excluded: boolean; reason: string } {
  const text = `${title} ${description}`;

  // Check for closed/expired programs — but only if there are no signals
  // for an open/upcoming application cycle (e.g., "closed for 2025" + "next cycle opens May 2026")
  const hasClosedLanguage = CLOSED_PROGRAM_PATTERNS.some((p) => p.test(text));
  if (hasClosedLanguage) {
    const hasApplicationSignal = APPLICATION_SIGNAL_PATTERNS.some((p) => p.test(text));
    if (!hasApplicationSignal) {
      return { excluded: true, reason: "Closed/expired program without open application signals" };
    }
  }

  // Check for awardee/recipient announcements
  const hasAwardeeLanguage = AWARDEE_PATTERNS.some((p) => p.test(text));
  if (hasAwardeeLanguage) {
    // Only exclude if there are NO application signals — some grant pages
    // mention past recipients as examples while also accepting applications
    const hasApplicationSignal = APPLICATION_SIGNAL_PATTERNS.some((p) => p.test(text));
    if (!hasApplicationSignal) {
      return { excluded: true, reason: "Awardee/recipient announcement without application info" };
    }
  }

  // Check for press release / news URL paths
  const lowerUrl = url.toLowerCase();
  const isNewsUrl = NEWS_URL_SEGMENTS.some((seg) => lowerUrl.includes(seg));
  if (isNewsUrl) {
    const hasPressLanguage = PRESS_RELEASE_PATTERNS.some((p) => p.test(text));
    if (hasPressLanguage) {
      const hasApplicationSignal = APPLICATION_SIGNAL_PATTERNS.some((p) => p.test(text));
      if (!hasApplicationSignal) {
        return { excluded: true, reason: "Press release/news article about past funding" };
      }
    }
  }

  return { excluded: false, reason: "" };
}

/**
 * Checks if a URL is reachable (not 404/5xx).
 * Uses HEAD with GET fallback, 5-second timeout.
 */
export async function checkUrlHealth(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GrantScanner/1.0)",
      },
    });

    // HEAD succeeded — check status
    if (response.status >= 200 && response.status < 400) return true;

    // Some servers reject HEAD — try GET
    if (response.status === 405 || response.status === 403) {
      const getResponse = await axios.get(url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GrantScanner/1.0)",
          Range: "bytes=0-1024",
        },
      });
      return getResponse.status >= 200 && getResponse.status < 400;
    }

    return false;
  } catch {
    return false;
  }
}
