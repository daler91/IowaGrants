import type { GrantData } from "@/lib/types";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AirtableFieldMapping {
  /** Possible column names for the grant title */
  title: string[];
  /** Possible column names for the description */
  description: string[];
  /** Possible column names for the grant URL / link */
  sourceUrl: string[];
  /** Possible column names for the dollar amount */
  amount: string[];
  /** Possible column names for the deadline */
  deadline: string[];
  /** Possible column names for eligibility info */
  eligibility: string[];
}

export interface AirtableSource {
  name: string;
  sourceName: string;
  baseId: string;
  tableId: string;
  sharedViewId: string;
  sourcePageUrl: string;
  fieldMapping: AirtableFieldMapping;
  defaults: Pick<
    GrantData,
    | "grantType"
    | "status"
    | "businessStage"
    | "gender"
    | "locations"
    | "industries"
    | "categories"
    | "eligibleExpenses"
  >;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

export const DEFAULT_FIELD_MAPPING: AirtableFieldMapping = {
  title: ["Name", "Grant Name", "Title", "Grant", "Program Name", "Organization"],
  description: ["Description", "Details", "About", "Summary", "Notes", "Info"],
  sourceUrl: ["Link", "URL", "Website", "Apply Link", "Application Link", "Apply", "Grant Link"],
  amount: ["Amount", "Award", "Award Amount", "Grant Amount", "Funding", "Prize", "Max Award"],
  deadline: [
    "Deadline",
    "Due Date",
    "Close Date",
    "Closing Date",
    "End Date",
    "Expires",
    "Application Deadline",
  ],
  eligibility: [
    "Eligibility",
    "Who Can Apply",
    "Requirements",
    "Eligible",
    "Qualifications",
    "Who is Eligible",
  ],
};

export const AIRTABLE_SOURCES: AirtableSource[] = [
  {
    name: "ladies-who-launch",
    sourceName: "ladies-who-launch",
    baseId: env.LWL_AIRTABLE_BASE_ID,
    tableId: env.LWL_AIRTABLE_TABLE_NAME,
    sharedViewId: env.LWL_AIRTABLE_VIEW_ID,
    sourcePageUrl: "https://www.ladieswholaunch.org/small-business-grants",
    fieldMapping: DEFAULT_FIELD_MAPPING,
    defaults: {
      grantType: "PRIVATE",
      status: "OPEN",
      businessStage: "BOTH",
      gender: "WOMEN",
      locations: ["Nationwide"],
      industries: [],
      categories: [],
      eligibleExpenses: [],
    },
  },
];
