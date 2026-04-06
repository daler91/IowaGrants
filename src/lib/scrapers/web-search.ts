import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";
import { BROWSER_USER_AGENT, QUERIES_PER_RUN } from "./config";
import {
  extractDeadline,
  isExcludedByStateRestriction,
  detectLocationScope,
  isGenericHomepage,
  cleanHtmlToText,
} from "./utils";
import { log, logError } from "@/lib/errors";
import { selectQueriesForRun } from "./search-queries";

// URLs to skip (aggregators we already scrape, or non-grant sites)
const SKIP_DOMAINS = [
  "iowaeda.com",
  "opportunityiowa.gov",
  "grants.gov",
  "sam.gov",
  "iowagrants.gov",
  "sba.gov", // handled by sba-gov scraper
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
    "table of contents",
    "faq",
    "frequently asked",
    "how to apply",
    "how to find",
    "what is",
    "what are",
    "tips for",
    "methodology",
    "about the author",
    "conclusion",
    "summary",
    "bottom line",
    "key takeaways",
    "related",
    "next steps",
    "subscribe",
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

function extractGrantLinksFromListPage($: cheerio.CheerioAPI, pageUrl: string): string[] {
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
    } catch {
      /* invalid URL */
    }
  }

  // Extract external links from H2/H3 headings
  $("h2 a[href], h3 a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href?.startsWith("http")) addLink(href);
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
        if (!href?.startsWith("http")) return;
        const linkText = $(a).text().toLowerCase();
        if (
          !linkText.includes("apply") &&
          !linkText.includes("learn more") &&
          !linkText.includes("visit") &&
          !linkText.includes("official") &&
          !linkText.includes("website")
        )
          return;
        addLink(href);
      });
      $el = $el.next();
      count++;
    }
  });

  return links;
}

