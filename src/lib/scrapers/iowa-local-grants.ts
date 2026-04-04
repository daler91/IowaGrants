import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GrantType } from "@prisma/client";
import {
  fetchPageDetails,
  isGenericHomepage,
  isActualGrantPage,
  parseGrantAmount,
} from "./utils";

// ---------------------------------------------------------------------------
// Iowa local & regional economic development program sources
// ---------------------------------------------------------------------------

interface LocalSource {
  /** Display name for this source */
  name: string;
  /** Source name stored in DB */
  sourceName: string;
  /** URLs to scrape for program listings */
  urls: string[];
  /** Grant type classification */
  grantType: GrantType;
  /** Keywords to match on links/program names (at least one must match) */
  keywords: string[];
}

const LOCAL_SOURCES: LocalSource[] = [
  {
    name: "Iowa SBDC",
    sourceName: "iowa-sbdc",
    urls: [
      "https://iowasbdc.org/",
      "https://iowasbdc.org/resources/",
    ],
    grantType: "STATE",
    keywords: [
      "grant", "fund", "financing", "capital", "loan", "incentive",
      "award", "tax credit",
    ],
  },
  {
    name: "Iowa Finance Authority",
    sourceName: "iowa-finance-authority",
    urls: [
      "https://www.iowafinance.com/",
      "https://www.iowafinance.com/programs/",
    ],
    grantType: "STATE",
    keywords: [
      "grant", "fund", "loan", "credit", "incentive",
      "financing", "tax credit", "award",
    ],
  },
  {
    name: "Greater Des Moines Partnership",
    sourceName: "dsm-partnership",
    urls: [
      "https://www.dsmpartnership.com/growing-business-here/business-resources",
    ],
    grantType: "LOCAL",
    keywords: [
      "grant", "fund", "incentive", "financing", "loan",
      "capital", "award", "tax credit",
    ],
  },
  {
    name: "Cedar Rapids Economic Development",
    sourceName: "cedar-rapids-econ",
    urls: [
      "https://www.economicdevelopmentcr.com/incentives-government/",
    ],
    grantType: "LOCAL",
    keywords: [
      "grant", "fund", "incentive", "financing", "loan",
      "facade", "revitalization", "award", "tax credit",
    ],
  },
  {
    name: "Community Foundation of Greater Des Moines",
    sourceName: "cfgdm",
    urls: [
      "https://www.desmoinesfoundation.org/grants/",
    ],
    grantType: "LOCAL",
    keywords: [
      "grant", "fund", "award", "capital", "incentive",
      "financing", "tax credit",
    ],
  },
  {
    name: "Choose Iowa",
    sourceName: "choose-iowa",
    urls: [
      "https://www.chooseiowa.com/grants",
    ],
    grantType: "STATE",
    keywords: [
      "grant", "fund", "award", "incentive", "value-added",
    ],
  },
  {
    name: "Iowa DAS Targeted Small Business",
    sourceName: "iowa-das-tsb",
    urls: [
      "https://das.iowa.gov/vendors/targeted-small-business-program",
    ],
    grantType: "STATE",
    keywords: [
      "grant", "fund", "certification", "procurement", "contract",
      "incentive", "award",
    ],
  },
  {
    name: "Midwest Partnership",
    sourceName: "midwest-partnership",
    urls: [
      "https://www.midwestpartnership.com/small-business-development/",
    ],
    grantType: "LOCAL",
    keywords: [
      "grant", "fund", "incentive", "financing", "loan",
      "capital", "award",
    ],
  },
];

// ---------------------------------------------------------------------------
// Browser-like headers
// ---------------------------------------------------------------------------

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------------------------------------------------------------------------
// Negative keywords — link text matching these is not a grant listing
// ---------------------------------------------------------------------------

const EXCLUDED_LINK_PATTERNS = [
  "title guaranty", "title insurance", "about us", "contact us",
  "contact", "news", "blog", "events", "calendar", "staff",
  "board of directors", "annual report", "newsletter", "subscribe",
  "login", "sign in", "careers", "job opening", "employment",
  "press release", "media", "faq", "privacy policy", "terms of use",
  "site map", "accessibility",
];

// ---------------------------------------------------------------------------
// Scraping logic
// ---------------------------------------------------------------------------

