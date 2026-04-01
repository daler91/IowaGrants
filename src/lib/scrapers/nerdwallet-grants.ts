import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GenderFocus } from "@prisma/client";
import { cleanHtmlToText, detectLocationScope, isExcludedByStateRestriction } from "./utils";

// ---------------------------------------------------------------------------
// NerdWallet grant list pages
// ---------------------------------------------------------------------------

interface NerdWalletPage {
  url: string;
  name: string;
  gender: GenderFocus;
}

const NERDWALLET_PAGES: NerdWalletPage[] = [
  {
    url: "https://www.nerdwallet.com/article/small-business/small-business-grants",
    name: "nerdwallet-general",
    gender: "ANY",
  },
  {
    url: "https://www.nerdwallet.com/article/small-business/small-business-grants-for-women",
    name: "nerdwallet-women",
    gender: "WOMEN",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/grants-for-minorities",
    name: "nerdwallet-minorities",
    gender: "MINORITY",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/grants-for-veterans",
    name: "nerdwallet-veterans",
    gender: "VETERAN",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/startup-business-grants",
    name: "nerdwallet-startup",
    gender: "ANY",
  },
];

// ---------------------------------------------------------------------------
// Browser-like headers for Cloudflare WAF
// ---------------------------------------------------------------------------

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// ---------------------------------------------------------------------------
// Page fetching with Google Cache fallback
// ---------------------------------------------------------------------------

