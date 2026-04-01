import axios from "axios";
import type { GrantData } from "@/lib/types";

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

function isIowaRelevant(opp: SimplerOpportunity): boolean {
  const text = [
    opp.opportunity_title,
    opp.summary?.summary_description,
    opp.agency,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("iowa") ||
    text.includes(" ia ") ||
    text.includes("midwest") ||
    text.includes("rural")
  );
}

function mapToGrantData(opp: SimplerOpportunity): GrantData {
  const deadline = opp.close_date ? new Date(opp.close_date) : undefined;
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
    locations: ["Iowa"],
    industries: [],
    rawData: opp as unknown as Record<string, unknown>,
    categories: opp.category?.category_name ? [opp.category.category_name] : [],
    eligibleExpenses: [],
  };
}

export async function fetchSimplerGrants(): Promise<GrantData[]> {
  const queries = [
    "Iowa small business",
    "Iowa grant",
    "rural development Iowa",
    "economic development Iowa",
    "community development Iowa",
  ];

  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      const response = await axios.post<SimplerResponse>(
        SIMPLER_GRANTS_API,
        {
          query,
          filters: {
            opportunity_status: { one_of: ["posted", "forecasted"] },
          },
          pagination: {
            page_size: 100,
            page_offset: 1,
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      const opportunities = response.data?.data || [];
      const iowaOpps = opportunities.filter(isIowaRelevant);

      for (const opp of iowaOpps) {
        const grant = mapToGrantData(opp);
        if (!seenUrls.has(grant.sourceUrl)) {
          seenUrls.add(grant.sourceUrl);
          allGrants.push(grant);
        }
      }

      console.log(
        `[simpler-grants] Fetched ${opportunities.length} results for "${query}", ${iowaOpps.length} Iowa-relevant`
      );
    } catch (error) {
      console.error(
        `[simpler-grants] Error fetching for "${query}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[simpler-grants] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
