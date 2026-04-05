import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { BROWSER_HEADERS, SCRAPER_TIMEOUT_MS, POLITE_DELAY_MS } from "./config";
import { isSafeUrl, fetchPageDetails, isActualGrantPage, parseGrantAmount } from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Iowa Economic Development Authority (IEDA) program directory — deeper crawl
// ---------------------------------------------------------------------------
//
// The existing ieda-scraper only reads the top-level /small-business and
// /programs listing pages. IEDA publishes many individual program pages
// (Butchery Innovation, Manufacturing 4.0, Targeted Jobs Withholding,
// Childcare Business Incentive, Brownfield/Grayfield, Empower Rural Iowa,
// Destination Iowa, etc.) that only show up after clicking into each program.
//
// This scraper visits the programs index, follows each program link one level
// deeper, and extracts the per-program details page as an individual grant.
// Reuses the shared utilities so SSRF, page-quality, and amount parsing are
// consistent with the rest of the codebase.

const IEDA_INDEX_URLS = [
  "https://www.iowaeda.com/programs/",
  "https://www.iowaeda.com/small-business/",
  "https://www.iowaeda.com/community-development/",
];

// Link text patterns that indicate a program page worth following
const PROGRAM_KEYWORDS = [
  "grant",
  "fund",
  "incentive",
  "credit",
  "tax credit",
  "loan",
  "assistance",
  "challenge",
  "program",
  "initiative",
  "refund",
  "rebate",
  "voucher",
  "scholarship",
  "fellowship",
];

// Titles to exclude as generic navigation
const EXCLUDED_TITLES = new Set([
  "programs",
  "small business",
  "community development",
  "about",
  "contact",
  "news",
  "events",
  "home",
  "apply",
  "login",
  "sign in",
  "search",
  "back",
]);

interface ProgramLink {
  title: string;
  url: string;
}

function extractProgramLinks(html: string, baseUrl: string): ProgramLink[] {
  const $ = cheerio.load(html);
  $("nav, footer, header, aside, script, style, noscript, iframe").remove();

  const links: ProgramLink[] = [];
  const seen = new Set<string>();

  $("main a[href], article a[href], .content a[href], .entry-content a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const title = $el.text().replaceAll(/\s+/g, " ").trim();

    if (!href || !title) return;
    if (title.length < 5 || title.length > 180) return;
    if (EXCLUDED_TITLES.has(title.toLowerCase())) return;

    let fullUrl: string;
    try {
      fullUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    // Keep only iowaeda.com program pages (exact host or legitimate subdomain)
    try {
      const host = new URL(fullUrl).hostname.toLowerCase();
      if (host !== "iowaeda.com" && !host.endsWith(".iowaeda.com")) return;
    } catch {
      return;
    }

    if (!isSafeUrl(fullUrl)) return;
    if (seen.has(fullUrl)) return;

    // Require the path to have at least 2 segments (not a top-level index)
    try {
      const pathname = new URL(fullUrl).pathname.replace(/\/+$/, "");
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length < 1) return;
      // Skip the index pages themselves
      const indexSlugs = ["programs", "small-business", "community-development"];
      if (segments.length === 1 && indexSlugs.includes(segments[0].toLowerCase())) return;
    } catch {
      return;
    }

    // Require at least one program-related keyword in title or URL
    const lowerTitle = title.toLowerCase();
    const lowerUrl = fullUrl.toLowerCase();
    const matchesKeyword = PROGRAM_KEYWORDS.some(
      (kw) => lowerTitle.includes(kw) || lowerUrl.includes(kw.replaceAll(" ", "-")),
    );
    if (!matchesKeyword) return;

    seen.add(fullUrl);
    links.push({ title, url: fullUrl });
  });

  return links;
}

export async function scrapeIowaIedaPrograms(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();
  const programLinks: ProgramLink[] = [];

  // Step 1: crawl each IEDA index page and collect program links
  for (const indexUrl of IEDA_INDEX_URLS) {
    if (!isSafeUrl(indexUrl)) continue;

    try {
      const response = await axios.get(indexUrl, {
        headers: BROWSER_HEADERS,
        timeout: SCRAPER_TIMEOUT_MS,
        maxRedirects: 5,
      });

      if (typeof response.data !== "string") continue;

      const links = extractProgramLinks(response.data, indexUrl);
      for (const link of links) {
        if (!programLinks.some((p) => p.url === link.url)) {
          programLinks.push(link);
        }
      }

      log("iowa-ieda-programs", "Collected links from index", {
        indexUrl,
        count: links.length,
      });
    } catch (error) {
      logError("iowa-ieda-programs", `Error fetching index ${indexUrl}`, error);
    }
  }

  // Step 2: fetch each program's detail page and build a GrantData entry
  for (const link of programLinks) {
    if (seenUrls.has(link.url)) continue;

    try {
      const details = await fetchPageDetails(link.url);
      if (!details?.description || details.description.length < 80) continue;

      if (!isActualGrantPage(link.url, link.title, details.description)) continue;

      const parsedAmount = parseGrantAmount(details.description);

      allGrants.push({
        title: link.title,
        description: details.description,
        sourceUrl: link.url,
        sourceName: "ieda-programs",
        deadline: details.deadline,
        amountMin: parsedAmount?.min,
        amountMax: parsedAmount?.max,
        amount: parsedAmount?.raw,
        grantType: "STATE",
        status: "OPEN",
        businessStage: "BOTH",
        gender: "ANY",
        locations: ["Iowa"],
        industries: [],
        categories: ["Iowa State Program"],
        eligibleExpenses: [],
      });
      seenUrls.add(link.url);

      await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    } catch (error) {
      logError("iowa-ieda-programs", `Error enriching ${link.url}`, error);
    }
  }

  log("iowa-ieda-programs", "Total unique grants", {
    count: allGrants.length,
    linksChecked: programLinks.length,
  });
  return allGrants;
}
