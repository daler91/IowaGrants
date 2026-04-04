import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";
import { BROWSER_USER_AGENT } from "./config";
import { extractDeadline, isExcludedByStateRestriction, detectLocationScope, isGenericHomepage, cleanHtmlToText } from "./utils";

const currentYear = new Date().getFullYear();
const SEARCH_QUERIES = [
  `Iowa small business grants ${currentYear}`,
  "Iowa women veteran minority business grants",
  "Iowa startup rural small business grants",
  "Des Moines Cedar Rapids small business grants",
  `nationwide small business grants ${currentYear}`,
  "small business grants for women entrepreneurs",
  `small business grants for veterans ${currentYear}`,
  `small business grants for minorities ${currentYear}`,
  `Black owned small business grants ${currentYear}`,
  `LGBTQ small business grants ${currentYear}`,
  `rural small business grants Iowa USDA ${currentYear}`,
  `technology small business grants SBIR STTR ${currentYear}`,
];

// URLs to skip (aggregators we already scrape, or non-grant sites)
const SKIP_DOMAINS = [
  "iowaeda.com",
  "opportunityiowa.gov",
  "grants.gov",
  "sam.gov",
  "iowagrants.gov",
  "grantwatch.com", // paywall
  // Domains already handled by article-grants scraper
  "nerdwallet.com",
  "shopify.com",
  "uschamber.com",
  "fundera.com",
  "joinhomebase.com",
  "hiscox.com",
  "foundr.com",
  "sofi.com",
  "bankrate.com",
  "score.org",
  "nav.com",
  "inc.com",
  "businessnewsdaily.com",
  "intuit.com",
  "lendingtree.com",
  "fitsmallbusiness.com",
  "lendio.com",
  "credibly.com",
  "facebook.com",
  "twitter.com",
  "youtube.com",
  "linkedin.com",
  "wikipedia.org",
  "reddit.com",
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (SKIP_DOMAINS.some((domain) => lower.includes(domain))) return true;
  if (isGenericHomepage(url)) return true;
  return false;
}

/**
 * Detect if a page is a list/aggregator of multiple grants rather than a single grant.
 * Returns true for pages like "100+ Small Business Grants" that should be handled
 * by article-grants.ts instead.
 */
function isListPage($: cheerio.CheerioAPI, pageTitle: string): boolean {
  const lowerTitle = pageTitle.toLowerCase();

  // Title signals: "100+ grants", "best grants", "top grants", etc.
  const listTitlePatterns = [
    /\d+\+?\s*(best|top)?\s*(small\s*business\s*)?(grants|funding|loans)/i,
    /best\s+(small\s*business\s*)?(grants|funding)/i,
    /top\s+\d*\s*(small\s*business\s*)?(grants|funding)/i,
    /list of\s+(small\s*business\s*)?(grants|funding)/i,
  ];
  if (listTitlePatterns.some((p) => p.test(lowerTitle))) return true;

  // Count grant-themed H2/H3 headings
  const grantKeywords = ["grant", "fund", "program", "award", "foundation", "$"];
  const genericPrefixes = [
    "table of contents", "faq", "frequently asked", "how to apply",
    "how to find", "what is", "what are", "tips for", "methodology",
    "about the author", "conclusion", "summary", "bottom line",
    "key takeaways", "related", "next steps", "subscribe",
  ];

  let grantHeadingCount = 0;
  let totalNonGenericHeadings = 0;

  $("h2, h3").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (text.length < 4) return;
    if (genericPrefixes.some((g) => text.startsWith(g))) return;

    totalNonGenericHeadings++;
    if (grantKeywords.some((kw) => text.includes(kw))) {
      grantHeadingCount++;
    }
  });

  if (grantHeadingCount >= 5) return true;
  if (totalNonGenericHeadings >= 10) return true;

  return false;
}

// ---------------------------------------------------------------------------
// List page link extraction — harvest grant URLs from aggregator pages
// ---------------------------------------------------------------------------

