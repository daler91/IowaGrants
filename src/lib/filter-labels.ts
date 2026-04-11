/**
 * Human labels for filter values. Shared between `GrantFilters` (the
 * sidebar dropdowns), `ActiveFilterChips` (the chip row above the results),
 * and anywhere else that needs to render "STARTUP" as "Starting a Business".
 *
 * Keep in sync with the enums in `src/lib/constants.ts` and `schema.prisma`.
 */

const GRANT_TYPE_LABELS: Record<string, string> = {
  FEDERAL: "Federal",
  STATE: "State",
  LOCAL: "Local",
  PRIVATE: "Private",
};

const GENDER_LABELS: Record<string, string> = {
  WOMEN: "Women-Owned",
  VETERAN: "Veteran-Owned",
  MINORITY: "Minority-Owned",
  GENERAL: "General",
  ANY: "Any",
};

const BUSINESS_STAGE_LABELS: Record<string, string> = {
  STARTUP: "Starting a Business",
  EXISTING: "Existing Business",
  BOTH: "Both",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  FORECASTED: "Forecasted",
};

const EXPENSE_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipment Purchases",
  FACADE_IMPROVEMENT: "Facade / Real Estate",
  JOB_CREATION: "Job Creation / Hiring",
  TECHNOLOGY: "Technology & Software",
  WORKING_CAPITAL: "Working Capital",
  RESEARCH_DEVELOPMENT: "R&D",
  MARKETING_EXPORT: "Marketing & Export",
};

export function labelForGrantType(value: string): string {
  return GRANT_TYPE_LABELS[value] ?? value;
}

export function labelForGender(value: string): string {
  return GENDER_LABELS[value] ?? value;
}

export function labelForBusinessStage(value: string): string {
  return BUSINESS_STAGE_LABELS[value] ?? value;
}

export function labelForStatus(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

export function labelForExpense(value: string): string {
  return EXPENSE_LABELS[value] ?? value;
}

export const FILTER_LABEL_MAPS = {
  grantType: GRANT_TYPE_LABELS,
  gender: GENDER_LABELS,
  businessStage: BUSINESS_STAGE_LABELS,
  status: STATUS_LABELS,
  eligibleExpense: EXPENSE_LABELS,
} as const;
