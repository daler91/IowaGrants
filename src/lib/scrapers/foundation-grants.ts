import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GenderFocus, GrantType, BusinessStage } from "@prisma/client";
import { BROWSER_HEADERS } from "./config";
import { isExcludedByStateRestriction, detectLocationScope, extractDeadline } from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Curated private foundation grant programs for small businesses
// ---------------------------------------------------------------------------

interface FoundationGrant {
  /** Name of the grant program */
  name: string;
  /** URL to the grant program page */
  url: string;
  /** Source name stored in DB */
  sourceName: string;
  /** Known grant details (static, supplemented by scraping) */
  description: string;
  gender: GenderFocus;
  grantType: GrantType;
  businessStage: BusinessStage;
  amountMin?: number;
  amountMax?: number;
  amount?: string;
}

/**
 * Well-known, recurring small business grant programs from private foundations
 * and organizations. These are verified, legitimate programs.
 */
const FOUNDATION_GRANTS: FoundationGrant[] = [
  {
    name: "Amber Grant for Women",
    url: "https://ambergrantsforwomen.com/get-an-amber-grant/",
    sourceName: "amber-grant",
    description:
      "Monthly $10,000 grant awarded to women-owned businesses. Each month's winner is also eligible for an additional $25,000 year-end grant. Open to all women-owned businesses in the US and Canada.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 25000,
    amount: "$10,000 monthly / $25,000 annual",
  },
  {
    name: "Hello Alice Small Business Grant",
    url: "https://helloalice.com/grants/",
    sourceName: "hello-alice",
    description:
      "Hello Alice partners with major corporations to offer grants ranging from $5,000 to $50,000 for small businesses. Programs rotate throughout the year targeting various demographics including women, minorities, veterans, and general small business owners.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 50000,
    amount: "$5,000 - $50,000",
  },
  {
    name: "FedEx Small Business Grant Contest",
    url: "https://www.fedex.com/en-us/small-business/grant-contest.html",
    sourceName: "fedex-grant",
    description:
      "Annual grant contest awarding up to $50,000 in grand prizes plus FedEx Office print and business services. Open to for-profit small businesses in the US with fewer than 99 employees.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 15000,
    amountMax: 50000,
    amount: "Up to $50,000",
  },
  {
    name: "NASE Growth Grants",
    url: "https://www.nase.org/become-a-member/member-benefits/business-resources/growth-grants",
    sourceName: "nase",
    description:
      "The National Association for the Self-Employed (NASE) awards Growth Grants of up to $4,000 to micro-business owners who are NASE members. Grants can be used for marketing, equipment, hiring, or expansion.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 500,
    amountMax: 4000,
    amount: "Up to $4,000",
  },
  {
    name: "Nav Small Business Grant",
    url: "https://www.nav.com/small-business-grant/",
    sourceName: "nav-grant",
    description:
      "Quarterly $10,000 grant for small business owners. Open to US-based for-profit businesses. No restrictions on how grant funds are used.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "Cartier Women's Initiative",
    url: "https://www.cartierwomensinitiative.com/",
    sourceName: "cartier-women",
    description:
      "International entrepreneurship program for women impact entrepreneurs. Provides grants of up to $100,000 along with mentoring, networking, and media visibility. Open to women-run, for-profit businesses worldwide.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 30000,
    amountMax: 100000,
    amount: "$30,000 - $100,000",
  },
  {
    name: "IFundWomen Universal Grant",
    url: "https://ifundwomen.com/grants",
    sourceName: "ifundwomen",
    description:
      "IFundWomen partners with corporations and foundations to offer grants specifically for women entrepreneurs. Grant amounts and availability vary by program cycle. Focus areas include women-owned, BIPOC, and LGBTQ+ businesses.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 25000,
    amount: "$1,000 - $25,000",
  },
  {
    name: "Visa Everywhere Initiative",
    url: "https://usa.visa.com/run-your-business/visa-everywhere-initiative.html",
    sourceName: "visa-initiative",
    description:
      "Global innovation program inviting startups to solve payment and commerce challenges. Winners receive cash prizes and potential partnership with Visa. Open to early-stage and growth-stage startups.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 25000,
    amountMax: 100000,
    amount: "$25,000 - $100,000",
  },
  {
    name: "Walmart Spark Good Community Grant",
    url: "https://walmart.org/how-we-give/local-community-grants",
    sourceName: "walmart-spark",
    description:
      "Local community grants from Walmart stores ranging from $250 to $5,000. Available to organizations and small businesses that serve the local community. Funded through local Walmart and Sam's Club stores.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 250,
    amountMax: 5000,
    amount: "$250 - $5,000",
  },
  {
    name: "Eileen Fisher Women-Owned Business Grant",
    url: "https://www.eileenfisher.com/grants/",
    sourceName: "eileen-fisher",
    description:
      "Annual grants of up to $100,000 for women-owned businesses focused on environmental and social sustainability. Businesses must be majority women-owned and in operation for at least 3 years.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 10000,
    amountMax: 100000,
    amount: "Up to $100,000",
  },
  {
    name: "StreetShares Foundation Veteran Small Business Award",
    url: "https://streetsharesfoundation.org/",
    sourceName: "streetshares",
    description:
      "Awards for veteran and military spouse entrepreneurs. Provides grants, free business services, and mentoring to veteran-owned small businesses. Monthly and annual award cycles.",
    gender: "VETERAN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 15000,
    amount: "$5,000 - $15,000",
  },
  {
    name: "National Black MBA Association Scale-Up Pitch Challenge",
    url: "https://nbmbaa.org/scale-up-pitch-challenge/",
    sourceName: "nbmbaa-pitch",
    description:
      "Annual pitch competition for Black entrepreneurs providing cash grants and business support. Open to early and growth-stage Black-owned businesses in the US.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 50000,
    amount: "Up to $50,000",
  },
];