function extractGrantLinksFromListPage(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): string[] {
  let pageDomain: string;
  try {
    pageDomain = new URL(pageUrl).hostname.replace("www.", "");
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const links: string[] = [];

  function addLink(href: string): void {
    try {
      const linkDomain = new URL(href).hostname.replace("www.", "");
      if (linkDomain === pageDomain) return;
      if (shouldSkipUrl(href)) return;
      if (isGenericHomepage(href)) return;
      const canonical = href.split("?")[0].split("#")[0];
      if (!seen.has(canonical)) {
        seen.add(canonical);
        links.push(href);
      }
    } catch { /* invalid URL */ }
  }

  // Extract external links from H2/H3 headings
  $("h2 a[href], h3 a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("http")) addLink(href);
  });

  // Extract action-oriented links following headings
  $("h2, h3").each((_, heading) => {
    let $el = $(heading).next();
    let count = 0;
    while ($el.length && count < 5) {
      const tag = ($el.prop("tagName") || "").toLowerCase();
      if (tag === "h2" || tag === "h3") break;
      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href");
        if (!href || !href.startsWith("http")) return;
        const linkText = $(a).text().toLowerCase();
        if (
          !linkText.includes("apply") &&
          !linkText.includes("learn more") &&
          !linkText.includes("visit") &&
          !linkText.includes("official") &&
          !linkText.includes("website")
        ) return;
        addLink(href);
      });
      $el = $el.next();
      count++;
    }
  });

  return links;
}

type ScrapeResult =
  | { type: "grant"; grant: GrantData }
  | { type: "list"; links: string[] }
  | null;

type SearchResult = { title: string; url: string; snippet: string };

// ---------------------------------------------------------------------------
// Brave Search API (free tier: 2,000 queries/month)
// ---------------------------------------------------------------------------

interface BraveWebResults {
  web?: { results?: Array<{ title: string; url: string; description?: string }> };
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const apiKey = env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await axios.get<BraveWebResults>(
      "https://api.search.brave.com/res/v1/web/search",
      {
        params: { q: query, count: 10, safesearch: "strict" },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        timeout: 15000,
      }
    );

