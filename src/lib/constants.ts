// ── Validation constants (shared across API routes and admin UI) ──────────
export const VALID_GRANT_TYPES: readonly string[] = ["FEDERAL", "STATE", "LOCAL", "PRIVATE"];
export const VALID_GENDER_FOCUS: readonly string[] = ["WOMEN", "VETERAN", "MINORITY", "GENERAL", "ANY"];
export const VALID_BUSINESS_STAGE: readonly string[] = ["STARTUP", "EXISTING", "BOTH"];
export const VALID_GRANT_STATUS: readonly string[] = ["OPEN", "CLOSED", "FORECASTED"];

// ── Prisma include for grants with relations ─────────────────────────────
export const GRANT_INCLUDE = {
  categories: true,
  eligibleExpenses: true,
} as const;

// ── UI color maps ────────────────────────────────────────────────────────
export const TYPE_COLORS: Record<string, string> = {
  FEDERAL: "bg-blue-100 text-blue-800",
  STATE: "bg-green-100 text-green-800",
  LOCAL: "bg-orange-100 text-orange-800",
  PRIVATE: "bg-purple-100 text-purple-800",
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-red-100 text-red-800",
  FORECASTED: "bg-amber-100 text-amber-800",
};
