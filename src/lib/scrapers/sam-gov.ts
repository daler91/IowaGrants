import axios from "axios";
import type { GrantData } from "@/lib/types";
import { isExcludedByStateRestriction } from "./utils";

const SAM_GOV_API = "https://api.sam.gov/prod/opportunities/v2/search";

interface SamGovOpportunity {
  noticeId: string;
  title: string;
  description?: string;
  department?: string;
  subtier?: string;
  office?: string;
  postedDate?: string;
  responseDeadLine?: string;
  type?: string;
  baseType?: string;
  archiveDate?: string;
  award?: {
    amount?: number;
  };
  placeOfPerformance?: {
    state?: { code?: string; name?: string };
    city?: { name?: string };
  };
  uiLink?: string;
}

interface SamGovResponse {
  totalRecords?: number;
  opportunitiesData?: SamGovOpportunity[];
}

function mapToGrantData(opp: SamGovOpportunity): GrantData {
  const deadline = opp.responseDeadLine
    ? new Date(opp.responseDeadLine)
    : undefined;
  const isOpen =
    !deadline || deadline > new Date() ? "OPEN" : ("CLOSED" as const);

  const locations: string[] = [];
  const perfState = opp.placeOfPerformance?.state?.name?.toLowerCase();
  if (perfState === "iowa" || perfState === "ia") {
    locations.push("Iowa");
  } else {
    locations.push("Nationwide");
  }
  if (opp.placeOfPerformance?.city?.name) {
    locations.push(opp.placeOfPerformance.city.name);
  }

  return {
    title: opp.title,
    description: opp.description || opp.title,
    sourceUrl:
      opp.uiLink ||
      `https://sam.gov/opp/${opp.noticeId}/view`,
    sourceName: "sam.gov",
    amountMin: opp.award?.amount || undefined,
    amountMax: opp.award?.amount || undefined,
    amount: opp.award?.amount
      ? `$${opp.award.amount.toLocaleString()}`
      : undefined,
    deadline,
    grantType: "FEDERAL",
    status: isOpen,
    businessStage: "BOTH",
    gender: "ANY",
    locations,
    industries: [],
    rawData: opp as unknown as Record<string, unknown>,
    categories: [],
    eligibleExpenses: [],
  };
}

export async function fetchSamGov(): Promise<GrantData[]> {
  const apiKey = process.env.SAM_GOV_API_KEY;

  if (!apiKey) {
    console.warn(
      "[sam.gov] SAM_GOV_API_KEY not set — skipping SAM.gov fetch"
    );
    return [];
  }

  const keywords = [
    "small business",
    "small business grant",
    "women owned business",
    "minority business",
    "rural development",
  ];

  const allGrants: GrantData[] = [];
  const seenIds = new Set<string>();

  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const formatDate = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

  for (const keyword of keywords) {
    try {
      const response = await axios.get<SamGovResponse>(SAM_GOV_API, {
        params: {
          api_key: apiKey,
          limit: 100,
          postedFrom: formatDate(sixMonthsAgo),
          postedTo: formatDate(today),
          ptype: "g",
          keyword,
        },
      });

      const opportunities = response.data.opportunitiesData || [];

      for (const opp of opportunities) {
        if (seenIds.has(opp.noticeId)) continue;
        seenIds.add(opp.noticeId);

        const text = `${opp.title} ${opp.description || ""}`;
        if (isExcludedByStateRestriction(text)) continue;

        allGrants.push(mapToGrantData(opp));
      }

      console.log(
        `[sam.gov] Fetched ${opportunities.length} results for "${keyword}"`
      );
    } catch (error) {
      console.error(
        `[sam.gov] Error for "${keyword}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[sam.gov] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