async function fetchPage(url: string): Promise<string | null> {
  // Attempt 1: Direct fetch with browser headers
  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 20000,
      maxRedirects: 5,
      decompress: true,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 200 && typeof response.data === "string") {
      return response.data;
    }

    console.log(`[nerdwallet] Direct fetch returned ${response.status} for ${url}`);
  } catch (error) {
    console.log(
      `[nerdwallet] Direct fetch failed:`,
      error instanceof Error ? error.message : error
    );
  }

  // Brief delay before retry
  await new Promise((r) => setTimeout(r, 2000));

  // Attempt 2: Google Cache fallback
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
    const response = await axios.get(cacheUrl, {
      headers: {
        ...BROWSER_HEADERS,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      timeout: 20000,
      maxRedirects: 5,
      decompress: true,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 200 && typeof response.data === "string") {
      console.log(`[nerdwallet] Fetched via Google Cache: ${url}`);
      return response.data;
    }

    console.log(`[nerdwallet] Google Cache returned ${response.status} for ${url}`);
  } catch (error) {
    console.log(
      `[nerdwallet] Google Cache failed:`,
      error instanceof Error ? error.message : error
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

function parseAmount(text: string): { amount?: string; amountMin?: number; amountMax?: number } {
  if (!text) return {};

  const cleaned = text.replace(/,/g, "");

  // Range: "$5,000 to $50,000" or "$5,000 - $50,000"
  const rangeMatch = cleaned.match(/\$\s*([\d.]+)\s*(?:to|-|–|—)\s*\$\s*([\d.]+)/i);
  if (rangeMatch) {
    return {
      amount: text.trim(),
      amountMin: parseFloat(rangeMatch[1]),
      amountMax: parseFloat(rangeMatch[2]),
    };
  }

  // "Up to $X"
  const upToMatch = cleaned.match(/up\s+to\s+\$\s*([\d.]+)/i);
  if (upToMatch) {
    return { amount: text.trim(), amountMax: parseFloat(upToMatch[1]) };
  }

  // Single amount "$X"
  const singleMatch = cleaned.match(/\$\s*([\d.]+)/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    return { amount: text.trim(), amountMin: val, amountMax: val };
  }

  return { amount: text.trim() };
}

// ---------------------------------------------------------------------------
// Deadline parsing
// ---------------------------------------------------------------------------

function parseDeadlineStr(str: string | undefined): Date | undefined {
  if (!str) return undefined;
  const cleaned = str.trim();
  // Skip non-date values
  if (/rolling|ongoing|year-round|open|varies|tbd|n\/a/i.test(cleaned)) return undefined;
  const d = new Date(cleaned);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2024) return d;
  return undefined;
}

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a value following a label like "Amount: $10,000" or "Deadline: March 2026"
 */
function extractLabeledField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${label}[.:\\s]+([^\\n]{3,150})`,
      "im"
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      // Don't return if it starts with another label
      if (!/^(amount|deadline|eligibility|apply|award|who can)/i.test(value)) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Extract a dollar amount from freeform text.
 */
function extractAmountFromText(text: string): string | undefined {
  const match = text.match(/\$[\d,]+(?:\s*(?:to|-|–)\s*\$[\d,]+)?/);
  return match?.[0];
}

// ---------------------------------------------------------------------------
// Heading classification
// ---------------------------------------------------------------------------

const GENERIC_HEADINGS = [
  "table of contents", "bottom line", "frequently asked questions", "faq",
  "how to apply", "how to find", "what is", "what are", "tips for",
  "methodology", "about the author", "compare", "types of", "pros and cons",
  "how we chose", "our methodology", "related articles", "more from nerdwallet",
  "best small-business loans", "what are small-business grants",
  "how do small-business grants work", "where to find", "summary",
  "on this page", "key takeaways", "frequently asked",
];

function isGenericHeading(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.length < 4 ||
    GENERIC_HEADINGS.some((g) => lower.startsWith(g) || lower === g)
  );
}

function cleanGrantTitle(title: string): string {
  // Remove leading numbers like "1. " or "43. "
  return title.replace(/^\d+\.\s*/, "").trim();
}

// ---------------------------------------------------------------------------
// HTML parsing — extract grants from the page
// ---------------------------------------------------------------------------

interface RawGrant {
  title: string;
  description: string;
  amount?: string;
  deadline?: string;
  eligibility?: string;
  applyUrl?: string;
}

function parseGrantsFromHtml(html: string): RawGrant[] {
  const $ = cheerio.load(html);
  const grants: RawGrant[] = [];

  // Remove navigation, sidebar, footer, ads
  $("nav, footer, header, aside, [role='navigation'], [role='banner']").remove();
  $("[class*='sidebar'], [class*='related'], [class*='footer'], [class*='nav']").remove();

  // Strategy 1: Structured cards with labeled fields
  parseStructuredSections($, grants);

  // Strategy 2: Heading-based sections (fallback)
  if (grants.length === 0) {
    parseHeadingSections($, grants);
  }

  return grants;
}

/**
 * Parse sections with H2/H3 grant name headings that have
 * labeled data fields (Amount, Deadline, Eligibility) in the following content.
 */
function parseStructuredSections($: cheerio.Root, grants: RawGrant[]): void {
  const headings = $("h2, h3").toArray();

  for (const heading of headings) {
    const $heading = $(heading);
    const title = cleanGrantTitle($heading.text().trim());

    if (isGenericHeading(title)) continue;
    if (title.length < 5 || title.length > 200) continue;

    // Collect sibling content until the next same-level or higher heading
    const headingTag = ($heading.prop("tagName") || "H2").toLowerCase();
    const sectionElements: cheerio.Element[] = [];
    let $el = $heading.next();
    let count = 0;

    while ($el.length && count < 20) {
      const tag = ($el.prop("tagName") || "").toLowerCase();
      if (tag === headingTag || (tag === "h2" && headingTag === "h3")) break;
      sectionElements.push($el[0]);
      $el = $el.next();
      count++;
    }

    const $section = $(sectionElements);
    const sectionText = $section.text();

    // Only consider this a grant if it has grant-like fields
    if (!hasGrantFields(sectionText)) continue;

    const sectionHtml = sectionElements.map((el) => $.html(el)).join("");

    const grant: RawGrant = {
      title,
      description: cleanHtmlToText(sectionHtml, 1500),
      amount: extractLabeledField(sectionText, ["amount", "award", "grant amount", "prize", "award amount"]),
      deadline: extractLabeledField(sectionText, ["deadline", "due date", "close date", "application deadline", "closes"]),
      eligibility: extractLabeledField(sectionText, ["eligibility", "who can apply", "eligible", "requirements", "qualifications"]),
    };

    // If no amount from label, try extracting from freeform text
    if (!grant.amount) {
      grant.amount = extractAmountFromText(sectionText);
    }

    // Find apply URL — prefer external links with "apply" text
    $section.find("a[href]").each((_, a) => {
      if (grant.applyUrl) return;
      const href = $(a).attr("href") || "";
      const linkText = $(a).text().toLowerCase();
      if (
        href.startsWith("http") &&
        !href.includes("nerdwallet.com") &&
        (linkText.includes("apply") || linkText.includes("learn more") || linkText.includes("visit"))
      ) {
        grant.applyUrl = href;
      }
    });

    // Fallback: any external link in the section
    if (!grant.applyUrl) {
      $section.find("a[href]").each((_, a) => {
        if (grant.applyUrl) return;
        const href = $(a).attr("href") || "";
        if (href.startsWith("http") && !href.includes("nerdwallet.com")) {
          grant.applyUrl = href;
        }
      });
    }

    grants.push(grant);
  }
}

/**
 * Fallback parser: treats each H2/H3 as a potential grant,
 * extracts amounts and links from the content below it.
 */
function parseHeadingSections($: cheerio.Root, grants: RawGrant[]): void {
  const headings = $("h2, h3").toArray();

  for (const heading of headings) {
    const $heading = $(heading);
    const title = cleanGrantTitle($heading.text().trim());

    if (isGenericHeading(title)) continue;
    if (title.length < 5 || title.length > 200) continue;

    // Collect text between this heading and the next
    let description = "";
    let applyUrl: string | undefined;
    let $el = $heading.next();
    let collected = 0;

    while ($el.length && collected < 10) {
      const tag = ($el.prop("tagName") || "").toLowerCase();
      if (tag === "h2" || tag === "h3") break;

      description += $el.text().trim() + "\n";

      // Look for external links
      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        if (href.startsWith("http") && !href.includes("nerdwallet.com") && !applyUrl) {
          applyUrl = href;
        }
      });

      $el = $el.next();
      collected++;
    }

    // Only include if it looks like a grant entry
    const lower = description.toLowerCase();
    const isGrant =
      lower.includes("$") ||
      lower.includes("grant") ||
      lower.includes("award") ||
      lower.includes("funding") ||
      lower.includes("apply");

    if (!isGrant) continue;

    grants.push({
      title,
      description: cleanHtmlToText(description, 1500),
      amount: extractLabeledField(description, ["amount", "award"]) || extractAmountFromText(description),
      deadline: extractLabeledField(description, ["deadline", "due date"]),
      eligibility: extractLabeledField(description, ["eligibility", "who can apply"]),
      applyUrl,
    });
  }
}

function hasGrantFields(text: string): boolean {
  const lower = text.toLowerCase();
  const fields = ["amount", "deadline", "eligibility", "apply", "award", "grant", "$"];
  let found = 0;
  for (const f of fields) {
    if (lower.includes(f)) found++;
  }
  return found >= 2;
}

// ---------------------------------------------------------------------------
// Transform to GrantData
// ---------------------------------------------------------------------------

function toGrantData(raw: RawGrant, page: NerdWalletPage): GrantData | null {
  if (!raw.title || raw.title.length < 3) return null;

  const description = raw.description || raw.title;
  const fullText = `${raw.title} ${description} ${raw.eligibility || ""}`;

  // Skip grants restricted to non-Iowa states
  if (isExcludedByStateRestriction(fullText)) return null;

  const amounts = parseAmount(raw.amount || "");
  const locations = detectLocationScope(fullText);
  const sourceUrl = raw.applyUrl || page.url;

  return {
    title: raw.title,
    description,
    sourceUrl,
    sourceName: page.name,
    ...amounts,
    deadline: parseDeadlineStr(raw.deadline),
    eligibility: raw.eligibility,
    grantType: "PRIVATE",
    status: "OPEN",
    businessStage: "BOTH",
    gender: page.gender,
    locations: locations.length > 0 ? locations : ["Nationwide"],
    industries: [],
    categories: [],
    eligibleExpenses: [],
    rawData: { nerdwalletPage: page.url, originalTitle: raw.title },
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeNerdWallet(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  for (const page of NERDWALLET_PAGES) {
    try {
      console.log(`[nerdwallet] Fetching ${page.name}...`);
      const html = await fetchPage(page.url);

      if (!html) {
        console.log(`[nerdwallet] Could not fetch ${page.name} (blocked or unavailable)`);
        continue;
      }

      const rawGrants = parseGrantsFromHtml(html);
      let added = 0;

      for (const raw of rawGrants) {
        const grant = toGrantData(raw, page);
        if (!grant) continue;

        // Deduplicate by URL and normalized title across all pages
        const titleKey = grant.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seenUrls.has(grant.sourceUrl) || seenTitles.has(titleKey)) continue;
        seenUrls.add(grant.sourceUrl);
        seenTitles.add(titleKey);

        allGrants.push(grant);
        added++;
      }

      console.log(`[nerdwallet] ${page.name}: ${rawGrants.length} parsed → ${added} new grants`);

      // Polite delay between pages
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(
        `[nerdwallet] Error scraping ${page.name}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[nerdwallet] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
