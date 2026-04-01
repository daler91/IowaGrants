import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { fetchPageDetails } from "./utils";

const IEDA_URLS = [
  "https://www.iowaeda.com/small-business/",
  "https://www.iowaeda.com/programs/",
];

interface ScrapedProgram {
  title: string;
  description: string;
  url: string;
  pdfUrl?: string;
}

function scrapePageForPrograms(
  html: string,
  baseUrl: string
): ScrapedProgram[] {
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

      const fullUrl = href.startsWith("http")
        ? href
        : new URL(href, baseUrl).toString();

      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      // Filter for grant/program-related links
      const lowerTitle = title.toLowerCase();
      const lowerUrl = fullUrl.toLowerCase();
      const isRelevant =
        lowerTitle.includes("grant") ||
        lowerTitle.includes("program") ||
        lowerTitle.includes("fund") ||
        lowerTitle.includes("assist") ||
        lowerTitle.includes("business") ||
        lowerUrl.includes("grant") ||
        lowerUrl.includes("program") ||
        lowerUrl.includes("fund");

      if (!isRelevant) return;

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

export async function scrapeIEDA(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const url of IEDA_URLS) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "IowaGrantScanner/1.0 (educational research project)",
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

      console.log(
        `[ieda] Scraped ${programs.length} programs from ${url}`
      );
    } catch (error) {
      console.error(
        `[ieda] Error scraping ${url}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fetch deadline details from individual pages (limit to first 10 to avoid slowdown)
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

  console.log(`[ieda] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
