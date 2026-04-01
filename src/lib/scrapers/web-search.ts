import * as cheerio from "cheerio";
import axios from "axios";
import type { GrantData } from "@/lib/types";
import { extractDeadline } from "./utils";

const SEARCH_QUERIES = [
  "Iowa small business grants 2026",
  "Iowa women owned business grants",
  "Iowa startup grants for new businesses",
  "Iowa rural small business grants",
  "Iowa minority business grants",
  "Iowa veteran business grants",
  "Des Moines small business grants",
  "Cedar Rapids business grants Iowa",
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

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SKIP_DOMAINS.some((domain) => lower.includes(domain));
}

async function searchDuckDuckGo(
  query: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    // Dynamic import for duck-duck-scrape (ESM module)
    const dds = await import("duck-duck-scrape");
    const results = await dds.search(query, { safeSearch: dds.SafeSearchType.STRICT });

    return (results.results || [])
      .filter((r) => r.url && r.title && !shouldSkipUrl(r.url))
      .slice(0, 5) // Top 5 per query
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description || "",
      }));
  } catch (error) {
    console.error(
      `[web-search] DuckDuckGo search failed for "${query}":`,
      error instanceof Error ? error.message : error
    );
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
    const iowaKeywords = ["iowa", "des moines", "cedar rapids", "davenport"];

    const hasGrantContent = grantKeywords.some((kw) => lowerText.includes(kw));
    const hasIowaContent = iowaKeywords.some((kw) => lowerText.includes(kw));

    if (!hasGrantContent || !hasIowaContent) {
      return null; // Not relevant
    }

    const deadline = extractDeadline(response.data);
    const description = pageText.slice(0, 800) || searchSnippet;
    const pageTitle =
      $("h1").first().text().trim() || $("title").text().trim() || searchTitle;

    return {
      title: pageTitle,
      description,
      sourceUrl: url,
      sourceName: "web-search",
      grantType: "STATE", // Default; categorizer will refine
      status: deadline && deadline < new Date() ? "CLOSED" : "OPEN",
      businessStage: "BOTH",
      gender: "ANY",
      locations: ["Iowa"],
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
  console.log("[web-search] Starting web search discovery...");

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    const results = await searchDuckDuckGo(query);
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
