import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";

const USDA_URL = "https://www.rd.usda.gov/programs-services/all-programs/ia";

function mapToGrantData(title: string, url: string, description: string): GrantData {
  return {
    title,
    description,
    sourceUrl: url,
    sourceName: "usda-rd",
    grantType: "FEDERAL",
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: ["Agriculture", "Rural Development"],
    categories: [],
    eligibleExpenses: [],
  };
}

export async function scrapeUSDA(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  try {
    const response = await axios.get(USDA_URL, {
      headers: {
        "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // USDA program pages typically list programs with links
    const selectors = [
      ".view-content a",
      ".views-row a",
      "article a",
      "main a[href]",
      ".field-content a",
      ".usa-list a",
      "li a",
    ];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        const title = $el.text().trim();

        if (!href || !title || title.length < 5) return;

        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.rd.usda.gov${href}`;

        if (seenUrls.has(fullUrl)) return;

        // Filter for grant/program-related links
        const lower = (title + " " + fullUrl).toLowerCase();
        const isRelevant =
          lower.includes("grant") ||
          lower.includes("program") ||
          lower.includes("loan") ||
          lower.includes("fund") ||
          lower.includes("assistance") ||
          lower.includes("development");

        if (!isRelevant) return;

        // Skip navigation, footer, and non-program links
        if (
          lower.includes("login") ||
          lower.includes("contact") ||
          lower.includes("about us") ||
          lower.includes("privacy")
        )
          return;

        seenUrls.add(fullUrl);
        const description = $el.parent().text().trim().slice(0, 500) || title;
        allGrants.push(mapToGrantData(title, fullUrl, description));
      });
    }

    console.log(`[usda-rd] Scraped ${allGrants.length} programs from ${USDA_URL}`);
  } catch (error) {
    console.error(
      `[usda-rd] Error scraping:`,
      error instanceof Error ? error.message : error
    );
  }

  return allGrants;
}
