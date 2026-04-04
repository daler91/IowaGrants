import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { SCRAPER_USER_AGENT } from "./config";
import { fetchPageDetails } from "./utils";
import { log, logError } from "@/lib/errors";

const IEDA_URLS = ["https://www.iowaeda.com/small-business/", "https://www.iowaeda.com/programs/"];

interface ScrapedProgram {
  title: string;
  description: string;
  url: string;
  pdfUrl?: string;
}

function scrapePageForPrograms(html: string, baseUrl: string): ScrapedProgram[] {
  const $ = cheerio.load(html);
  const programs: ScrapedProgram[] = [];

  // Look for program listings — common patterns on government sites
  const selectors = [
    ".program-listing a",
    ".card a",
    "article a",
    ".content-area a",
    "main a[href]",
    ".entry-content a",
    ".page-content a",
  ];

  const seenUrls = new Set<string>();

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      const title = $el.text().trim();

      if (!href || !title || title.length < 5) return;

      const fullUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();

      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      // Filter for grant/program-related links
      const lowerTitle = title.toLowerCase();
      const lowerUrl = fullUrl.toLowerCase();
      const isRelevant =
        lowerTitle.includes("grant") ||
        lowerTitle.includes("fund") ||
        lowerTitle.includes("assist") ||
        lowerTitle.includes("incentive") ||
        lowerTitle.includes("loan") ||
        lowerTitle.includes("credit") ||
        lowerUrl.includes("grant") ||
        lowerUrl.includes("fund");

      if (!isRelevant) return;

      // Skip top-level category pages
      try {
        const pathname = new URL(fullUrl).pathname.replace(/\/+$/, "");
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length <= 1) return;
      } catch {
        // continue if URL parsing fails
      }

      const isPdf = lowerUrl.endsWith(".pdf");

      programs.push({
        title,
        description: $el.parent().text().trim().slice(0, 500) || title,
        url: isPdf ? baseUrl : fullUrl,
        pdfUrl: isPdf ? fullUrl : undefined,
      });
    });
  }

  return programs;
}

function mapToGrantData(program: ScrapedProgram): GrantData {
  return {
    title: program.title,
    description: program.description,
    sourceUrl: program.url,
    sourceName: "ieda",
    grantType: "STATE",
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: [],
    pdfUrl: program.pdfUrl,
    categories: [],
    eligibleExpenses: [],
  };
}

async function enrichGrantsWithDetails(grants: GrantData[]): Promise<void> {
  const toFetch = grants.slice(0, 10);
  for (const grant of toFetch) {
    const details = await fetchPageDetails(grant.sourceUrl);
    if (details?.deadline) {
      grant.deadline = details.deadline;
    }
    if (details?.description && details.description.length > grant.description.length) {
      grant.description = details.description;
    }
  }
}

export async function scrapeIEDA(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const url of IEDA_URLS) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
        },
        timeout: 15000,
      });

      const programs = scrapePageForPrograms(response.data, url);

      for (const program of programs) {
        const grant = mapToGrantData(program);
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      log("ieda-scraper", `Scraped ${programs.length} programs`, { url });
    } catch (error) {
      logError("ieda-scraper", `Error scraping ${url}`, error);
    }
  }

  // Fetch deadline details from individual pages (limit to first 10 to avoid slowdown)
  await enrichGrantsWithDetails(allGrants);

  log("ieda-scraper", "Total unique grants", { count: allGrants.length });
  return allGrants;
}
