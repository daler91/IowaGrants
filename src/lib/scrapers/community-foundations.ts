import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import { BROWSER_HEADERS, SCRAPER_TIMEOUT_MS } from "./config";
import { extractDeadline, detectLocationScope, isGenericHomepage, cleanHtmlToText } from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Iowa community foundations — many offer grants for economic development
// ---------------------------------------------------------------------------

interface CommunityFoundation {
  name: string;
  url: string;
  /** Page likely to list available grants/programs */
  grantsPage?: string;
}

const IOWA_FOUNDATIONS: CommunityFoundation[] = [
  {
    name: "Community Foundation of Greater Des Moines",
    url: "https://www.desmoinesfoundation.org",
    grantsPage: "https://www.desmoinesfoundation.org/grants",
  },
  {
    name: "Greater Cedar Rapids Community Foundation",
    url: "https://www.gcrcf.org",
    grantsPage: "https://www.gcrcf.org/grants/",
  },
  {
    name: "Community Foundation of Northeast Iowa",
    url: "https://www.cfneia.org",
    grantsPage: "https://www.cfneia.org/grants",
  },
  {
    name: "Quad Cities Community Foundation",
    url: "https://www.qccommunityfoundation.org",
    grantsPage: "https://www.qccommunityfoundation.org/grants/",
  },
  {
    name: "Siouxland Community Foundation",
    url: "https://www.siouxlandcommunityfoundation.org",
    grantsPage: "https://www.siouxlandcommunityfoundation.org/grants/",
  },
  {
    name: "Community Foundation of Waterloo / Cedar Falls",
    url: "https://www.communityfoundationofwcf.org",
    grantsPage: "https://www.communityfoundationofwcf.org/grants",
  },
  {
    name: "Dubuque Area Community Foundation",
    url: "https://www.dbqfoundation.org",
  },
  {
    name: "Iowa West Foundation",
    url: "https://www.iowawestfoundation.org",
    grantsPage: "https://www.iowawestfoundation.org/grants/",
  },
  {
    name: "Mid-Iowa Health Foundation",
    url: "https://www.midiowahealth.org",
    grantsPage: "https://www.midiowahealth.org/grants/",
  },
  {
    name: "R.J. McElroy Trust",
    url: "https://www.mcelroytrust.org",
    grantsPage: "https://www.mcelroytrust.org/grants/",
  },
  {
    name: "Mason City Foundation",
    url: "https://masoncityfoundation.org",
  },
  {
    name: "Community Foundation of Carroll County",
    url: "https://www.cfcarrollcounty.org",
  },
  {
    name: "Fort Dodge Community Foundation",
    url: "https://fortdodgecf.org",
  },
  {
    name: "Ames Community Foundation",
    url: "https://www.amescf.org",
  },
  {
    name: "Burlington Community Foundation",
    url: "https://www.burlingtoniowa.org",
  },
  {
    name: "Community Foundation of Johnson County",
    url: "https://www.cfjc.org",
    grantsPage: "https://www.cfjc.org/nonprofits/",
  },
  {
    name: "Story County Community Foundation",
    url: "https://www.storycountyfoundation.org",
    grantsPage: "https://www.storycountyfoundation.org/grants",
  },
  {
    name: "Scott County Regional Authority",
    url: "https://www.scottcountyia.com",
  },
  {
    name: "Community Foundation of Greater Muscatine",
    url: "https://www.muscatinecommunityfoundation.org",
    grantsPage: "https://www.muscatinecommunityfoundation.org/grants/",
  },
  {
    name: "Grinnell Area Community Foundation",
    url: "https://www.grinnellareacommunityfoundation.org",
    grantsPage: "https://www.grinnellareacommunityfoundation.org/grants",
  },
  {
    name: "Marshalltown Area Community Foundation",
    url: "https://www.macfoundation.com",
    grantsPage: "https://www.macfoundation.com/grants",
  },
  {
    name: "Pella Community Foundation",
    url: "https://www.pellacommunityfoundation.org",
  },
  {
    name: "Greater Jefferson County Foundation",
    url: "https://www.gjcfoundation.org",
  },
  {
    name: "Winneshiek County Community Foundation",
    url: "https://www.winneshiekcountyfoundation.org",
  },
  {
    name: "Greater Poweshiek Community Foundation",
    url: "https://www.greaterpcf.org",
    grantsPage: "https://www.greaterpcf.org/grants/",
  },
  {
    name: "Community Foundation of Clinton County",
    url: "https://www.clintoncountyfoundation.com",
    grantsPage: "https://www.clintoncountyfoundation.com/grants",
  },
  {
    name: "Wapello County Community Foundation",
    url: "https://wapellocountyfoundation.org",
  },
  {
    name: "Boone County Community Foundation",
    url: "https://www.boonecountyfoundation.org",
  },
  {
    name: "Oskaloosa Area Community Foundation",
    url: "https://www.oacfiowa.org",
  },
  {
    name: "Hardin County Community Endowment Foundation",
    url: "https://www.hardincountyfoundation.org",
  },
  {
    name: "Newton Area Community Foundation",
    url: "https://www.newtoniowa.com",
  },
  {
    name: "Greene County Community Foundation",
    url: "https://www.greenecountyfoundation.org",
  },
  {
    name: "Webster City Area Community Foundation",
    url: "https://www.webstercityfoundation.org",
  },
  {
    name: "Community Foundation of Louisa County",
    url: "https://www.louisacountyfoundation.org",
  },
  {
    name: "Van Buren County Community Foundation",
    url: "https://www.vbccf.org",
  },
  {
    name: "Community Foundation of Madison County",
    url: "https://www.madisoncountyfoundation.org",
  },
  {
    name: "Iowa County Community Foundation",
    url: "https://www.iowacountyfoundation.org",
  },
];

