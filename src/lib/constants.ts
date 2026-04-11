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
export const GRANT_INCLUDE = {
  categories: true,
  eligibleExpenses: true,
} as const;

// NOTE: Grant type / status / demographic colors now live as semantic
// tokens in `src/app/globals.css` and are mapped via `<Badge variant=...>`
// in `src/components/ui/Badge.tsx`. If you need to render a grant badge,
// import `Badge` and `typeBadgeVariant` / `statusBadgeVariant` from there.
