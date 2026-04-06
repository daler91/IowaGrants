import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GrantType } from "@prisma/client";
import { BROWSER_HEADERS } from "./config";
import { fetchPageDetails, isGenericHomepage, isActualGrantPage, parseGrantAmount } from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Iowa local & regional economic development program sources
// ---------------------------------------------------------------------------

interface LocalSource {
  /** Display name for this source */
  name: string;
  /** Source name stored in DB */
  sourceName: string;
  /** URLs to scrape for program listings */
  urls: string[];
  /** Grant type classification */
  grantType: GrantType;
  /** Keywords to match on links/program names (at least one must match) */
  keywords: string[];
}

const LOCAL_SOURCES: LocalSource[] = [
  {
    name: "Iowa SBDC",
    sourceName: "iowa-sbdc",
    urls: ["https://iowasbdc.org/", "https://iowasbdc.org/resources/"],
    grantType: "STATE",
    keywords: ["grant", "fund", "financing", "capital", "loan", "incentive", "award", "tax credit"],
  },
  {
    name: "Iowa Finance Authority",
    sourceName: "iowa-finance-authority",
    urls: ["https://www.iowafinance.com/", "https://www.iowafinance.com/programs/"],
    grantType: "STATE",
    keywords: ["grant", "fund", "loan", "credit", "incentive", "financing", "tax credit", "award"],
  },
  {
    name: "Greater Des Moines Partnership",
    sourceName: "dsm-partnership",
    urls: ["https://www.dsmpartnership.com/growing-business-here/business-resources"],
    grantType: "LOCAL",
    keywords: ["grant", "fund", "incentive", "financing", "loan", "capital", "award", "tax credit"],
  },
  {
    name: "Cedar Rapids Economic Development",
    sourceName: "cedar-rapids-econ",
    urls: ["https://www.economicdevelopmentcr.com/incentives-government/"],
    grantType: "LOCAL",
    keywords: [
      "grant",
      "fund",
      "incentive",
      "financing",
      "loan",
      "facade",
      "revitalization",
      "award",
      "tax credit",
    ],
  },
  {
    name: "Community Foundation of Greater Des Moines",
    sourceName: "cfgdm",
    urls: ["https://www.desmoinesfoundation.org/grants/"],
    grantType: "LOCAL",
    keywords: ["grant", "fund", "award", "capital", "incentive", "financing", "tax credit"],
  },
  {
    name: "Choose Iowa",
    sourceName: "choose-iowa",
    urls: ["https://www.chooseiowa.com/grants"],
    grantType: "STATE",
    keywords: ["grant", "fund", "award", "incentive", "value-added"],
  },
  {
    name: "Iowa DAS Targeted Small Business",
    sourceName: "iowa-das-tsb",
    urls: ["https://das.iowa.gov/vendors/targeted-small-business-program"],
    grantType: "STATE",
    keywords: ["grant", "fund", "certification", "procurement", "contract", "incentive", "award"],
  },
  {
    name: "Midwest Partnership",
    sourceName: "midwest-partnership",
    urls: ["https://www.midwestpartnership.com/small-business-development/"],
    grantType: "LOCAL",
    keywords: ["grant", "fund", "incentive", "financing", "loan", "capital", "award"],
  },
  {
    name: "Main Street Iowa",
    sourceName: "main-street-iowa",
    urls: [
      "https://www.iowaeda.com/main-street-iowa/",
      "https://www.iowaeda.com/main-street-iowa/challenge-grant/",
    ],
    grantType: "STATE",
    keywords: [
      "grant",
      "challenge grant",
      "facade",
      "revitalization",
      "main street",
      "incentive",
      "award",
    ],
  },
  {
    name: "Iowa Center for Economic Success",
    sourceName: "iowa-center-economic-success",
    urls: ["https://www.iowacenter.org/", "https://www.iowacenter.org/programs/"],
    grantType: "STATE",
    keywords: ["grant", "loan", "microloan", "fund", "capital", "financing", "small business"],
  },
  {
    name: "Iowa Department of Agriculture (Choose Iowa)",
    sourceName: "iowa-dept-agriculture",
    urls: [
      "https://iowaagriculture.gov/grants",
      "https://www.chooseiowa.com/choose-iowa-marketing-grant-program",
    ],
    grantType: "STATE",
    keywords: [
      "grant",
      "specialty crop",
      "value added",
      "choose iowa",
      "marketing",
      "producer",
      "award",
    ],
  },
  {
    name: "Iowa Arts Council",
    sourceName: "iowa-arts-council",
    urls: [
      "https://www.iowaculture.gov/arts/grants",
      "https://www.iowaculture.gov/about-us/about/grants",
    ],
    grantType: "STATE",
    keywords: ["grant", "artist", "arts project", "creative", "fellowship", "award"],
  },
  {
    name: "Iowa Childcare Business Incentive (IEDA)",
    sourceName: "iowa-childcare-incentive",
    urls: [
      "https://www.iowaeda.com/childcare-challenge/",
      "https://www.iowaeda.com/childcare-business-incentive/",
    ],
    grantType: "STATE",
    keywords: ["grant", "childcare", "child care", "incentive", "fund", "award"],
  },
  {
    name: "Iowa Brownfield / Grayfield Tax Credits (IEDA)",
    sourceName: "iowa-brownfield-grayfield",
    urls: ["https://www.iowaeda.com/brownfield-grayfield/"],
    grantType: "STATE",
    keywords: ["grant", "tax credit", "brownfield", "grayfield", "redevelopment", "incentive"],
  },
  {
    name: "Empower Rural Iowa",
    sourceName: "empower-rural-iowa",
    urls: ["https://www.empowerruraliowa.org/"],
    grantType: "STATE",
    keywords: ["grant", "rural", "challenge", "community", "fund", "award", "investment"],
  },
  {
    name: "Ames Chamber / Ames Economic Development Commission",
    sourceName: "ames-edc",
    urls: [
      "https://www.ameschamber.com/",
      "https://www.ameschamber.com/economic-development/resources/",
    ],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "loan", "financing", "award", "small business"],
  },
  {
    name: "Iowa City Area Development Group (ICAD)",
    sourceName: "icad-group",
    urls: ["https://www.icadgroup.com/resources/", "https://www.icadgroup.com/start-up-resources/"],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "loan", "financing", "startup", "award"],
  },
  {
    name: "Siouxland Economic Development Corporation",
    sourceName: "siouxland-edc",
    urls: ["https://siouxlandedc.com/", "https://siouxlandedc.com/financing/"],
    grantType: "LOCAL",
    keywords: ["grant", "loan", "financing", "fund", "incentive", "small business", "capital"],
  },
  {
    name: "Greater Dubuque Development Corporation",
    sourceName: "greater-dubuque-dev",
    urls: [
      "https://www.greaterdubuque.org/",
      "https://www.greaterdubuque.org/our-approach/business-retention",
    ],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "financing", "loan", "capital", "award"],
  },
  {
    name: "Advance Southwest Iowa Corporation",
    sourceName: "advance-swiowa",
    urls: ["https://www.advancesouthwestiowa.com/"],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "financing", "loan", "award", "small business"],
  },
  {
    name: "Ottumwa Area Development Corporation",
    sourceName: "ottumwa-adc",
    urls: ["https://www.ottumwaworks.com/"],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "financing", "loan", "award"],
  },
  {
    name: "Marshalltown Area Chamber of Commerce",
    sourceName: "marshalltown-chamber",
    urls: [
      "https://www.marshalltown.org/",
      "https://www.marshalltown.org/economic-development/business-resources/",
    ],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "financing", "loan", "award"],
  },
  {
    name: "Waterloo Economic Development",
    sourceName: "waterloo-econ-dev",
    urls: [
      "https://www.cityofwaterlooiowa.com/departments/economic_development/index.php",
      "https://www.cityofwaterlooiowa.com/business/index.php",
    ],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "loan", "facade", "revitalization", "award"],
  },
  {
    name: "North Iowa Corridor Economic Development Corporation",
    sourceName: "north-iowa-corridor",
    urls: ["https://www.northiowacorridor.com/", "https://www.northiowacorridor.com/resources/"],
    grantType: "LOCAL",
    keywords: ["grant", "incentive", "fund", "financing", "loan", "award", "small business"],
  },
];