// ---------------------------------------------------------------------------
// Scrape a foundation page for grant-related links
// ---------------------------------------------------------------------------

async function scrapeFoundationForGrants(foundation: CommunityFoundation): Promise<GrantData[]> {
  const grants: GrantData[] = [];
  const pagesToCheck = [
    foundation.grantsPage,
    `${foundation.url}/grants`,
    `${foundation.url}/grants/`,
    `${foundation.url}/apply`,
  ].filter((p): p is string => !!p);

  // Deduplicate pages to check
  const uniquePages = Array.from(new Set(pagesToCheck));

  for (const pageUrl of uniquePages) {
    try {
      const response = await axios.get(pageUrl, {
        headers: BROWSER_HEADERS,
        timeout: SCRAPER_TIMEOUT_MS,
        maxRedirects: 3,
        validateStatus: (s: number) => s < 400,
      });

      if (typeof response.data !== "string") continue;

      const $ = cheerio.load(response.data);
      $("nav, footer, script, style, header, iframe, noscript, svg, aside").remove();

      const pageText = $("main, article, .content, body")
        .first()
        .text()
        .replaceAll(/\s+/g, " ")
        .trim();

      const lowerText = pageText.toLowerCase();

      // Look for small business / economic development grant keywords
      const businessKeywords = [
        "small business",
        "business grant",
        "economic development",
        "entrepreneur",
        "startup",
        "workforce",
        "business development",
      ];

      const hasBusinessGrants = businessKeywords.some((kw) => lowerText.includes(kw));
      if (!hasBusinessGrants) continue;

      // Extract grant program links
      const grantLinks: string[] = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        let fullUrl: string;
        try {
          fullUrl = new URL(href, pageUrl).href;
        } catch {
          return;
        }

        if (isGenericHomepage(fullUrl)) return;
        const lower = fullUrl.toLowerCase();
        const text = $(el).text().toLowerCase();

        if (
          lower.includes("grant") ||
          lower.includes("fund") ||
          lower.includes("program") ||
          lower.includes("apply") ||
          text.includes("grant") ||
          text.includes("apply") ||
          text.includes("application")
        ) {
          grantLinks.push(fullUrl);
        }
      });

      // If the page itself describes a grant, use it directly
      if (lowerText.includes("grant") && lowerText.includes("apply")) {
        const pageTitle =
          $("h1").first().text().trim() || $("title").text().trim() || foundation.name;
        const deadline = extractDeadline(response.data);
        const rawHtml = $("main, article, .content, body").first().html() || "";
        const description = cleanHtmlToText(rawHtml, 800);

        if (description && description.length > 50) {
          grants.push({
            title: `${foundation.name} - ${pageTitle}`,
            description,
            sourceUrl: pageUrl,
            sourceName: "community-foundation",
            grantType: "LOCAL",
            status: deadline && deadline < new Date() ? "CLOSED" : "OPEN",
            businessStage: "BOTH",
            gender: "ANY",
            locations: detectLocationScope(pageText),
            industries: [],
            deadline,
            categories: ["Community Foundation"],
            eligibleExpenses: [],
          });
        }
      }

      // Scrape up to 5 grant-related links from this page
      const seen = new Set<string>(uniquePages);
      for (const link of grantLinks.slice(0, 5)) {
        if (seen.has(link)) continue;
        seen.add(link);

        try {
          await new Promise((r) => setTimeout(r, 1500));
          const subResponse = await axios.get(link, {
            headers: BROWSER_HEADERS,
            timeout: SCRAPER_TIMEOUT_MS,
            maxRedirects: 3,
            validateStatus: (s: number) => s < 400,
          });

          if (typeof subResponse.data !== "string") continue;

          const sub$ = cheerio.load(subResponse.data);
          sub$("nav, footer, script, style, header").remove();

          const subText = sub$("main, article, .content, body")
            .first()
            .text()
            .replaceAll(/\s+/g, " ")
            .trim();

          if (!businessKeywords.some((kw) => subText.toLowerCase().includes(kw))) continue;

          const subTitle = sub$("h1").first().text().trim() || sub$("title").text().trim();
          const subDeadline = extractDeadline(subResponse.data);
          const subRawHtml = sub$("main, article, .content, body").first().html() || "";
          const subDescription = cleanHtmlToText(subRawHtml, 800);

          if (subDescription && subDescription.length > 50) {
            grants.push({
              title: subTitle || `${foundation.name} Grant`,
              description: subDescription,
              sourceUrl: link,
              sourceName: "community-foundation",
              grantType: "LOCAL",
              status: subDeadline && subDeadline < new Date() ? "CLOSED" : "OPEN",
              businessStage: "BOTH",
              gender: "ANY",
              locations: detectLocationScope(subText),
              industries: [],
              deadline: subDeadline,
              categories: ["Community Foundation"],
              eligibleExpenses: [],
            });
          }
        } catch {
          // Skip failed sub-pages
        }
      }

      // Found business grants on this page — no need to try other URL patterns
      break;
    } catch {
      // Try next URL pattern
    }
  }

  return grants;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeCommunityFoundations(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const foundation of IOWA_FOUNDATIONS) {
    try {
      const grants = await scrapeFoundationForGrants(foundation);

      for (const grant of grants) {
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      log("community-foundations", `${foundation.name}: ${grants.length} grants`);
    } catch (error) {
      logError("community-foundations", `Error processing ${foundation.name}`, error);
    }

    // Polite delay between foundations
    await new Promise((r) => setTimeout(r, 1500));
  }

  log("community-foundations", "Total grants", { count: allGrants.length });
  return allGrants;
}
