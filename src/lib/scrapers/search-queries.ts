// ── Expanded search query pool with rotation support ─────────────────────
// ~48 queries organized by category. Anchor queries run every scrape;
// rotating queries are cycled through subsets to stay within API quotas.

const currentYear = new Date().getFullYear();

export interface SearchQuery {
  query: string;
  /** "anchor" queries run every scrape; "rotating" queries are cycled */
  priority: "anchor" | "rotating";
  demographic: "general" | "women" | "minority" | "veteran" | "lgbtq" | "disabled" | "youth";
  geography: "iowa" | "national" | "midwest";
}

// ---------------------------------------------------------------------------
// Iowa-specific anchors — always included in every scrape run
// ---------------------------------------------------------------------------

const IOWA_ANCHORS: SearchQuery[] = [
  {
    query: `Iowa small business grants ${currentYear}`,
    priority: "anchor",
    demographic: "general",
    geography: "iowa",
  },
  {
    query: "Iowa women veteran minority business grants",
    priority: "anchor",
    demographic: "general",
    geography: "iowa",
  },
  {
    query: "Iowa startup rural small business grants",
    priority: "anchor",
    demographic: "general",
    geography: "iowa",
  },
  {
    query: "Des Moines Cedar Rapids small business grants",
    priority: "anchor",
    demographic: "general",
    geography: "iowa",
  },
  {
    query: "Iowa community foundation small business grants",
    priority: "anchor",
    demographic: "general",
    geography: "iowa",
  },
  {
    query: "Iowa economic development grants small business CDBG",
    priority: "anchor",
    demographic: "general",
    geography: "iowa",
  },
];

// ---------------------------------------------------------------------------
// Women-focused rotating queries
// ---------------------------------------------------------------------------