    return (response.data?.web?.results || [])
      .filter((r) => r.url && r.title && !shouldSkipUrl(r.url))
      .slice(0, 8)
      .map((r) => ({ title: r.title, url: r.url, snippet: r.description || "" }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[web-search] Brave search failed for "${query}": ${msg}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// SerpAPI — Google results (free tier: 100 searches/month)
// ---------------------------------------------------------------------------

interface SerpApiResult {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiResult[];
}

async function searchSerpApi(query: string): Promise<SearchResult[]> {
  const apiKey = env.SERPAPI_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await axios.get<SerpApiResponse>(
      "https://serpapi.com/search.json",
      {
        params: {
          q: query,
          engine: "google",
          num: 10,
          api_key: apiKey,
        },
        timeout: 15000,
      }
    );

    return (response.data?.organic_results || [])
      .filter((r) => r.link && r.title && !shouldSkipUrl(r.link))
      .slice(0, 8)
      .map((r) => ({ title: r.title!, url: r.link!, snippet: r.snippet || "" }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[web-search] SerpAPI search failed for "${query}": ${msg}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined search: Brave primary, SerpAPI for extra coverage
// ---------------------------------------------------------------------------

/**
 * Runs a query through available search providers.
 * - Brave is tried first (larger free quota).
 * - SerpAPI is used as a fallback when Brave returns no results,
 *   or for a subset of queries to get different result diversity.
 */
async function searchWeb(
  query: string,
  useSerpApiFallback: boolean
): Promise<SearchResult[]> {
  const braveResults = await searchBrave(query);
  if (braveResults.length > 0) return braveResults;

  // Brave returned nothing — try SerpAPI as fallback
  if (useSerpApiFallback) {
    return searchSerpApi(query);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Page scraper
// ---------------------------------------------------------------------------

async function scrapeGrantPage(
  url: string,
  searchTitle: string,
  searchSnippet: string
): Promise<ScrapeResult> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
      },
      timeout: 10000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);

    // Remove noise elements (expanded to match article-grants cleanup)
    $("nav, footer, script, style, header, iframe, noscript, svg, aside").remove();
    $("[role='navigation'], [role='banner'], [class*='sidebar'], [class*='cookie']").remove();

    // Extract title early for list page detection
    const pageTitle =
      $("h1").first().text().trim() || $("title").text().trim() || searchTitle;

    // Extract grant links from list/aggregator pages instead of skipping them
    if (isListPage($, pageTitle)) {
      const extractedLinks = extractGrantLinksFromListPage($, url);
      console.log(`[web-search] List page: ${url} — extracted ${extractedLinks.length} grant links`);
      if (extractedLinks.length > 0) {
        return { type: "list", links: extractedLinks };
      }
      return null;
    }

    const pageText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replaceAll(/\s+/g, " ")
      .trim();

    // Check if this page is actually about a grant/funding program
    const lowerText = pageText.toLowerCase();
    const grantKeywords = [
      "grant",
      "funding",
      "award",
      "application",
      "eligible",
      "small business",
      "apply",
    ];

    const hasGrantContent = grantKeywords.some((kw) => lowerText.includes(kw));
    if (!hasGrantContent) {
      return null;
    }

    // Exclude grants restricted to a specific non-Iowa state
    if (isExcludedByStateRestriction(pageText)) {
      return null;
    }

    const deadline = extractDeadline(response.data);
    const rawHtml = $("main, article, .content, .entry-content, body").first().html() || "";
    const description = cleanHtmlToText(rawHtml, 800) || searchSnippet;

    const locations = detectLocationScope(pageText);
    const isIowaSpecific = locations.includes("Iowa") && !locations.includes("Nationwide");

    return {
      type: "grant",
      grant: {
        title: pageTitle,
        description,
        sourceUrl: url,
        sourceName: "web-search",
        grantType: isIowaSpecific ? "STATE" : "PRIVATE",
        status: deadline && deadline < new Date() ? "CLOSED" : "OPEN",
        businessStage: "BOTH",
        gender: "ANY",
        locations,
        industries: [],
        deadline,
        categories: [],
        eligibleExpenses: [],
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function processSearchResults(
  results: SearchResult[],
  seenUrls: Set<string>,
  depth: number = 0,
): Promise<GrantData[]> {
  const grants: GrantData[] = [];

  for (const result of results) {
    if (seenUrls.has(result.url)) continue;
    seenUrls.add(result.url);

    // Polite delay when scraping links extracted from list pages
    if (depth > 0) await delay(1500);

    const scrapeResult = await scrapeGrantPage(result.url, result.title, result.snippet);
    if (!scrapeResult) continue;

    if (scrapeResult.type === "grant") {
      grants.push(scrapeResult.grant);
    } else if (scrapeResult.type === "list" && depth < 1) {
      // Follow links extracted from list pages (one level deep, max 15 links)
      const listResults: SearchResult[] = scrapeResult.links.slice(0, 15).map((link) => ({
        title: "",
        url: link,
        snippet: "",
      }));
      await delay(1000);
      const listGrants = await processSearchResults(listResults, seenUrls, depth + 1);
      grants.push(...listGrants);
    }
  }
  return grants;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function searchWebForGrants(): Promise<GrantData[]> {
  const hasBrave = !!env.BRAVE_SEARCH_API_KEY;
  const hasSerpApi = !!env.SERPAPI_API_KEY;

  if (!hasBrave && !hasSerpApi) {
    console.log("[web-search] No search API keys set (BRAVE_SEARCH_API_KEY, SERPAPI_API_KEY) — skipping web search");
    return [];
  }

  const providers: string[] = [];
  if (hasBrave) providers.push("Brave");
  if (hasSerpApi) providers.push("SerpAPI");
  console.log(`[web-search] Starting web search discovery (providers: ${providers.join(", ")})...`);

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    // Small delay between queries (Brave: 1 req/sec, SerpAPI: no strict limit)
    if (i > 0) {
      await delay(1500);
    }

    const query = SEARCH_QUERIES[i];

    // Use SerpAPI as fallback for all queries if available
    const results = await searchWeb(query, hasSerpApi);

    let provider: string;
    if (results.length === 0) {
      provider = "none";
    } else {
      provider = hasBrave ? "brave" : "serpapi";
    }
    console.log(
      `[web-search] "${query}" → ${results.length} results [${provider}]`
    );

    const grants = await processSearchResults(results, seenUrls);
    allGrants.push(...grants);
  }

  console.log(
    `[web-search] Found ${allGrants.length} grants from web search`
  );
  return allGrants;
}
