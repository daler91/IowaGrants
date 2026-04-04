import axios from "axios";
import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";
import { isExcludedByStateRestriction, detectLocationScope, validateDeadline } from "./utils";
import { log, logError } from "@/lib/errors";

const SIMPLER_GRANTS_API = "https://api.simpler.grants.gov/v1/opportunities/search";

interface SimplerOpportunity {
  opportunity_id?: number;
  opportunity_title?: string;
  agency?: string;
  summary?: { summary_description?: string };
  award_floor?: number;
  award_ceiling?: number;
  close_date?: string;
  opportunity_status?: { status_id?: number; description?: string };
  category?: { category_name?: string };
}

interface SimplerResponse {
  data?: SimplerOpportunity[];
  pagination_info?: { total_records?: number };
}

// Specific small-business keywords — no overly broad terms like "business" or "company"
const SMALL_BUSINESS_KEYWORDS = [
  "small business",
  "sba",
  "sbir",
  "sttr",
  "microenterprise",
  "micro-enterprise",
  "women-owned",
  "woman-owned",
  "veteran-owned",
  "minority-owned",
  "small firm",
  "small company",
  "small enterprise",
  "rural business",
  "disadvantaged business",
  "entrepreneur",
  "startup",
  "start-up",
];

// Grants mentioning these are likely NOT for small businesses
const EXCLUSION_KEYWORDS = [
  "university",
  "universities",
  "college",
  "collegiate",
  "k-12",
  "school district",
  "educational institution",
  "hospital",
  "health department",
  "public health",
  "tribal government",
  "tribal nation",
  "indian tribe",
  "state government",
  "state agency",
  "municipality",
  "county government",
  "city government",
  "non-profit organization",
  "nonprofit organization",
  "law enforcement",
  "fire department",
  "research institution",
  "academic research",
  "housing authority",
  "transit authority",
];

function isEligibleOpportunity(opp: SimplerOpportunity): boolean {
  const text = [opp.opportunity_title, opp.summary?.summary_description, opp.agency]
    .filter(Boolean)
    .join(" ");

  if (isExcludedByStateRestriction(text)) return false;

  const lower = text.toLowerCase();

  // Must contain at least one strong small-business keyword
  const hasSmallBizKeyword = SMALL_BUSINESS_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hasSmallBizKeyword) return false;

  // Reject if exclusion keywords present (unless title itself has small biz terms)
  const titleLower = (opp.opportunity_title || "").toLowerCase();
  const hasExclusion = EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasExclusion) {
    const titleHasSmallBiz = SMALL_BUSINESS_KEYWORDS.some((kw) => titleLower.includes(kw));
    if (!titleHasSmallBiz) return false;
  }

  return true;
}

function mapToGrantData(opp: SimplerOpportunity): GrantData {
  const deadline = opp.close_date ? validateDeadline(new Date(opp.close_date)) : undefined;
  const isOpen = !deadline || deadline > new Date() ? "OPEN" : ("CLOSED" as const);

  return {
    title: opp.opportunity_title || "Untitled Opportunity",
    description: opp.summary?.summary_description || opp.opportunity_title || "",
    sourceUrl: `https://simpler.grants.gov/opportunity/${opp.opportunity_id}`,
    sourceName: "simpler-grants",
    amount:
      opp.award_floor || opp.award_ceiling
        ? `$${(opp.award_floor || 0).toLocaleString()} - $${(opp.award_ceiling || 0).toLocaleString()}`
        : undefined,
    amountMin: opp.award_floor || undefined,
    amountMax: opp.award_ceiling || undefined,
    deadline,
    grantType: "FEDERAL",
    status: isOpen,
    businessStage: "BOTH",
    gender: "ANY",
    locations: detectLocationScope(
      `${opp.opportunity_title || ""} ${opp.summary?.summary_description || ""}`,
    ),
    industries: [],
    rawData: opp as unknown as Record<string, unknown>,
    categories: opp.category?.category_name ? [opp.category.category_name] : [],
    eligibleExpenses: [],
  };
}

export async function fetchSimplerGrants(): Promise<GrantData[]> {
  const apiKey = env.SIMPLER_GRANTS_API_KEY;
  if (!apiKey) {
    log("simpler-grants", "SIMPLER_GRANTS_API_KEY not set — skipping");
    return [];
  }

  const queries = [
    "small business grant",
    "women owned small business",
    "minority small business",
    "veteran small business",
    "startup grant",
    "rural small business",
    "Iowa small business",
  ];

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();
  let totalFetched = 0;
  let totalFiltered = 0;

  for (const query of queries) {
    try {
      const response = await axios.post<SimplerResponse>(
        SIMPLER_GRANTS_API,
        {
          query,
          filters: {
            opportunity_status: { one_of: ["posted", "forecasted"] },
            applicant_type: { one_of: ["small_businesses", "individuals"] },
          },
          pagination: {
            page_size: 25,
            page_offset: 1,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          timeout: 30000,
        },
      );

      const opportunities = response.data?.data || [];
      const eligibleOpps = opportunities.filter(isEligibleOpportunity);
      totalFetched += opportunities.length;
      totalFiltered += opportunities.length - eligibleOpps.length;

      for (const opp of eligibleOpps) {
        const grant = mapToGrantData(opp);
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      log("simpler-grants", `Fetched ${opportunities.length} results for "${query}"`, {
        eligible: eligibleOpps.length,
      });
    } catch (error) {
      logError("simpler-grants", `Error fetching for "${query}"`, error);
    }
  }

  log("simpler-grants", "Total unique grants", {
    count: allGrants.length,
    fetched: totalFetched,
    filtered: totalFiltered,
  });
  return allGrants;
}