// Browser-like headers imported from ./config

// ---------------------------------------------------------------------------
// Enrichment: try to scrape current deadline and updated description
// ---------------------------------------------------------------------------

async function enrichFromPage(
  grant: FoundationGrant,
): Promise<{ deadline?: Date; liveDescription?: string }> {
  try {
    const response = await axios.get(grant.url, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    if (response.status !== 200 || typeof response.data !== "string") {
      return {};
    }

    const html = response.data as string;
    const deadline = extractDeadline(html);

    // Try to extract a better description from the live page
    const $ = cheerio.load(html);
    $("nav, footer, script, style, header, aside").remove();

    const bodyText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 1200);

    return {
      deadline,
      liveDescription: bodyText.length > 100 ? bodyText : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchFoundationGrants(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const foundation of FOUNDATION_GRANTS) {
    try {
      const fullText = `${foundation.name} ${foundation.description}`;

      // Skip if restricted to a non-Iowa state
      if (isExcludedByStateRestriction(fullText)) {
        log("foundation-grants", "Skipping state-restricted", { name: foundation.name });
        continue;
      }

      // Enrich with live page data (deadline, updated description)
      const enriched = await enrichFromPage(foundation);

      const description =
        enriched.liveDescription && enriched.liveDescription.length > foundation.description.length
          ? `${foundation.description}\n\n${enriched.liveDescription.slice(0, 800)}`
          : foundation.description;

      const grant: GrantData = {
        title: foundation.name,
        description,
        sourceUrl: foundation.url,
        sourceName: foundation.sourceName,
        amount: foundation.amount,
        amountMin: foundation.amountMin,
        amountMax: foundation.amountMax,
        deadline: enriched.deadline,
        grantType: foundation.grantType,
        status: "OPEN",
        businessStage: foundation.businessStage,
        gender: foundation.gender,
        locations: detectLocationScope(fullText),
        industries: [],
        categories: ["Private Foundation"],
        eligibleExpenses: [],
      };

      if (!seenUrls.has(grant.sourceUrl)) {
        seenUrls.add(grant.sourceUrl);
        allGrants.push(grant);
      }

      // Polite delay between requests
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      logError("foundation-grants", `Error processing ${foundation.name}`, error);
    }
  }

  log("foundation-grants", "Total grants", {
    count: allGrants.length,
    sources: FOUNDATION_GRANTS.length,
  });
  return allGrants;
}
