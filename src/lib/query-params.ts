import type { GrantFilters } from "@/lib/types";

/**
 * Serialize grant filters + search into URLSearchParams.
 * Single canonical mapping used by fetch, URL sync, and export.
 */
export function buildGrantQueryParams(
  filters: GrantFilters,
  search: string,
): URLSearchParams {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (filters.grantType?.length) params.set("grantType", filters.grantType.join(","));
  if (filters.gender?.length) params.set("gender", filters.gender.join(","));
  if (filters.businessStage?.length) params.set("businessStage", filters.businessStage.join(","));
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.eligibleExpense?.length)
    params.set("eligibleExpense", filters.eligibleExpense.join(","));
  if (filters.location) params.set("location", filters.location);
  if (filters.amountMin) params.set("amountMin", filters.amountMin.toString());
  if (filters.amountMax) params.set("amountMax", filters.amountMax.toString());

  return params;
}