interface RawLink {
  title: string;
  url: string;
}

function extractLinks(
  html: string,
  baseUrl: string,
  keywords: string[]
): RawLink[] {
  const $ = cheerio.load(html);
  const links: RawLink[] = [];
  const seen = new Set<string>();

  // Remove navigation noise
  $("nav, footer, header, aside, [role='navigation']").remove();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let fullUrl: string;
    try {
      fullUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    // Skip external links, anchors, and file downloads (except PDFs)
    if (!fullUrl.startsWith("http")) return;
    if (fullUrl.includes("#") && fullUrl.split("#")[0] === baseUrl) return;
    if (/\.(jpg|jpeg|png|gif|svg|zip|doc|docx|xlsx)$/i.test(fullUrl)) return;

    const linkText = $(el).text().trim();
    if (!linkText || linkText.length < 3 || linkText.length > 200) return;

    // Must match at least one keyword
    const lower = linkText.toLowerCase();
    const hasKeyword = keywords.some((kw) => lower.includes(kw));
    if (!hasKeyword) return;

    // Reject links matching non-grant patterns
    if (EXCLUDED_LINK_PATTERNS.some((p) => lower.includes(p))) return;

    // Skip generic homepage links
    if (isGenericHomepage(fullUrl)) return;

    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      links.push({ title: linkText, url: fullUrl });
    }
  });

  return links;
}

async function scrapeSource(source: LocalSource): Promise<GrantData[]> {
  const allLinks: RawLink[] = [];
  const seenUrls = new Set<string>();

  for (const url of source.urls) {
    try {
      const response = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: 15000,
        maxRedirects: 5,
      });

      if (response.status === 200 && typeof response.data === "string") {
        const links = extractLinks(response.data, url, source.keywords);
        for (const link of links) {
          if (!seenUrls.has(link.url)) {
            seenUrls.add(link.url);
            allLinks.push(link);
          }
        }
      }
    } catch (error) {
      console.log(
        `[iowa-local:${source.sourceName}] Failed to fetch ${url}:`,
        error instanceof Error ? error.message : error
      );
    }

    // Polite delay between pages on same source
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Enrich first 10 links with page details
  const grants: GrantData[] = [];
  const toEnrich = allLinks.slice(0, 10);

  for (const link of toEnrich) {
    try {
      const details = await fetchPageDetails(link.url);

      // Skip pages that returned null (error/404 pages) or have no content
      if (!details || !details.description) {
        console.log(`[iowa-local:${source.sourceName}] Skipped empty/error page: ${link.title}`);
        continue;
      }

      // Skip pages that don't look like actual grant listings
      if (!isActualGrantPage(link.url, link.title, details.description)) {
        console.log(`[iowa-local:${source.sourceName}] Skipped non-grant page: ${link.title}`);
        continue;
      }

      const grant: GrantData = {
        title: link.title,
        description: details.description,
        sourceUrl: link.url,
        sourceName: source.sourceName,
        deadline: details.deadline,
        grantType: source.grantType,
        status: "OPEN",
        businessStage: "BOTH",
        gender: "ANY",
        locations: ["Iowa"],
        industries: [],
        categories: ["Iowa Local"],
        eligibleExpenses: [],
      };

      // Try to extract dollar amounts from the description
      const parsedAmount = parseGrantAmount(grant.description);
      if (parsedAmount) {
        grant.amountMin = parsedAmount.min;
        grant.amountMax = parsedAmount.max;
        grant.amount = parsedAmount.raw;
      }

      grants.push(grant);

      // Polite delay
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      console.log(
        `[iowa-local:${source.sourceName}] Failed to enrich ${link.url}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return grants;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeIowaLocalGrants(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const source of LOCAL_SOURCES) {
    try {
      console.log(
        `[iowa-local] Scraping ${source.name} (${source.urls.length} pages)...`
      );
      const grants = await scrapeSource(source);

      for (const grant of grants) {
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      console.log(
        `[iowa-local:${source.sourceName}] Found ${grants.length} grants`
      );
    } catch (error) {
      console.error(
        `[iowa-local:${source.sourceName}] Error:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(
    `[iowa-local] Total unique grants: ${allGrants.length} from ${LOCAL_SOURCES.length} sources`
  );
  return allGrants;
}
