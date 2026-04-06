import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GrantType } from "@prisma/client";
import { BROWSER_HEADERS, SCRAPER_TIMEOUT_MS, POLITE_DELAY_MS } from "./config";
import {
  isSafeUrl,
  fetchPageDetails,
  isActualGrantPage,
  extractDeadline,
  cleanHtmlToText,
} from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Federal agency SBIR/STTR topic & solicitation pages
// ---------------------------------------------------------------------------
//
// Many federal agencies publish SBIR/STTR solicitations on their own pages
// before (or in addition to) Grants.gov. This scraper visits each agency's
// open-topics/solicitations page, extracts links to individual topics, and
// emits them as GrantData entries. Reuses fetchPageDetails/isActualGrantPage
// so unrelated nav links are filtered out by the same logic used elsewhere.

interface AgencySource {
  /** Agency display name */
  name: string;
  /** Source name stored in DB */
  sourceName: string;
  /** Listing page(s) to crawl for topic/solicitation links */
  urls: string[];
  grantType: GrantType;
}

const AGENCY_SOURCES: AgencySource[] = [
  {
    name: "SBIR.gov Open Topics",
    sourceName: "sbir-gov-topics",
    urls: ["https://www.sbir.gov/topics", "https://www.sbir.gov/solicitations"],
    grantType: "FEDERAL",
  },
  {
    name: "NIH SEED / SBIR",
    sourceName: "nih-sbir",
    urls: [
      "https://seed.nih.gov/small-business-funding/small-business-program-basics/funding-opportunities",
    ],
    grantType: "FEDERAL",
  },
  {
    name: "NSF SBIR / STTR",
    sourceName: "nsf-sbir",
    urls: ["https://seedfund.nsf.gov/topics/", "https://seedfund.nsf.gov/how-to-apply/"],
    grantType: "FEDERAL",
  },
  {
    name: "DOE SBIR / STTR",
    sourceName: "doe-sbir",
    urls: ["https://science.osti.gov/sbir/Funding-Opportunities"],
    grantType: "FEDERAL",
  },
  {
    name: "NASA SBIR / STTR",
    sourceName: "nasa-sbir",
    urls: ["https://sbir.nasa.gov/solicitations"],
    grantType: "FEDERAL",
  },
  {
    name: "USDA NIFA SBIR",
    sourceName: "usda-nifa-sbir",
    urls: [
      "https://www.nifa.usda.gov/grants/programs/small-business-innovation-research-program-sbir",
    ],
    grantType: "FEDERAL",
  },
  {
    name: "EPA SBIR",
    sourceName: "epa-sbir",
    urls: ["https://www.epa.gov/sbir/sbir-funding-opportunities"],
    grantType: "FEDERAL",
  },
  {
    name: "DOT SBIR",
    sourceName: "dot-sbir",
    urls: ["https://www.transportation.gov/osdbu/SBIR"],
    grantType: "FEDERAL",
  },
  {
    name: "DoD SBIR / STTR",
    sourceName: "dod-sbir",
    urls: ["https://www.dodsbirsttr.mil/submissions/solicitation-documents/active-solicitations"],
    grantType: "FEDERAL",
  },
];

// Link text / URL patterns that indicate an SBIR/STTR opportunity
const OPPORTUNITY_PATTERNS = [
  /\bsbir\b/i,
  /\bsttr\b/i,
  /topic/i,
  /solicitation/i,
  /phase\s*(?:i{1,2}|[12])/i,
  /funding opportunity/i,
  /broad agency announcement/i,
  /request for proposals?/i,
  /rfp/i,
];

// Link text that should never be treated as an opportunity
const EXCLUDE_LINK_PATTERNS = [
  /^home$/i,
  /^about$/i,
  /^contact/i,
  /^news/i,
  /^events?$/i,
  /^sign in/i,
  /^login/i,
  /privacy/i,
  /accessibility/i,
  /site map/i,
];

interface CandidateLink {
  title: string;
  url: string;
  context: string;
}

