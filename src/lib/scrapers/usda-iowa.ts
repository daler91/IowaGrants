import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { BROWSER_USER_AGENT } from "./config";

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

async function fetchWithRetry(url: string, retries = 2): Promise<import("axios").AxiosResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 60000,
      });
    } catch (error) {
      if (attempt < retries) {
        console.warn(`[usda-rd] Attempt ${attempt + 1} failed, retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
}

export async function scrapeUSDA(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  try {
    const response = await fetchWithRetry(USDA_URL);

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
