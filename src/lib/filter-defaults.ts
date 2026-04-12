/**
 * Canonical default values for the dashboard filter state.
 *
 * Commit 5796e50 introduced "Open + Forecasted" as the intentional default
 * status filter so closed grants stay out of the way until the user asks
 * for them. Both the initial state parser and the "Clear all" action must
 * restore that default; this module gives them one place to agree.
 */

import type { GrantFilters } from "@/lib/types";

// Using a literal array cast is the simplest way to honor the enum shape
// without depending on Prisma types in the client bundle.
export const DEFAULT_STATUS_FILTER = ["OPEN", "FORECASTED"] as NonNullable<GrantFilters["status"]>;

export const DEFAULT_LIMIT = 20;

export function getDefaultFilters(): GrantFilters {
  return {
    status: [...DEFAULT_STATUS_FILTER] as NonNullable<GrantFilters["status"]>,
    page: 1,
    limit: DEFAULT_LIMIT,
  };
}

/**
 * True when the given status array matches the default set (order-insensitive).
 * Used by ActiveFilterChips to skip rendering a chip for the default so the
 * user isn't told they need to "clear" what they never picked.
 */
export function isDefaultStatus(status: GrantFilters["status"] | undefined): boolean {
  if (status?.length !== DEFAULT_STATUS_FILTER.length) return false;
  const lookup = new Set<string>(DEFAULT_STATUS_FILTER);
  return status.every((s) => lookup.has(s));
}
