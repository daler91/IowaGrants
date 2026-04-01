import axios from "axios";
import type { GrantData } from "@/lib/types";

const GRANTS_GOV_API =
  process.env.GRANTS_GOV_API_URL || "https://api.grants.gov/v1/api/search2";

interface GrantsGovOpportunity {
  id: string;
  number: string;
  title: string;
  description?: string;
  agency?: string;
  openDate?: string;
  closeDate?: string;
  awardCeiling?: number;
  awardFloor?: number;
  category?: string;
  status?: string;
  url?: string;
}

interface GrantsGovResponse {
  oppHits?: GrantsGovOpportunity[];
  opportunities?: GrantsGovOpportunity[];
  data?: GrantsGovOpportunity[];
  totalCount?: number;
}

function isIowaRelevant(opp: GrantsGovOpportunity): boolean {
  const text = [opp.title, opp.description, opp.agency]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("iowa") ||
    text.includes(" ia ") ||
    text.includes("all states") ||
    text.includes("nationwide") ||
    text.includes("rural")
  );
}

function mapToGrantData(opp: GrantsGovOpportunity): GrantData {
  const deadline = opp.closeDate ? new Date(opp.closeDate) : undefined;
  const isOpen =
    !deadline || deadline > new Date() ? "OPEN" : ("CLOSED" as const);

  return {
    title: opp.title,
    description: opp.description || opp.title,
    sourceUrl: `https://www.grants.gov/search-results-detail/${opp.id}`,
    sourceName: "grants.gov",
    amount:
      opp.awardFloor || opp.awardCeiling
        ? `$${(opp.awardFloor || 0).toLocaleString()} - $${(opp.awardCeiling || 0).toLocaleString()}`
        : undefined,
    amountMin: opp.awardFloor || undefined,
    amountMax: opp.awardCeiling || undefined,
    deadline,
    grantType: "FEDERAL",
    status: isOpen,
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: [],
    rawData: opp as unknown as Record<string, unknown>,
    categories: [],
    eligibleExpenses: [],
  };
}

export async function fetchGrantsGov(): Promise<GrantData[]> {
  // Broader search strategy: single keywords and agency-based searches
  const keywords = [
    "Iowa",
    "small business",
    "rural development",
    "community development",
    "economic development",
    "workforce development",
    "minority business",
    "women owned business",
  ];

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of keywords) {
    try {
      const response = await axios.post<GrantsGovResponse>(GRANTS_GOV_API, {
        keyword,
        oppStatuses: "posted",
        rows: 100,
        sortBy: "openDate|desc",
      });

      // Handle potential response format differences
      const opportunities =
        response.data.oppHits ||
        response.data.opportunities ||
        response.data.data ||
        [];

      // For "Iowa" keyword, keep all results
      // For broader keywords, filter for Iowa relevance
      const needsFilter = keyword.toLowerCase() !== "iowa";
      const filtered = needsFilter
        ? opportunities.filter(isIowaRelevant)
        : opportunities;

      for (const opp of filtered) {
        const grant = mapToGrantData(opp);
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      console.log(
        `[grants.gov] Fetched ${opportunities.length} results for "${keyword}"${needsFilter ? `, ${filtered.length} Iowa-relevant` : ""}`
      );
    } catch (error) {
      console.error(
        `[grants.gov] Error fetching for "${keyword}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[grants.gov] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