// Browser-like headers imported from ./config

// ---------------------------------------------------------------------------
// Negative keywords — link text matching these is not a grant listing
// ---------------------------------------------------------------------------

const EXCLUDED_LINK_PATTERNS = [
  "title guaranty",
  "title insurance",
  "about us",
  "contact us",
  "contact",
  "news",
  "blog",
  "events",
  "calendar",
  "staff",
  "board of directors",
  "annual report",
  "newsletter",
  "subscribe",
  "login",
  "sign in",
  "careers",
  "job opening",
  "employment",
  "press release",
  "media",
  "faq",
  "privacy policy",
  "terms of use",
  "site map",
  "accessibility",
];

// ---------------------------------------------------------------------------
// Scraping logic
// ---------------------------------------------------------------------------

interface RawLink {
  title: string;
  url: string;
}

function extractLinks(html: string, baseUrl: string, keywords: string[]): RawLink[] {
  const $ = cheerio.load(html);
  const links: RawLink[] = [];
  const seen = new Set<string>();

  // Remove navigation noise
  $("nav, footer, header, aside, [role='navigation']").remove();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let fullUrl: string;
    try {
      fullUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    // Skip external links, anchors, and file downloads (except PDFs)
    if (!fullUrl.startsWith("http")) return;
    if (fullUrl.includes("#") && fullUrl.split("#")[0] === baseUrl) return;
    if (/\.(jpg|jpeg|png|gif|svg|zip|doc|docx|xlsx)$/i.test(fullUrl)) return;

    const linkText = $(el).text().trim();
    if (!linkText || linkText.length < 3 || linkText.length > 200) return;

    // Must match at least one keyword
    const lower = linkText.toLowerCase();
    const hasKeyword = keywords.some((kw) => lower.includes(kw));
    if (!hasKeyword) return;

    // Reject links matching non-grant patterns
    if (EXCLUDED_LINK_PATTERNS.some((p) => lower.includes(p))) return;

    // Skip generic homepage links
    if (isGenericHomepage(fullUrl)) return;

    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      links.push({ title: linkText, url: fullUrl });
    }
  });

  return links;
}

