import axios from "axios";
import * as cheerio from "cheerio";
import { cleanHtmlToText, extractDeadline } from "./parsing-utils";
import { SCRAPER_USER_AGENT } from "./config";
import { log } from "@/lib/errors";

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
 * Check if a scraped URL/page represents an actual grant program
 * rather than a generic landing/category page.
 */
export function isActualGrantPage(url: string, title: string, pageText: string): boolean {
  // Reject very short/generic URL paths (e.g., /business, /programs)
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length <= 1) {
      const genericPaths = [
        "business",
        "programs",
        "grants",
        "funding",
        "resources",
        "services",
        "about",
        "help",
      ];
      if (segments.length === 0 || genericPaths.includes(segments[0].toLowerCase())) {
        return false;
      }
    }
  } catch {
    // If URL parsing fails, continue with other checks
  }

  // Reject very generic titles
  const genericTitles = [
    "business",
    "programs",
    "grants",
    "funding",
    "financial assistance",
    "resources",
    "services",
    "home",
    "about",
    "contact",
    "help",
    "small business",
    "entrepreneurs",
  ];
  if (genericTitles.includes(title.toLowerCase().trim())) {
    return false;
  }

  // Require at least one grant-specific content signal in the page text
  const lower = pageText.toLowerCase();
  const grantSignals = [
    /\$[\d,]+/, // Dollar amounts like $5,000
    /deadline/i,
    /eligib/i, // eligible, eligibility
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
 * Fetch a page and extract text content + deadline.
 * Used by web scrapers to visit individual grant pages.
 */
export async function fetchPageDetails(
  url: string,
): Promise<{ description: string; deadline?: Date } | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
      },
      timeout: 10000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);

    // Extract the main content area HTML and clean it properly
    const contentHtml = $("main, article, .content, .entry-content, body").first().html() || "";

    const description = cleanHtmlToText(contentHtml, 1000);

    // Reject error/404 pages
    if (isErrorPage(description)) {
      log("page-utils", "Skipping error page", { url });
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
