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

function detectGenderFocus(searchText: string, current: GrantData["gender"]): GrantData["gender"] {
  if (current !== "ANY") return current;
  for (const [focus, keywords] of Object.entries(GENDER_KEYWORDS)) {
    if (keywords.length > 0 && findKeywords(searchText, keywords)) {
      return focus as GenderFocus;
    }
  }
  return current;
}

function detectBusinessStage(searchText: string, current: GrantData["businessStage"]): GrantData["businessStage"] {
  if (current !== "BOTH") return current;
  const hasStartup = findKeywords(searchText, STAGE_KEYWORDS.STARTUP);
  const hasExisting = findKeywords(searchText, STAGE_KEYWORDS.EXISTING);
  if (hasStartup && !hasExisting) return "STARTUP";
  if (hasExisting && !hasStartup) return "EXISTING";
  return current;
}

function enrichLocations(searchText: string, locations: string[]): string[] {
  const foundIowaLocations = IOWA_LOCATIONS.filter((loc) =>
    searchText.includes(loc)
  );
  if (foundIowaLocations.length === 0) return locations;

  if (locations.includes("Nationwide")) {
    return ["Nationwide", "Iowa", ...foundIowaLocations];
  }
  if (locations.length <= 1 && locations[0] === "Iowa") {
    return ["Iowa", ...foundIowaLocations];
  }
  return locations;
}

function refineGrantType(searchText: string, current: GrantData["grantType"]): GrantData["grantType"] {
  if (current !== "PRIVATE" && current !== "STATE") return current;
  const federalKeywords = ["federal", "sba", "usda", "department of", "u.s. government", "u.s. department"];
  return findKeywords(searchText, federalKeywords) ? "FEDERAL" : current;
}

export function categorizeGrant(grant: GrantData): GrantData {
  const searchText = `${grant.title} ${grant.description} ${grant.eligibility || ""}`;

  grant.gender = detectGenderFocus(searchText, grant.gender);
  grant.businessStage = detectBusinessStage(searchText, grant.businessStage);

  if (grant.eligibleExpenses.length === 0) {
    grant.eligibleExpenses = findAllMatches(searchText, EXPENSE_KEYWORDS);
  }
  if (grant.industries.length === 0) {
    grant.industries = findAllMatches(searchText, INDUSTRY_KEYWORDS);
  }

  grant.locations = enrichLocations(searchText, grant.locations);
  grant.grantType = refineGrantType(searchText, grant.grantType);

  return grant;
}

export function categorizeAll(grants: GrantData[]): GrantData[] {
  return grants.map(categorizeGrant);
}