async function collectLinks(source: LocalSource): Promise<RawLink[]> {
  const allLinks: RawLink[] = [];
  const seenUrls = new Set<string>();

  for (const url of source.urls) {
    try {
      const response = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: 15000,
        maxRedirects: 5,
      });

      if (response.status === 200 && typeof response.data === "string") {
        const links = extractLinks(response.data, url, source.keywords);
        const newLinks = links.filter((link) => !seenUrls.has(link.url));
        for (const link of newLinks) seenUrls.add(link.url);
        allLinks.push(...newLinks);
      }
    } catch (error) {
      log("iowa-local-grants", `Failed to fetch ${url}`, {
        source: source.sourceName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  return allLinks;
}

async function enrichLink(link: RawLink, source: LocalSource): Promise<GrantData | null> {
  const details = await fetchPageDetails(link.url);

  if (!details?.description) {
    log("iowa-local-grants", "Skipped empty/error page", { source: source.sourceName, title: link.title });
    return null;
  }

  if (!isActualGrantPage(link.url, link.title, details.description)) {
    log("iowa-local-grants", "Skipped non-grant page", { source: source.sourceName, title: link.title });
    return null;
  }

  const parsedAmount = parseGrantAmount(details.description);

  return {
    title: link.title,
    description: details.description,
    sourceUrl: link.url,
    sourceName: source.sourceName,
    deadline: details.deadline,
    grantType: source.grantType,
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: [],
    categories: ["Iowa Local"],
    eligibleExpenses: [],
    amountMin: parsedAmount?.min,
    amountMax: parsedAmount?.max,
    amount: parsedAmount?.raw,
  };
}

async function scrapeSource(source: LocalSource): Promise<GrantData[]> {
  const allLinks = await collectLinks(source);
  const grants: GrantData[] = [];

  for (const link of allLinks.slice(0, 10)) {
    try {
      const grant = await enrichLink(link, source);
      if (grant) grants.push(grant);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      log("iowa-local-grants", `Failed to enrich ${link.url}`, {
        source: source.sourceName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return grants;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeIowaLocalGrants(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const source of LOCAL_SOURCES) {
    try {
      log("iowa-local-grants", `Scraping ${source.name}`, { pages: source.urls.length });
      const grants = await scrapeSource(source);

      for (const grant of grants) {
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      log("iowa-local-grants", `Found ${grants.length} grants`, { source: source.sourceName });
    } catch (error) {
      logError("iowa-local-grants", `Error scraping ${source.sourceName}`, error);
    }
  }

  log("iowa-local-grants", "Total unique grants", {
    count: allGrants.length,
    sources: LOCAL_SOURCES.length,
  });
  return allGrants;
}