type ScrapeResult = { type: "grant"; grant: GrantData } | { type: "list"; links: string[] } | null;

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
      },
    );

    return (response.data?.web?.results || [])
      .filter((r) => r.url && r.title && !shouldSkipUrl(r.url))
      .slice(0, 8)
      .map((r) => ({ title: r.title, url: r.url, snippet: r.description || "" }));
  } catch (error) {
    logError("web-search", `Brave search failed for "${query}"`, error);
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
    const response = await axios.get<SerpApiResponse>("https://serpapi.com/search.json", {
      params: {
        q: query,
        engine: "google",
        num: 10,
        api_key: apiKey,
      },
      timeout: 15000,
    });

    return (response.data?.organic_results || [])
      .filter((r) => r.link && r.title && !shouldSkipUrl(r.link))
      .slice(0, 8)
      .map((r) => ({ title: r.title!, url: r.link!, snippet: r.snippet || "" }));
  } catch (error) {
    logError("web-search", `SerpAPI search failed for "${query}"`, error);
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
async function searchWeb(query: string, useSerpApiFallback: boolean): Promise<SearchResult[]> {
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
  searchSnippet: string,
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
    const pageTitle = $("h1").first().text().trim() || $("title").text().trim() || searchTitle;

    // Extract grant links from list/aggregator pages instead of skipping them
    if (isListPage($, pageTitle)) {
      const extractedLinks = extractGrantLinksFromListPage($, url);
      log("web-search", "List page — extracted grant links", { url, count: extractedLinks.length });
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
// Google Custom Search API (free tier: 100 queries/day)
// ---------------------------------------------------------------------------

interface GoogleCSEResponse {
  items?: Array<{ title: string; link: string; snippet?: string }>;
}

async function searchGoogleCSE(query: string): Promise<SearchResult[]> {
  const apiKey = env.GOOGLE_CSE_API_KEY;
  const cx = env.GOOGLE_CSE_CX;
  if (!apiKey || !cx) return [];

  try {
    const response = await axios.get<GoogleCSEResponse>(
      "https://www.googleapis.com/customsearch/v1",
      {
        params: { key: apiKey, cx, q: query, num: 10 },
        timeout: 15000,
      },
    );

    return (response.data?.items || [])
      .filter((r) => r.link && r.title && !shouldSkipUrl(r.link))
      .slice(0, 8)
      .map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || "" }));
  } catch (error) {
    logError("web-search", `Google CSE search failed for "${query}"`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deep site crawling — follow productive domains for more grants
// ---------------------------------------------------------------------------

/**
 * When a domain yields 2+ grants, crawl sibling/parent pages for more.
 * Takes a sample URL, navigates to its parent path, and extracts grant links.
 */
async function crawlProductiveDomain(
  domain: string,
  knownUrls: string[],
  seenUrls: Set<string>,
): Promise<GrantData[]> {
  // Find the parent path from a known grant URL
  const sampleUrl = knownUrls[0];
  let parentUrl: string;
  try {
    const parsed = new URL(sampleUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length > 1) {
      // Go up one level: /grants/specific-grant → /grants/
      parentUrl = `${parsed.origin}/${pathParts.slice(0, -1).join("/")}/`;
    } else {
      // Already at root level, try the homepage grants section
      parentUrl = `${parsed.origin}/grants/`;
    }
  } catch {
    return [];
  }

  if (seenUrls.has(parentUrl)) return [];
  seenUrls.add(parentUrl);

  try {
    const response = await axios.get(parentUrl, {
      headers: { "User-Agent": BROWSER_USER_AGENT },
      timeout: 10000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);
    $("nav, footer, script, style, header").remove();

    const grantLinks: string[] = [];
    const knownSet = new Set(knownUrls);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      let fullUrl: string;
      try {
        fullUrl = new URL(href, parentUrl).href;
      } catch {
        return;
      }

      // Only follow links on the same domain
      try {
        if (new URL(fullUrl).hostname.replace("www.", "") !== domain) return;
      } catch {
        return;
      }

      if (knownSet.has(fullUrl) || seenUrls.has(fullUrl)) return;
      if (isGenericHomepage(fullUrl)) return;

      // Link text or URL should suggest a grant
      const text = $(el).text().toLowerCase();
      const urlLower = fullUrl.toLowerCase();
      const grantSignals = ["grant", "fund", "award", "program", "assistance", "incentive"];
      if (grantSignals.some((s) => text.includes(s) || urlLower.includes(s))) {
        grantLinks.push(fullUrl);
      }
    });

    // Process up to 10 discovered links
    const results: SearchResult[] = grantLinks.slice(0, 10).map((url) => ({
      title: "",
      url,
      snippet: "",
    }));

    return processSearchResults(results, seenUrls, 1);
  } catch {
    return [];
  }
}

function resolveSearchProvider(results: SearchResult[], hasBrave: boolean): string {
  if (results.length === 0) return "none";
  return hasBrave ? "brave" : "serpapi";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function executeQuery(
  query: string,
  index: number,
  totalQueries: number,
  hasGoogleCSE: boolean,
  hasBrave: boolean,
  hasSerpApi: boolean,
): Promise<{ results: SearchResult[]; provider: string }> {
  const useGoogleCSE = hasGoogleCSE && index >= totalQueries * 0.7;

  if (useGoogleCSE) {
    const cseResults = await searchGoogleCSE(query);
    if (cseResults.length > 0) return { results: cseResults, provider: "google-cse" };
    // Fall back to Brave/SerpAPI
    const fallbackResults = await searchWeb(query, hasSerpApi);
    return { results: fallbackResults, provider: resolveSearchProvider(fallbackResults, hasBrave) };
  }

  const results = await searchWeb(query, hasSerpApi);
  return { results, provider: resolveSearchProvider(results, hasBrave) };
}

async function deepCrawlProductiveDomains(
  allGrants: GrantData[],
  seenUrls: Set<string>,
): Promise<GrantData[]> {
  const domainGrants = new Map<string, string[]>();
  for (const grant of allGrants) {
    try {
      const domain = new URL(grant.sourceUrl).hostname.replace("www.", "");
      if (!domainGrants.has(domain)) domainGrants.set(domain, []);
      domainGrants.get(domain)!.push(grant.sourceUrl);
    } catch {
      /* skip invalid URLs */
    }
  }

  const additional: GrantData[] = [];
  let crawledDomains = 0;

  for (const [domain, urls] of domainGrants.entries()) {
    if (urls.length < 2 || crawledDomains >= 3) continue;
    if (shouldSkipUrl(`https://${domain}/`)) continue;

    crawledDomains++;
    const grants = await crawlProductiveDomain(domain, urls, seenUrls);
    if (grants.length > 0) {
      log("web-search", `Deep crawl of ${domain} found additional grants`, { count: grants.length });
      additional.push(...grants);
    }
  }

  return additional;
}

export async function searchWebForGrants(): Promise<GrantData[]> {
  const hasBrave = !!env.BRAVE_SEARCH_API_KEY;
  const hasSerpApi = !!env.SERPAPI_API_KEY;
  const hasGoogleCSE = !!env.GOOGLE_CSE_API_KEY && !!env.GOOGLE_CSE_CX;

  if (!hasBrave && !hasSerpApi && !hasGoogleCSE) {
    log(
      "web-search",
      "No search API keys set (BRAVE_SEARCH_API_KEY, SERPAPI_API_KEY, GOOGLE_CSE_API_KEY) — skipping web search",
    );
    return [];
  }

  const providers: string[] = [];
  if (hasBrave) providers.push("Brave");
  if (hasGoogleCSE) providers.push("GoogleCSE");
  if (hasSerpApi) providers.push("SerpAPI");

  const selectedQueries = selectQueriesForRun(QUERIES_PER_RUN);
  log("web-search", "Starting web search discovery", {
    providers: providers.join(", "),
    queryCount: selectedQueries.length,
    totalPool: selectedQueries.length,
  });

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < selectedQueries.length; i++) {
    if (i > 0) await delay(1500);

    const { query } = selectedQueries[i];
    const { results, provider } = await executeQuery(
      query, i, selectedQueries.length, hasGoogleCSE, hasBrave, hasSerpApi,
    );

    log("web-search", `"${query}" → ${results.length} results`, { provider });
    const grants = await processSearchResults(results, seenUrls);
    allGrants.push(...grants);
  }

  const additional = await deepCrawlProductiveDomains(allGrants, seenUrls);
  allGrants.push(...additional);

  log("web-search", "Found grants from web search", { count: allGrants.length });
  return allGrants;
}
