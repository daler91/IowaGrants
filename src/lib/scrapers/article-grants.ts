import axios from "axios";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { GrantData } from "@/lib/types";
import type { GenderFocus, GrantType, BusinessStage } from "@prisma/client";
import { cleanHtmlToText, detectLocationScope, isExcludedByStateRestriction, isGenericHomepage } from "./utils";

// ---------------------------------------------------------------------------
// Article-based grant page configuration
// ---------------------------------------------------------------------------

interface ArticleGrantPage {
  url: string;
  /** Unique source name stored in DB */
  sourceName: string;
  /** Domain to exclude from external link extraction (e.g., "nerdwallet.com") */
  siteDomain: string;
  gender: GenderFocus;
  grantType: GrantType;
  businessStage: BusinessStage;
}

/**
 * All blog/article pages that list grants in a structured H2/H3 format.
 * Each page is fetched independently and parsed with the same logic.
 */
const ARTICLE_GRANT_PAGES: ArticleGrantPage[] = [
  // ── NerdWallet ──────────────────────────────────────────────────────────
  {
    url: "https://www.nerdwallet.com/article/small-business/small-business-grants",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/article/small-business/small-business-grants-for-women",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/grants-for-minorities",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/grants-for-veterans",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "VETERAN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/startup-business-grants",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
  },

  // ── Shopify ─────────────────────────────────────────────────────────────
  {
    url: "https://www.shopify.com/blog/small-business-grants",
    sourceName: "shopify",
    siteDomain: "shopify.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.shopify.com/blog/grants-for-black-women",
    sourceName: "shopify",
    siteDomain: "shopify.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },

  // ── US Chamber of Commerce (CO–) ────────────────────────────────────────
  {
    url: "https://www.uschamber.com/co/run/business-financing/small-business-grants-and-programs",
    sourceName: "uschamber",
    siteDomain: "uschamber.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },

  // ── Fundera ─────────────────────────────────────────────────────────────
  {
    url: "https://fundera.com/blog/small-business-grants",
    sourceName: "fundera",
    siteDomain: "fundera.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },

  // ── Homebase ────────────────────────────────────────────────────────────
  {
    url: "https://www.joinhomebase.com/blog/small-business-grants",
    sourceName: "homebase",
    siteDomain: "joinhomebase.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },

  // ── Hiscox ──────────────────────────────────────────────────────────────
  {
    url: "https://www.hiscox.com/blog/small-business-grants-women-entrepreneurs",
    sourceName: "hiscox",
    siteDomain: "hiscox.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },

  // ── Foundr ──────────────────────────────────────────────────────────────
  {
    url: "https://foundr.com/articles/building-a-business/grants-for-small-businesses",
    sourceName: "foundr",
    siteDomain: "foundr.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },

  // ── SoFi ────────────────────────────────────────────────────────────────
  {
    url: "https://www.sofi.com/learn/content/small-business-start-up-grants-loans-programs/",
    sourceName: "sofi",
    siteDomain: "sofi.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
  },
];

// ---------------------------------------------------------------------------
// Browser-like headers for Cloudflare / WAF bypass
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

async function fetchPage(url: string, logPrefix: string): Promise<string | null> {
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

    console.log(`${logPrefix} Direct fetch returned ${response.status} for ${url}`);
  } catch (error) {
    console.log(
      `${logPrefix} Direct fetch failed:`,
      error instanceof Error ? error.message : error
    );
  }

  // Brief delay before cache attempt
  await new Promise((r) => setTimeout(r, 2000));

  // Attempt 2: Google Cache fallback
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
    const response = await axios.get(cacheUrl, {
      headers: BROWSER_HEADERS,
      timeout: 20000,
      maxRedirects: 5,
      decompress: true,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 200 && typeof response.data === "string") {
      console.log(`${logPrefix} Fetched via Google Cache: ${url}`);
      return response.data;
    }

    console.log(`${logPrefix} Google Cache returned ${response.status} for ${url}`);
  } catch (error) {
    console.log(
      `${logPrefix} Google Cache failed:`,
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

  const cleaned = text.replaceAll(",", "");

  // Range: "$5,000 to $50,000" or "$5,000 - $50,000"
  const rangeMatch = /\$\s*([\d.]+)\s*(?:to|-|–|—)\s*\$\s*([\d.]+)/i.exec(cleaned);
  if (rangeMatch) {
    return {
      amount: text.trim(),
      amountMin: Number.parseFloat(rangeMatch[1]),
      amountMax: Number.parseFloat(rangeMatch[2]),
    };
  }

  // "Up to $X"
  const upToMatch = /up\s+to\s+\$\s*([\d.]+)/i.exec(cleaned);
  if (upToMatch) {
    return { amount: text.trim(), amountMax: Number.parseFloat(upToMatch[1]) };
  }

  // Single amount "$X"
  const singleMatch = /\$\s*([\d.]+)/.exec(cleaned);
  if (singleMatch) {
    const val = Number.parseFloat(singleMatch[1]);
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
  if (/rolling|ongoing|year-round|open|varies|tbd|n\/a/i.test(cleaned)) return undefined;
  const d = new Date(cleaned);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2024) return d;
  return undefined;
}

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

function extractLabeledField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(
      String.raw`(?:^|\n)\s*${label}[.:\s]+([^\n]{3,150})`,
      "im"
    );
    const match = pattern.exec(text);
    if (match?.[1]) {
      const value = match[1].trim();
      if (!/^(amount|deadline|eligibility|apply|award|who can)/i.test(value)) {
        return value;
      }
    }
  }
  return undefined;
}

function extractAmountFromText(text: string): string | undefined {
  const match = /\$[\d,]+(?:\s*(?:to|-|–)\s*\$[\d,]+)?/.exec(text);
  return match?.[0];
}

// ---------------------------------------------------------------------------
// Heading classification
// ---------------------------------------------------------------------------

const EDUCATIONAL_PATTERNS = [
  /\bvs\.?\s/,
  /\bversus\b/,
  /\bdiffer(?:s|ences?)?\b.*\bfrom\b/,
  /\bdifference(?:s)?\s+between\b/,
  /\bcompar(?:e[ds]?|ison)\b/,
];

const GENERIC_HEADINGS = [
  "table of contents", "bottom line", "frequently asked questions", "faq",
  "how to apply", "how to find", "what is", "what are", "tips for",
  "methodology", "about the author", "compare", "types of", "pros and cons",
  "how we chose", "our methodology", "related articles", "more from",
  "best small-business loans", "what are small-business grants",
  "how do small-business grants work", "where to find", "summary",
  "on this page", "key takeaways", "frequently asked", "final thoughts",
  "the bottom line", "next steps", "additional resources", "other resources",
  "how to write", "what you need", "before you apply", "wrapping up",
  "conclusion", "in summary", "share this", "about the",
  "you may also like", "related posts", "newsletter", "subscribe",
  // Educational / comparative headings
  "how grants differ", "how grants work", "how do grants work",
  "grants vs", "grant vs", "grants versus", "grant versus",
  "loans vs", "loan vs", "loans versus", "loan versus",
  "difference between", "differences between",
  "understanding grants", "understanding small business",
  "guide to", "a guide to", "your guide to", "complete guide",
  "what you need to know", "everything you need to know",
  "overview of", "an overview",
  "types of grants", "types of small business",
  "how to choose", "how to decide",
  "are grants taxable", "do you have to pay",
];

function isGenericHeading(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.length < 4 ||
    GENERIC_HEADINGS.some((g) => lower.startsWith(g) || lower === g) ||
    EDUCATIONAL_PATTERNS.some((p) => p.test(lower))
  );
}

function cleanGrantTitle(title: string): string {
  return title.replace(/^\d+\.\s*/, "").trim();
}

// ---------------------------------------------------------------------------
// HTML parsing — extract grants from article pages
// ---------------------------------------------------------------------------

interface RawGrant {
  title: string;
  description: string;
  amount?: string;
  deadline?: string;
  eligibility?: string;
  applyUrl?: string;
}

function parseGrantsFromHtml(html: string, siteDomain: string): RawGrant[] {
  const $ = cheerio.load(html);
  const grants: RawGrant[] = [];

  // Remove noise elements
  $("nav, footer, header, aside, [role='navigation'], [role='banner']").remove();
  $("[class*='sidebar'], [class*='related'], [class*='footer'], [class*='nav']").remove();
  $("[class*='newsletter'], [class*='subscribe'], [class*='cookie']").remove();

  // Strategy 1: Structured sections with labeled fields
  parseStructuredSections($, grants, siteDomain);

  // Strategy 2: Heading-based sections (fallback)
  if (grants.length === 0) {
    parseHeadingSections($, grants, siteDomain);
  }

  return grants;
}

function findApplyUrl($: CheerioAPI, $section: cheerio.Cheerio<AnyNode>, siteDomain: string): string | undefined {
  // Prefer external links with action text
  let applyUrl: string | undefined;
  $section.find("a[href]").each((_, a) => {
    if (applyUrl) return;
    const href = $(a).attr("href") || "";
    const linkText = $(a).text().toLowerCase();
    if (
      href.startsWith("http") &&
      !href.includes(siteDomain) &&
      (linkText.includes("apply") || linkText.includes("learn more") || linkText.includes("visit"))
    ) {
      applyUrl = href;
    }
  });

  // Fallback: any external link
  if (!applyUrl) {
    $section.find("a[href]").each((_, a) => {
      if (applyUrl) return;
      const href = $(a).attr("href") || "";
      if (href.startsWith("http") && !href.includes(siteDomain)) {
        applyUrl = href;
      }
    });
  }

  return applyUrl;
}

function collectSectionElements($: CheerioAPI, $heading: cheerio.Cheerio<AnyNode>, headingTag: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectionElements: any[] = [];
  let $el = $heading.next();
  let count = 0;

  while ($el.length && count < 20) {
    const tag = ($el.prop("tagName") || "").toLowerCase();
    if (tag === headingTag || (tag === "h2" && headingTag === "h3")) break;
    sectionElements.push($el[0]);
    $el = $el.next();
    count++;
  }
  return sectionElements;
}

function parseStructuredSections($: CheerioAPI, grants: RawGrant[], siteDomain: string): void {
  const headings = $("h2, h3").toArray();

  for (const heading of headings) {
    const $heading = $(heading);
    const title = cleanGrantTitle($heading.text().trim());

    if (isGenericHeading(title)) continue;
    if (title.length < 5 || title.length > 200) continue;

    const headingTag = ($heading.prop("tagName") || "H2").toLowerCase();
    const sectionElements = collectSectionElements($, $heading, headingTag);

    const $section = $(sectionElements);
    const sectionText = $section.text();

    if (!hasGrantFields(sectionText)) continue;

    const sectionHtml = sectionElements.map((el: AnyNode) => $.html(el)).join("");

    const grant: RawGrant = {
      title,
      description: cleanHtmlToText(sectionHtml, 1500),
      amount: extractLabeledField(sectionText, ["amount", "award", "grant amount", "prize", "award amount"]),
      deadline: extractLabeledField(sectionText, ["deadline", "due date", "close date", "application deadline", "closes"]),
      eligibility: extractLabeledField(sectionText, ["eligibility", "who can apply", "eligible", "requirements", "qualifications"]),
    };

    if (!grant.amount) {
      grant.amount = extractAmountFromText(sectionText);
    }

    grant.applyUrl = findApplyUrl($, $section, siteDomain);

    grants.push(grant);
  }
}

function parseHeadingSections($: CheerioAPI, grants: RawGrant[], siteDomain: string): void {
  const headings = $("h2, h3").toArray();

  for (const heading of headings) {
    const $heading = $(heading);
    const title = cleanGrantTitle($heading.text().trim());

    if (isGenericHeading(title)) continue;
    if (title.length < 5 || title.length > 200) continue;

    let description = "";
    let applyUrl: string | undefined;
    let $el = $heading.next();
    let collected = 0;

    while ($el.length && collected < 10) {
      const tag = ($el.prop("tagName") || "").toLowerCase();
      if (tag === "h2" || tag === "h3") break;

      description += $el.text().trim() + "\n";

      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        if (href.startsWith("http") && !href.includes(siteDomain) && !applyUrl) {
          applyUrl = href;
        }
      });

      $el = $el.next();
      collected++;
    }

    const lower = description.toLowerCase();
    const grantSignals = ["$", "grant", "award", "funding", "apply"];
    const positiveCount = grantSignals.filter((s) => lower.includes(s)).length;
    const isEducational = EDUCATIONAL_PATTERNS.some((p) => p.test(lower));
    const isGrant = positiveCount >= 2 && !isEducational;

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

  // Penalize educational/comparative content
  if (EDUCATIONAL_PATTERNS.some((p) => p.test(lower))) {
    found -= 1;
  }

  return found >= 2;
}

// ---------------------------------------------------------------------------
// Transform to GrantData
// ---------------------------------------------------------------------------

function toGrantData(raw: RawGrant, page: ArticleGrantPage): GrantData | null {
  if (!raw.title || raw.title.length < 3) return null;

  const description = raw.description || raw.title;
  const fullText = `${raw.title} ${description} ${raw.eligibility || ""}`;

  if (isExcludedByStateRestriction(fullText)) return null;

  const amounts = parseAmount(raw.amount || "");
  const locations = detectLocationScope(fullText);
  // Use the apply URL if it's a real grant page, not a generic homepage
  const sourceUrl = (raw.applyUrl && !isGenericHomepage(raw.applyUrl))
    ? raw.applyUrl
    : page.url;

  return {
    title: raw.title,
    description,
    sourceUrl,
    sourceName: page.sourceName,
    ...amounts,
    deadline: parseDeadlineStr(raw.deadline),
    eligibility: raw.eligibility,
    grantType: page.grantType,
    status: "OPEN",
    businessStage: page.businessStage,
    gender: page.gender,
    locations: locations.length > 0 ? locations : ["Nationwide"],
    industries: [],
    categories: [],
    eligibleExpenses: [],
    rawData: { articlePage: page.url, originalTitle: raw.title },
  };
}

// ---------------------------------------------------------------------------
// Dedup + collection helper
// ---------------------------------------------------------------------------

function collectNewGrants(
  rawGrants: RawGrant[],
  page: ArticleGrantPage,
  seenUrls: Set<string>,
  seenTitles: Set<string>,
): GrantData[] {
  const newGrants: GrantData[] = [];

  for (const raw of rawGrants) {
    const grant = toGrantData(raw, page);
    if (!grant) continue;

    // Deduplicate by URL and normalized title across ALL pages/sites
    const titleKey = grant.title.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    if (seenUrls.has(grant.sourceUrl) || seenTitles.has(titleKey)) continue;
    seenUrls.add(grant.sourceUrl);
    seenTitles.add(titleKey);

    newGrants.push(grant);
  }

  return newGrants;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeArticleGrants(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  let lastDomain = "";

  for (const page of ARTICLE_GRANT_PAGES) {
    const currentDomain = page.siteDomain;

    try {
      // Polite delay: longer between same-domain requests
      if (currentDomain === lastDomain) {
        await new Promise((r) => setTimeout(r, 2000));
      } else if (lastDomain) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      lastDomain = currentDomain;

      const logPrefix = `[article-grants:${page.sourceName}]`;
      console.log(`${logPrefix} Fetching ${page.url}...`);
      const html = await fetchPage(page.url, logPrefix);

      if (!html) {
        console.log(`${logPrefix} Could not fetch (blocked or unavailable)`);
        continue;
      }

      const rawGrants = parseGrantsFromHtml(html, page.siteDomain);
      const newGrants = collectNewGrants(rawGrants, page, seenUrls, seenTitles);
      allGrants.push(...newGrants);

      console.log(`${logPrefix} ${rawGrants.length} parsed → ${newGrants.length} new grants`);
    } catch (error) {
      console.error(
        `[article-grants:${page.sourceName}] Error:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[article-grants] Total unique grants from ${ARTICLE_GRANT_PAGES.length} pages: ${allGrants.length}`);
  return allGrants;
}
