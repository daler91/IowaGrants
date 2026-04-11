import type { GrantFilters } from "@/lib/types";
import { isDefaultSort } from "@/lib/grant-sort";

/**
 * Serialize grant filters + search into URLSearchParams.
 * Single canonical mapping used by fetch, URL sync, and export.
 *
 * Default sort/dir are omitted so shareable links stay short when the
 * user hasn't customized ordering.
 */
export function buildGrantQueryParams(filters: GrantFilters, search: string): URLSearchParams {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (filters.grantType?.length) params.set("grantType", filters.grantType.join(","));
  if (filters.gender?.length) params.set("gender", filters.gender.join(","));
  if (filters.businessStage?.length) params.set("businessStage", filters.businessStage.join(","));
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.eligibleExpense?.length)
    params.set("eligibleExpense", filters.eligibleExpense.join(","));
  if (filters.location) params.set("location", filters.location);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.amountMin) params.set("amountMin", filters.amountMin.toString());
  if (filters.amountMax) params.set("amountMax", filters.amountMax.toString());

  if (!isDefaultSort(filters.sort, filters.dir)) {
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.dir) params.set("dir", filters.dir);
  }

  return params;
}
