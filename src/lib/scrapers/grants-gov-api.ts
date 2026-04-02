import axios from "axios";
import type { GrantData } from "@/lib/types";
import { detectLocationScope, isExcludedByStateRestriction } from "./utils";

/**
 * Grants.gov Search API Scraper
 *
 * Uses the free, no-auth-required v1/api/search2 endpoint to find
 * small business grants from the federal grants database.
 *
 * API docs: https://grants.gov/api/api-guide
 */

const GRANTS_GOV_API_URL =
  process.env.GRANTS_GOV_API_URL || "https://api.grants.gov/v1/api/search2";

// Search queries targeting small business grants
const SEARCH_QUERIES = [
  "small business",
  "small business grant",
  "women owned business",
  "minority business enterprise",
  "veteran owned small business",
  "startup business",
  "rural small business",
];

// Max records per query (API default is 25, max likely 100)
const RECORDS_PER_QUERY = 25;

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface GrantsGovHit {
  id?: string;
  number?: string;
  title?: string;
  agency?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: Array<{ cfda: string; cfdaDescription?: string }>;
  description?: string;
  synopsis?: string;
  awardCeiling?: number;
  awardFloor?: number;
  estimatedFunding?: number;
  eligibleApplicants?: string;
  additionalEligibilityInfo?: string;
  fundingActivityCategories?: string;
}

interface GrantsGovResponse {
  hitCount?: number;
  oppHits?: GrantsGovHit[];
  // Some response shapes nest under data
  data?: {
    hitCount?: number;
    oppHits?: GrantsGovHit[];
  };
}

// ---------------------------------------------------------------------------
// API fetching
// ---------------------------------------------------------------------------

async function searchGrantsGov(keyword: string): Promise<GrantsGovHit[]> {
  try {
    const response = await axios.post(
      GRANTS_GOV_API_URL,
      {
        keyword,
        oppStatuses: ["posted", "forecasted"],
        rows: RECORDS_PER_QUERY,
        sortBy: "openDate|desc",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
        },
        timeout: 20000,
      }
    );

    const body = response.data as GrantsGovResponse;

    // Handle both response shapes
    const hits = body.oppHits || body.data?.oppHits || [];
    return hits;
  } catch (error) {
    console.error(
      `[grants-gov-api] Search failed for "${keyword}":`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Transform to GrantData
// ---------------------------------------------------------------------------

function parseHitAmounts(hit: GrantsGovHit): { amount?: string; amountMin?: number; amountMax?: number } {
  if (hit.awardFloor || hit.awardCeiling) {
    const amountMin = hit.awardFloor || undefined;
    const amountMax = hit.awardCeiling || undefined;
    let amount: string | undefined;
    if (amountMin && amountMax) {
      amount = `$${amountMin.toLocaleString()} - $${amountMax.toLocaleString()}`;
    } else if (amountMax) {
      amount = `Up to $${amountMax.toLocaleString()}`;
    } else if (amountMin) {
      amount = `$${amountMin.toLocaleString()}`;
    }
    return { amount, amountMin, amountMax };
  } else if (hit.estimatedFunding) {
    return {
      amount: `$${hit.estimatedFunding.toLocaleString()} (estimated total)`,
      amountMax: hit.estimatedFunding,
    };
  }
  return {};
}

function hitToGrantData(hit: GrantsGovHit): GrantData | null {
  const title = hit.title?.trim();
  if (!title) return null;

  const oppNumber = hit.number || hit.id || "";
  const sourceUrl = oppNumber
    ? `https://grants.gov/search-results-detail/${oppNumber}`
    : "https://grants.gov/";

  const description = hit.synopsis || hit.description || title;
  const fullText = `${title} ${description} ${hit.eligibleApplicants || ""} ${hit.additionalEligibilityInfo || ""}`;

  // Skip grants restricted to non-Iowa states
  if (isExcludedByStateRestriction(fullText)) return null;

  // Parse amounts
  const { amount, amountMin, amountMax } = parseHitAmounts(hit);

  // Parse deadline
  let deadline: Date | undefined;
  if (hit.closeDate) {
    const d = new Date(hit.closeDate);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2024) {
      deadline = d;
    }
  }

  // Determine status
  const status = hit.oppStatus === "forecasted" ? "FORECASTED" as const : "OPEN" as const;

  // Build eligibility string
  const eligibility = [hit.eligibleApplicants, hit.additionalEligibilityInfo]
    .filter(Boolean)
    .join(". ")
    .slice(0, 1000) || undefined;

  const locations = detectLocationScope(fullText);

  return {
    title,
    description: description.slice(0, 2000),
    sourceUrl,
    sourceName: "grants-gov-api",
    amount,
    amountMin,
    amountMax,
    deadline,
    eligibility,
    grantType: "FEDERAL",
    status,
    businessStage: "BOTH",
    gender: "ANY",
    locations: locations.length > 0 ? locations : ["Nationwide"],
    industries: [],
    categories: [],
    eligibleExpenses: [],
    rawData: {
      oppNumber,
      agency: hit.agency,
      fundingCategories: hit.fundingActivityCategories,
      cfdaList: hit.cfdaList,
    },
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchGrantsGovApi(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of SEARCH_QUERIES) {
    console.log(`[grants-gov-api] Searching: "${keyword}"...`);
    const hits = await searchGrantsGov(keyword);

    let added = 0;
    for (const hit of hits) {
      const grant = hitToGrantData(hit);
      if (!grant) continue;

      if (seenUrls.has(grant.sourceUrl)) continue;
      seenUrls.add(grant.sourceUrl);

      allGrants.push(grant);
      added++;
    }

    console.log(`[grants-gov-api] "${keyword}": ${hits.length} hits → ${added} new grants`);

    // Small delay between API calls (be polite)
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[grants-gov-api] Total unique grants: ${allGrants.length}`);
  return allGrants;
}
