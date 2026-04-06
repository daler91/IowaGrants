import axios from "axios";
import type { GrantData } from "@/lib/types";
import {
  detectLocationScope,
  isExcludedByStateRestriction,
  isGenericHomepage,
  checkUrlHealth,
} from "./utils";
import { log, logError } from "@/lib/errors";
import { ARTICLE_GRANT_PAGES, type ArticleGrantPage } from "./article-grant-sources";
import {
  parseGrantsFromHtml,
  parseAmount,
  parseDeadlineStr,
  type RawGrant,
} from "./article-grant-parser";

// Re-export for backward compatibility (used in tests)
export { extractAmountFromText } from "./article-grant-parser";

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

    log("article-grants", `Direct fetch returned ${response.status}`, { url });
  } catch (error) {
    log("article-grants", "Direct fetch failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
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
      log("article-grants", "Fetched via Google Cache", { url });
      return response.data;
    }

    log("article-grants", `Google Cache returned ${response.status}`, { url });
  } catch (error) {
    log("article-grants", "Google Cache failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
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
  const sourceUrl = raw.applyUrl && !isGenericHomepage(raw.applyUrl) ? raw.applyUrl : page.url;

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
    rawData: {
      articlePage: page.url,
      originalTitle: raw.title,
      candidateUrls: raw.candidateUrls || [],
    },
  };
}

// ---------------------------------------------------------------------------
// Dedup + URL health check
// ---------------------------------------------------------------------------

async function collectNewGrants(
  rawGrants: RawGrant[],
  page: ArticleGrantPage,
  seenUrls: Set<string>,
  seenTitles: Set<string>,
): Promise<GrantData[]> {
  const newGrants: GrantData[] = [];

  for (const raw of rawGrants) {
    const grant = toGrantData(raw, page);
    if (!grant) continue;

    const titleKey = grant.title.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    if (seenUrls.has(grant.sourceUrl) || seenTitles.has(titleKey)) continue;

    if (grant.sourceUrl !== page.url) {
      const isHealthy = await checkUrlHealth(grant.sourceUrl);
      if (!isHealthy) {
        const candidates = raw.candidateUrls || [];
        let foundHealthy = false;
        for (const candidate of candidates) {
          if (candidate === grant.sourceUrl || isGenericHomepage(candidate)) continue;
          const candidateHealthy = await checkUrlHealth(candidate);
          if (candidateHealthy) {
            grant.sourceUrl = candidate;
            foundHealthy = true;
            break;
          }
        }
        if (!foundHealthy) {
          grant.sourceUrl = page.url;
        }
      }
    }

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

      log("article-grants", `Fetching ${page.url}...`, { sourceName: page.sourceName });
      const html = await fetchPage(page.url);

      if (!html) {
        log("article-grants", "Could not fetch (blocked or unavailable)", {
          sourceName: page.sourceName,
          url: page.url,
        });
        continue;
      }

      const rawGrants = parseGrantsFromHtml(html, page.siteDomain);
      const newGrants = await collectNewGrants(rawGrants, page, seenUrls, seenTitles);
      allGrants.push(...newGrants);

      log("article-grants", `${rawGrants.length} parsed → ${newGrants.length} new grants`, {
        sourceName: page.sourceName,
      });
    } catch (error) {
      logError("article-grants", `Error scraping ${page.sourceName}`, error);
    }
  }

  log("article-grants", "Total unique grants", {
    pages: ARTICLE_GRANT_PAGES.length,
    grants: allGrants.length,
  });
  return allGrants;
}