function extractCandidateLinks(html: string, baseUrl: string): CandidateLink[] {
  const $ = cheerio.load(html);
  $("nav, footer, header, aside, script, style, noscript").remove();

  const candidates: CandidateLink[] = [];
  const seen = new Set<string>();

  $("main a[href], article a[href], .content a[href], body a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const title = $el.text().replaceAll(/\s+/g, " ").trim();

    if (!href || !title || title.length < 8 || title.length > 200) return;
    if (EXCLUDE_LINK_PATTERNS.some((p) => p.test(title))) return;

    let fullUrl: string;
    try {
      fullUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    if (!isSafeUrl(fullUrl)) return;
    if (seen.has(fullUrl)) return;

    const haystack = `${title} ${fullUrl}`;
    if (!OPPORTUNITY_PATTERNS.some((p) => p.test(haystack))) return;

    seen.add(fullUrl);
    const context = $el.parent().text().replaceAll(/\s+/g, " ").trim().slice(0, 400);
    candidates.push({ title, url: fullUrl, context });
  });

  return candidates;
}

function buildSbirGrant(
  title: string,
  description: string,
  sourceUrl: string,
  sourceName: string,
  deadline: Date | undefined,
  grantType: GrantType,
): GrantData {
  return {
    title,
    description,
    sourceUrl,
    sourceName,
    deadline,
    grantType,
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Nationwide"],
    industries: [],
    categories: ["SBIR/STTR"],
    eligibleExpenses: [],
  };
}

async function enrichCandidates(
  candidates: CandidateLink[],
  seenUrls: Set<string>,
  agency: AgencySource,
): Promise<GrantData[]> {
  const grants: GrantData[] = [];

  for (const candidate of candidates.slice(0, 12)) {
    if (seenUrls.has(candidate.url)) continue;

    const details = await fetchPageDetails(candidate.url);
    if (!details) continue;

    const description = details.description || candidate.context;
    if (!description || description.length < 80) continue;
    if (!isActualGrantPage(candidate.url, candidate.title, description)) continue;

    grants.push(
      buildSbirGrant(candidate.title, description, candidate.url, agency.sourceName, details.deadline, agency.grantType),
    );
    seenUrls.add(candidate.url);

    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
  }

  return grants;
}

async function scrapeAgency(agency: AgencySource): Promise<GrantData[]> {
  const grants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const listingUrl of agency.urls) {
    if (!isSafeUrl(listingUrl)) continue;

    try {
      const response = await axios.get(listingUrl, {
        headers: BROWSER_HEADERS,
        timeout: SCRAPER_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (s: number) => s < 500,
      });

      if (response.status >= 400 || typeof response.data !== "string") continue;

      const candidates = extractCandidateLinks(response.data, listingUrl);

      const pageText = cleanHtmlToText(response.data, 800);
      if (pageText.length > 100) {
        const pageDeadline = extractDeadline(response.data);
        grants.push(
          buildSbirGrant(`${agency.name} — Open Opportunities`, pageText, listingUrl, agency.sourceName, pageDeadline, agency.grantType),
        );
        seenUrls.add(listingUrl);
      }

      const enriched = await enrichCandidates(candidates, seenUrls, agency);
      grants.push(...enriched);

      log("federal-agency-sbir", "Scraped listing", {
        agency: agency.sourceName,
        listingUrl,
        candidates: candidates.length,
      });
    } catch (error) {
      logError("federal-agency-sbir", `Error scraping ${agency.name}`, error);
    }
  }

  return grants;
}

export async function scrapeFederalAgencySbir(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];

  for (const agency of AGENCY_SOURCES) {
    try {
      const grants = await scrapeAgency(agency);
      allGrants.push(...grants);
    } catch (error) {
      logError("federal-agency-sbir", `Error with ${agency.sourceName}`, error);
    }
  }

  log("federal-agency-sbir", "Total grants", {
    count: allGrants.length,
    sources: AGENCY_SOURCES.length,
  });
  return allGrants;
}
