// ── Validation constants (shared across API routes and admin UI) ──────────
export const VALID_GRANT_TYPES: readonly string[] = ["FEDERAL", "STATE", "LOCAL", "PRIVATE"];
export const VALID_GENDER_FOCUS: readonly string[] = [
  "WOMEN",
  "VETERAN",
  "MINORITY",
  "GENERAL",
  "ANY",
];
export const VALID_BUSINESS_STAGE: readonly string[] = ["STARTUP", "EXISTING", "BOTH"];
export const VALID_GRANT_STATUS: readonly string[] = ["OPEN", "CLOSED", "FORECASTED"];

// ── Prisma include for grants with relations ─────────────────────────────
// Detail view loads both relations; the list endpoint only needs category
// names (badges) and skips eligibleExpenses to trim payload size.
export const GRANT_INCLUDE_DETAIL = {
  categories: true,
  eligibleExpenses: true,
} as const;

export const GRANT_INCLUDE_LIST = {
  categories: { select: { name: true } },
} as const;

/** @deprecated Use GRANT_INCLUDE_DETAIL or GRANT_INCLUDE_LIST. */
export const GRANT_INCLUDE = GRANT_INCLUDE_DETAIL;

// Maximum length of Grant.description stored in the DB. PDFs and
// aggressive scrapers can push this into the tens of thousands of
// characters; we cap at write time so API payloads stay bounded.
export const GRANT_DESCRIPTION_MAX_CHARS = 5_000;

export function truncateDescription(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= GRANT_DESCRIPTION_MAX_CHARS) return value;
  return `${value.slice(0, GRANT_DESCRIPTION_MAX_CHARS - 15).trimEnd()}… [truncated]`;
}

// NOTE: Grant type / status / demographic colors now live as semantic
// tokens in `src/app/globals.css` and are mapped via `<Badge variant=...>`
// in `src/components/ui/Badge.tsx`. If you need to render a grant badge,
// import `Badge` and `typeBadgeVariant` / `statusBadgeVariant` from there.
