import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { BROWSER_HEADERS, SCRAPER_TIMEOUT_MS } from "./config";
import { extractDeadline, detectLocationScope, cleanHtmlToText } from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// SBA.gov grant pages to scrape
// ---------------------------------------------------------------------------

const SBA_PAGES = [
  {
    url: "https://www.sba.gov/funding-programs/grants",
    label: "SBA Grants Overview",
  },
  {
    url: "https://www.sba.gov/funding-programs/grants/small-business-innovation-research-program",
    label: "SBIR Program",
  },
  {
    url: "https://www.sba.gov/funding-programs/grants/small-business-technology-transfer-program",
    label: "STTR Program",
  },
  {
    url: "https://www.sba.gov/funding-programs/grants/grants-community-organizations",
    label: "Community Organization Grants",
  },
  {
    url: "https://www.sba.gov/business-guide/plan-your-business/fund-your-business",
    label: "Fund Your Business Guide",
  },
];

// ---------------------------------------------------------------------------
// Extract grant program links from SBA pages
// ---------------------------------------------------------------------------

async function extractGrantLinks(pageUrl: string): Promise<string[]> {
  try {
    const response = await axios.get(pageUrl, {
      headers: BROWSER_HEADERS,
      timeout: SCRAPER_TIMEOUT_MS,
      maxRedirects: 3,
    });

    if (response.status !== 200 || typeof response.data !== "string") return [];

    const $ = cheerio.load(response.data);
    $("nav, footer, script, style, header").remove();

    const links: string[] = [];
    const seen = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      let fullUrl: string;
      try {
        fullUrl = new URL(href, pageUrl).href;
      } catch {
        return;
      }

      // Only follow sba.gov links about grants/funding
      let hostname: string;
      try {
        hostname = new URL(fullUrl).hostname.toLowerCase();
      } catch {
        return;
      }
      if (!(hostname === "sba.gov" || hostname.endsWith(".sba.gov"))) return;
      const lower = fullUrl.toLowerCase();
      if (
        !lower.includes("grant") &&
        !lower.includes("funding") &&
        !lower.includes("program") &&
        !lower.includes("sbir") &&
        !lower.includes("sttr")
      )
        return;

      // Skip generic pages, anchors, PDFs
      if (lower.endsWith(".pdf")) return;
      if (fullUrl.includes("#")) fullUrl = fullUrl.split("#")[0];
      if (seen.has(fullUrl)) return;
      if (fullUrl === pageUrl) return;

      seen.add(fullUrl);
      links.push(fullUrl);
    });

    return links;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Scrape individual SBA grant page
// ---------------------------------------------------------------------------

async function scrapeSbaGrantPage(url: string): Promise<GrantData | null> {
  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: SCRAPER_TIMEOUT_MS,
      maxRedirects: 3,
    });

    if (response.status !== 200 || typeof response.data !== "string") return null;

    const $ = cheerio.load(response.data);
    $("nav, footer, script, style, header, iframe, noscript, svg, aside").remove();

    const pageTitle = $("h1").first().text().trim() || $("title").text().trim();

    if (!pageTitle) return null;

    const pageText = $("main, article, .content, body")
      .first()
      .text()
      .replaceAll(/\s+/g, " ")
      .trim();

    // Must mention grants (filter out loan-only pages)
    const lowerText = pageText.toLowerCase();
    if (!lowerText.includes("grant")) return null;

    // Skip pages that are primarily about loans, not grants
    const grantMentions = (lowerText.match(/\bgrant\b/g) || []).length;
    const loanMentions = (lowerText.match(/\bloan\b/g) || []).length;
    if (loanMentions > grantMentions * 3) return null;

    const deadline = extractDeadline(response.data);
    const rawHtml = $("main, article, .content, body").first().html() || "";
    const description = cleanHtmlToText(rawHtml, 800);

    if (!description || description.length < 50) return null;

    const locations = detectLocationScope(pageText);

    return {
      title: pageTitle,
      description,
      sourceUrl: url,
      sourceName: "sba-gov",
      grantType: "FEDERAL",
      status: deadline && deadline < new Date() ? "CLOSED" : "OPEN",
      businessStage: "BOTH",
      gender: "ANY",
      locations,
      industries: [],
      deadline,
      categories: ["Federal - SBA"],
      eligibleExpenses: [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeSbaGov(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  // Step 1: Collect all grant-related links from SBA pages
  const allLinks: string[] = [];
  for (const page of SBA_PAGES) {
    try {
      const links = await extractGrantLinks(page.url);
      allLinks.push(...links);
      log("sba-gov", `${page.label}: found ${links.length} grant links`);
    } catch (error) {
      logError("sba-gov", `Failed to extract links from ${page.label}`, error);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Deduplicate links
  const uniqueLinks = Array.from(new Set(allLinks));
  log("sba-gov", `Total unique grant links to scrape: ${uniqueLinks.length}`);

  // Step 2: Scrape each link for grant details (cap at 20)
  for (const url of uniqueLinks.slice(0, 20)) {
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const grant = await scrapeSbaGrantPage(url);
    if (grant) {
      allGrants.push(grant);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  log("sba-gov", "Total grants from SBA.gov", { count: allGrants.length });
  return allGrants;
}