const WOMEN_QUERIES: SearchQuery[] = [
  {
    query: `women entrepreneur grants ${currentYear}`,
    priority: "rotating",
    demographic: "women",
    geography: "national",
  },
  {
    query: "small business grants for women entrepreneurs",
    priority: "rotating",
    demographic: "women",
    geography: "national",
  },
  {
    query: "IFundWomen grants women business",
    priority: "rotating",
    demographic: "women",
    geography: "national",
  },
  {
    query: "SBA women-owned small business grants",
    priority: "rotating",
    demographic: "women",
    geography: "national",
  },
  {
    query: `female founder startup grants ${currentYear}`,
    priority: "rotating",
    demographic: "women",
    geography: "national",
  },
  {
    query: "Amber Grant women business application",
    priority: "rotating",
    demographic: "women",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Minority-focused rotating queries
// ---------------------------------------------------------------------------

const MINORITY_QUERIES: SearchQuery[] = [
  {
    query: `small business grants for minorities ${currentYear}`,
    priority: "rotating",
    demographic: "minority",
    geography: "national",
  },
  {
    query: `Black owned small business grants ${currentYear}`,
    priority: "rotating",
    demographic: "minority",
    geography: "national",
  },
  {
    query: "Hispanic Latino small business grants",
    priority: "rotating",
    demographic: "minority",
    geography: "national",
  },
  {
    query: "Native American small business grants",
    priority: "rotating",
    demographic: "minority",
    geography: "national",
  },
  {
    query: `BIPOC business funding grants ${currentYear}`,
    priority: "rotating",
    demographic: "minority",
    geography: "national",
  },
  {
    query: "NMSDC minority business enterprise grants",
    priority: "rotating",
    demographic: "minority",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Veteran-focused rotating queries
// ---------------------------------------------------------------------------

const VETERAN_QUERIES: SearchQuery[] = [
  {
    query: `small business grants for veterans ${currentYear}`,
    priority: "rotating",
    demographic: "veteran",
    geography: "national",
  },
  {
    query: `veteran entrepreneur grants ${currentYear}`,
    priority: "rotating",
    demographic: "veteran",
    geography: "national",
  },
  {
    query: "military spouse business grants",
    priority: "rotating",
    demographic: "veteran",
    geography: "national",
  },
  {
    query: "SBA veteran business grants SDVOSB",
    priority: "rotating",
    demographic: "veteran",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Other demographics rotating queries
// ---------------------------------------------------------------------------

const OTHER_DEMOGRAPHIC_QUERIES: SearchQuery[] = [
  {
    query: `LGBTQ small business grants ${currentYear}`,
    priority: "rotating",
    demographic: "lgbtq",
    geography: "national",
  },
  {
    query: "disabled entrepreneur small business grants",
    priority: "rotating",
    demographic: "disabled",
    geography: "national",
  },
  {
    query: `young entrepreneur grants under 30 ${currentYear}`,
    priority: "rotating",
    demographic: "youth",
    geography: "national",
  },
  {
    query: "immigrant small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Industry-specific rotating queries
// ---------------------------------------------------------------------------

const INDUSTRY_QUERIES: SearchQuery[] = [
  {
    query: `technology small business grants SBIR STTR ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "agriculture food business grants small business",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: `clean energy green business grants ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "manufacturing small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: `technology startup grants ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "retail small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "restaurant food service small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "healthcare small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Geography-focused rotating queries
// ---------------------------------------------------------------------------

const GEOGRAPHY_QUERIES: SearchQuery[] = [
  {
    query: `nationwide small business grants ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "Midwest small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "midwest",
  },
  {
    query: `rural small business grants Iowa USDA ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "iowa",
  },
  {
    query: `state small business grants ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "city small business grant programs",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "community development small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Funding type rotating queries
// ---------------------------------------------------------------------------

const FUNDING_TYPE_QUERIES: SearchQuery[] = [
  {
    query: "microgrant small business",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "nonprofit foundation grants small business",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "corporate sponsored small business grants",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: `pitch competition small business prizes ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: `small business grant contest ${currentYear}`,
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
  {
    query: "free money small business grants no repayment",
    priority: "rotating",
    demographic: "general",
    geography: "national",
  },
];

// ---------------------------------------------------------------------------
// Combined pool
// ---------------------------------------------------------------------------

export const ALL_SEARCH_QUERIES: SearchQuery[] = [
  ...IOWA_ANCHORS,
  ...WOMEN_QUERIES,
  ...MINORITY_QUERIES,
  ...VETERAN_QUERIES,
  ...OTHER_DEMOGRAPHIC_QUERIES,
  ...INDUSTRY_QUERIES,
  ...GEOGRAPHY_QUERIES,
  ...FUNDING_TYPE_QUERIES,
];

// ---------------------------------------------------------------------------
// Query rotation — deterministic selection for each scrape run
// ---------------------------------------------------------------------------

/**
 * Selects a subset of queries for the current scrape run.
 * Anchor queries are always included; rotating queries are cycled through
 * using a deterministic offset based on the current time period.
 *
 * @param budget  Total number of queries to run (including anchors)
 */
export function selectQueriesForRun(budget: number): SearchQuery[] {
  const anchors = ALL_SEARCH_QUERIES.filter((q) => q.priority === "anchor");
  const rotating = ALL_SEARCH_QUERIES.filter((q) => q.priority === "rotating");

  // Always include all anchor queries
  const selected = [...anchors];

  // Fill remaining budget with rotating queries using a time-based offset
  const rotatingBudget = Math.max(0, budget - anchors.length);
  if (rotatingBudget === 0 || rotating.length === 0) return selected;

  // Offset advances every 6 hours (matches typical cron schedule)
  const periodIndex = Math.floor(Date.now() / (6 * 3600 * 1000));
  const offset = periodIndex % rotating.length;

  for (let i = 0; i < Math.min(rotatingBudget, rotating.length); i++) {
    const idx = (offset + i) % rotating.length;
    selected.push(rotating[idx]);
  }

  return selected;
}
