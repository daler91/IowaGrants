import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { BROWSER_USER_AGENT } from "./config";
import { fetchPageDetails } from "./utils";
import { log, logError } from "@/lib/errors";

const IOWA_GRANTS_GOV_URLS = ["https://www.iowagrants.gov/"];

function mapToGrantData(title: string, url: string, description: string): GrantData {
  return {
    title,
    description,
    sourceUrl: url,
    sourceName: "iowa-grants-gov",
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

export async function scrapeIowaGrantsGov(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const pageUrl of IOWA_GRANTS_GOV_URLS) {
    try {
      const response = await axios.get(pageUrl, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 20000,
      });

      const $ = cheerio.load(response.data);

      const selectors = [
        "table a",
        ".grant-listing a",
        ".grantSummary a",
        "main a[href]",
        ".content a",
        "a[href*='grantSummary']",
        "a[href*='grant']",
      ];

      for (const selector of selectors) {
        $(selector).each((_, el) => {
          // Type guard: ensure this is an Element node with tagName before
          // accessing element-specific properties. CheerioElement can also be
          // a TextElement which does not have tagName.
          if (!("tagName" in el) || el.type !== "tag") return;

          const $el = $(el);
          const href = $el.attr("href");
          const title = $el.text().trim();

          if (!href || !title || title.length < 5) return;

          const fullUrl = href.startsWith("http")
            ? href
            : new URL(href, "https://www.iowagrants.gov").toString();

          if (seenUrls.has(fullUrl)) return;

          const lower = (title + " " + fullUrl).toLowerCase();
          const isRelevant =
            lower.includes("grant") ||
            lower.includes("fund") ||
            lower.includes("assist") ||
            lower.includes("award") ||
            lower.includes("application");

          if (!isRelevant) return;

          if (
            lower.includes("login") ||
            lower.includes("contact") ||
            lower.includes("privacy") ||
            lower.includes("sitemap")
          )
            return;

          // Skip top-level category pages
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

      log("iowa-grants-gov", `Scraped ${allGrants.length} programs`, { url: pageUrl });
    } catch (error) {
      logError("iowa-grants-gov", `Error scraping ${pageUrl}`, error);
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

  log("iowa-grants-gov", "Total unique grants", { count: allGrants.length });
  return allGrants;
}
