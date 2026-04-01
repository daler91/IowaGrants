import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";

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
          "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
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
            lower.includes("program") ||
            lower.includes("fund") ||
            lower.includes("assist") ||
            lower.includes("business") ||
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

  console.log(`[opportunity-iowa] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
