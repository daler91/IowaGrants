import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { SCRAPER_USER_AGENT } from "./config";
import { fetchPageDetails } from "./utils";

const OPPORTUNITY_IOWA_URLS = [
  "https://opportunityiowa.gov/business/financial-assistance/grants-funding",
  "https://opportunityiowa.gov/business/small-business-entrepreneurs",
];

function mapToGrantData(title: string, url: string, description: string): GrantData {
  return {
    title,
    description,
    sourceUrl: url,
    sourceName: "opportunity-iowa",
    grantType: "STATE",
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: [],
    categories: [],
    eligibleExpenses: [],
  };
}

export async function scrapeOpportunityIowa(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const pageUrl of OPPORTUNITY_IOWA_URLS) {
    try {
      const response = await axios.get(pageUrl, {
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      const selectors = [
        ".field-content a",
        ".view-content a",
        "main a[href]",
        ".content a",
        "article a",
        ".card a",
        ".paragraph a",
      ];

      for (const selector of selectors) {
        $(selector).each((_, el) => {
          const $el = $(el);
          const href = $el.attr("href");
          const title = $el.text().trim();

          if (!href || !title || title.length < 5) return;

          const fullUrl = href.startsWith("http")
            ? href
            : `https://opportunityiowa.gov${href}`;

          if (seenUrls.has(fullUrl)) return;

          const lower = (title + " " + fullUrl).toLowerCase();
          const isRelevant =
            lower.includes("grant") ||
            lower.includes("fund") ||
            lower.includes("assist") ||
            lower.includes("credit") ||
            lower.includes("incentive") ||
            lower.includes("loan");

          if (!isRelevant) return;

          // Skip nav/footer links
          if (
            lower.includes("login") ||
            lower.includes("contact") ||
            lower.includes("privacy") ||
            lower.includes("sitemap")
          )
            return;

          // Skip top-level category pages (e.g., /business, /programs)
          try {
            const pathname = new URL(fullUrl).pathname.replace(/\/+$/, "");
            const segments = pathname.split("/").filter(Boolean);
            if (segments.length <= 1) return;
          } catch {
            // continue if URL parsing fails
          }

          seenUrls.add(fullUrl);
          const description = $el.parent().text().trim().slice(0, 500) || title;
          allGrants.push(mapToGrantData(title, fullUrl, description));
        });
      }

      console.log(
        `[opportunity-iowa] Scraped ${allGrants.length} programs from ${pageUrl}`
      );
    } catch (error) {
      console.error(
        `[opportunity-iowa] Error scraping ${pageUrl}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fetch deadline details from individual pages (limit to first 10)
  const toFetch = allGrants.slice(0, 10);
  for (const grant of toFetch) {
    const details = await fetchPageDetails(grant.sourceUrl);
    if (details?.deadline) {
      grant.deadline = details.deadline;
    }
    if (details?.description && details.description.length > grant.description.length) {
      grant.description = details.description;
    }
  }

  console.log(`[opportunity-iowa] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
