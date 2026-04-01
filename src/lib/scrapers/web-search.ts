import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { extractDeadline, isExcludedByStateRestriction, detectLocationScope } from "./utils";

const SEARCH_QUERIES = [
  "Iowa small business grants 2026",
  "Iowa women veteran minority business grants",
  "Iowa startup rural small business grants",
  "Des Moines Cedar Rapids small business grants",
  "nationwide small business grants 2026",
  "small business grants for women entrepreneurs",
];

// URLs to skip (aggregators we already scrape, or non-grant sites)
const SKIP_DOMAINS = [
  "iowaeda.com",
  "opportunityiowa.gov",
  "grants.gov",
  "sam.gov",
  "iowagrants.gov",
  "grantwatch.com", // paywall
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
  return SKIP_DOMAINS.some((domain) => lower.includes(domain));
}

interface BraveSearchResult {
  title: string;
  url: string;
  description?: string;
}

interface BraveWebResults {
  web?: { results?: BraveSearchResult[] };
}

/**
 * Search using Brave Search API (free tier: 2000 queries/month).
 * Falls back to empty results if the API key is not set.
 */
async function searchBrave(
  query: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await axios.get<BraveWebResults>(
      "https://api.search.brave.com/res/v1/web/search",
      {
        params: {
          q: query,
          count: 10,
          safesearch: "strict",
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        timeout: 15000,
      }
    );

    const results = response.data?.web?.results || [];
    return results
      .filter((r) => r.url && r.title && !shouldSkipUrl(r.url))
      .slice(0, 8)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description || "",
      }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[web-search] Brave search failed for "${query}": ${msg}`);
    return [];
  }
}

async function scrapeGrantPage(
  url: string,
  searchTitle: string,
  searchSnippet: string
): Promise<GrantData | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 10000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(response.data);
    $("nav, footer, script, style, header").remove();

    const pageText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replace(/\s+/g, " ")
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
      return null; // Not grant-related
    }

    // Exclude grants restricted to a specific non-Iowa state
    if (isExcludedByStateRestriction(pageText)) {
      return null;
    }

    const deadline = extractDeadline(response.data);
    const description = pageText.slice(0, 800) || searchSnippet;
    const pageTitle =
      $("h1").first().text().trim() || $("title").text().trim() || searchTitle;

    const locations = detectLocationScope(pageText);
    const isIowaSpecific = locations.includes("Iowa") && !locations.includes("Nationwide");

    return {
      title: pageTitle,
      description,
      sourceUrl: url,
      sourceName: "web-search",
      grantType: isIowaSpecific ? "STATE" : "PRIVATE", // categorizer will refine
      status: deadline && deadline < new Date() ? "CLOSED" : "OPEN",
      businessStage: "BOTH",
      gender: "ANY",
      locations,
      industries: [],
      deadline,
      categories: [],
      eligibleExpenses: [],
    };
  } catch {
    return null;
  }
}

export async function searchWebForGrants(): Promise<GrantData[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    console.log("[web-search] BRAVE_SEARCH_API_KEY not set — skipping web search");
    return [];
  }

  console.log("[web-search] Starting web search discovery...");

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    // Small delay between queries to be polite (Brave free tier allows 1 req/sec)
    if (i > 0) {
      await delay(1500);
    }

    const query = SEARCH_QUERIES[i];
    const results = await searchBrave(query);
    console.log(
      `[web-search] "${query}" → ${results.length} results to check`
    );

    for (const result of results) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      const grant = await scrapeGrantPage(
        result.url,
        result.title,
        result.snippet
      );
      if (grant) {
        allGrants.push(grant);
      }
    }
  }

  console.log(
    `[web-search] Found ${allGrants.length} grants from web search`
  );
  return allGrants;
}
