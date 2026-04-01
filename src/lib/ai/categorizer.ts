import type { GrantData } from "@/lib/types";
import type { GenderFocus, BusinessStage } from "@prisma/client";

const GENDER_KEYWORDS: Record<GenderFocus, string[]> = {
  WOMEN: [
    "women",
    "woman",
    "female",
    "women-owned",
    "woman-owned",
    "wbe",
    "wosb",
  ],
  VETERAN: ["veteran", "vet", "military", "service-disabled", "sdvosb", "vosb"],
  MINORITY: [
    "minority",
    "minorities",
    "mbe",
    "disadvantaged",
    "underserved",
    "bipoc",
    "african american",
    "hispanic",
    "latino",
    "native american",
    "tribal",
  ],
  GENERAL: [],
  ANY: [],
};

const STAGE_KEYWORDS: Record<BusinessStage, string[]> = {
  STARTUP: [
    "startup",
    "start-up",
    "new business",
    "launch",
    "starting a business",
    "aspiring entrepreneur",
    "early stage",
    "seed",
    "pre-revenue",
  ],
  EXISTING: [
    "existing business",
    "established",
    "expansion",
    "growth",
    "scaling",
    "operating business",
  ],
  BOTH: [],
};

const EXPENSE_KEYWORDS: Record<string, string[]> = {
  EQUIPMENT: [
    "equipment",
    "machinery",
    "tools",
    "hardware",
    "vehicle",
    "fixtures",
  ],
  FACADE_IMPROVEMENT: [
    "facade",
    "renovation",
    "building",
    "storefront",
    "real estate",
    "commercial property",
    "construction",
    "improvement",
    "rehabilitation",
  ],
  JOB_CREATION: [
    "job creation",
    "hiring",
    "workforce",
    "employment",
    "training",
    "employees",
    "new jobs",
    "positions",
  ],
  TECHNOLOGY: [
    "technology",
    "software",
    "digital",
    "IT",
    "cybersecurity",
    "automation",
    "computer",
    "tech upgrade",
  ],
  WORKING_CAPITAL: [
    "working capital",
    "operating",
    "general purpose",
    "operations",
    "day-to-day",
  ],
  RESEARCH_DEVELOPMENT: [
    "research",
    "development",
    "R&D",
    "innovation",
    "prototype",
    "sbir",
    "sttr",
  ],
  MARKETING_EXPORT: [
    "marketing",
    "export",
    "trade",
    "international",
    "market expansion",
    "promotion",
  ],
};

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  Agriculture: ["agriculture", "farm", "farming", "rural", "agri", "crop"],
  Manufacturing: ["manufacturing", "industrial", "production", "factory"],
  Technology: ["technology", "tech", "software", "IT", "digital", "cyber"],
  Healthcare: ["health", "medical", "healthcare", "biotech", "pharmaceutical"],
  Retail: ["retail", "store", "shop", "commerce", "e-commerce"],
  "Food & Beverage": ["food", "restaurant", "beverage", "culinary", "catering"],
  Construction: ["construction", "building", "contractor", "trades"],
  "Professional Services": [
    "consulting",
    "professional",
    "accounting",
    "legal",
  ],
  "Arts & Culture": ["arts", "culture", "creative", "design", "media"],
  Education: ["education", "training", "school", "learning"],
  "Clean Energy": [
    "clean energy",
    "renewable",
    "solar",
    "wind",
    "sustainability",
    "green",
  ],
};

export const IOWA_LOCATIONS: string[] = [
  "Des Moines",
  "Cedar Rapids",
  "Davenport",
  "Sioux City",
  "Iowa City",
  "Waterloo",
  "Ames",
  "West Des Moines",
  "Council Bluffs",
  "Dubuque",
  "Ankeny",
  "Urbandale",
  "Marion",
  "Bettendorf",
  "Mason City",
  "Fort Dodge",
  "Burlington",
  "Marshalltown",
  "Clinton",
  "Muscatine",
  "Polk County",
  "Linn County",
  "Scott County",
  "Johnson County",
  "Black Hawk County",
  "Woodbury County",
  "Story County",
  "Pottawattamie County",
  "Dubuque County",
  "Dallas County",
];

function findKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function findAllMatches(
  text: string,
  keywordMap: Record<string, string[]>
): string[] {
  const matches: string[] = [];
  for (const [key, keywords] of Object.entries(keywordMap)) {
    if (findKeywords(text, keywords)) {
      matches.push(key);
    }
  }
  return matches;
}

export function categorizeGrant(grant: GrantData): GrantData {
  const searchText = `${grant.title} ${grant.description} ${grant.eligibility || ""}`;

  // Gender focus detection
  if (grant.gender === "ANY") {
    for (const [focus, keywords] of Object.entries(GENDER_KEYWORDS)) {
      if (keywords.length > 0 && findKeywords(searchText, keywords)) {
        grant.gender = focus as GenderFocus;
        break;
      }
    }
  }

  // Business stage detection
  if (grant.businessStage === "BOTH") {
    const hasStartup = findKeywords(searchText, STAGE_KEYWORDS.STARTUP);
    const hasExisting = findKeywords(searchText, STAGE_KEYWORDS.EXISTING);
    if (hasStartup && !hasExisting) grant.businessStage = "STARTUP";
    else if (hasExisting && !hasStartup) grant.businessStage = "EXISTING";
  }

  // Eligible expenses detection
  if (grant.eligibleExpenses.length === 0) {
    grant.eligibleExpenses = findAllMatches(searchText, EXPENSE_KEYWORDS);
  }

  // Industry detection
  if (grant.industries.length === 0) {
    grant.industries = findAllMatches(searchText, INDUSTRY_KEYWORDS);
  }

  // Location enrichment
  const foundIowaLocations = IOWA_LOCATIONS.filter((loc) =>
    searchText.includes(loc)
  );

  if (grant.locations.includes("Nationwide")) {
    // For nationwide grants, add Iowa specifics if mentioned but keep Nationwide
    if (foundIowaLocations.length > 0) {
      grant.locations = ["Nationwide", "Iowa", ...foundIowaLocations];
    }
  } else if (
    grant.locations.length <= 1 &&
    grant.locations[0] === "Iowa"
  ) {
    // Existing logic for Iowa-specific grants
    if (foundIowaLocations.length > 0) {
      grant.locations = ["Iowa", ...foundIowaLocations];
    }
  }

  // Grant type refinement — detect federal grants miscategorized as PRIVATE/STATE
  if (grant.grantType === "PRIVATE" || grant.grantType === "STATE") {
    const federalKeywords = ["federal", "sba", "usda", "department of", "u.s. government", "u.s. department"];
    if (findKeywords(searchText, federalKeywords)) {
      grant.grantType = "FEDERAL";
    }
  }

  return grant;
}

export function categorizeAll(grants: GrantData[]): GrantData[] {
  return grants.map(categorizeGrant);
}
